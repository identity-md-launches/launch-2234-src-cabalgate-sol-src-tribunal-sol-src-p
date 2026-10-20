import {
  pendingState,
  LETTERBOX,
  Q96,
  ceil,
  min as minBig,
  max as maxBig,
  sharePoints,
  factParts,
} from "./models";
import { returnedEscrow } from "./appeal";
import {
  estimateHookOutput,
  priceLimit,
  bandOf,
  bandAmount0,
  unpackDelta,
} from "./swap-math";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  encodeAbiParameters,
  encodeFunctionData,
  decodeEventLog,
  parseAbi,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { useApp, useRead, useTx, receiptEvents } from "./context";
import { APP, erc20Abi, swapAbi, quoterAbi } from "./config";
import {
  amount,
  clock,
  span,
  smallAmount,
  short,
  con,
  read,
  readPlea,
  tokenAmount,
  duration,
  heldTime,
  utc,
  val,
  cashback,
} from "./chain";
import {
  Action,
  Icon,
  FactCells,
  Stamp,
  AmountInput,
  ApprovedAction,
  Costs,
  Empty,
  Meter,
  Notice,
  Panel,
  PleaCard,
  TextBox,
  Title,
  TradingGate,
  textCheck,
  Countdown,
} from "./components";
export function parseAmount(s: string, decimals = 18) {
  try {
    s = s.replaceAll(",", "");
    if (!/^\d+(\.\d*)?$/.test(s)) return 0n;
    return parseUnits(s, decimals);
  } catch {
    return 0n;
  }
}
export function WalletBalances() {
  const { r, s, now } = useApp();
  const { address } = useAccount();
  const result = useRead(
    async () => {
      const [
        plea,
        pair,
        basis,
        pending,
        executed,
        denied,
        lapsed,
        last,
        name,
        seat,
        claims,
      ] = await Promise.all([
        read(r, "PLEA", "balanceOf", [address]),
        read(r, "PairToken", "balanceOf", [address]),
        read(r, "PleaHook", "basisOf", [address]),
        read(r, "CabalGate", "pendingOf", [address]),
        read(r, "CabalGate", "lastExecutedAt", [address]),
        read(r, "CabalGate", "lastDeniedAt", [address]),
        read(r, "CabalGate", "lastLapsedAt", [address]),
        read(r, "CabalGate", "lastPleaOf", [address]),
        read(r, "Letterbox", "nameOf", [address]),
        read(r, "Seasons", "holdsSeat", [address]),
        r.client.readContract({
          address: r.network.uniswapV4.poolManager,
          abi: [
            {
              type: "function",
              name: "balanceOf",
              stateMutability: "view",
              inputs: [{ type: "address" }, { type: "uint256" }],
              outputs: [{ type: "uint256" }],
            },
          ],
          functionName: "balanceOf",
          args: [address!, BigInt(r.addresses.PairToken)],
        }),
      ]);
      const pendingPlea = pending
        ? await readPlea(r, pending, val(s, "CabalGate.intake"))
        : undefined;
      return {
        pendingPlea,
        plea,
        pair,
        basis,
        pending,
        executed,
        denied,
        lapsed,
        last,
        name,
        seat,
        claims,
        cooldown:
          Math.max(Number(executed), Number(denied), Number(lapsed)) +
          Number(con(s, "CabalGate.COOLDOWN")),
      };
    },
    [address],
    !!address && !!s,
  );
  if (result.data) {
    const state = pendingState(
      result.data.pendingPlea,
      now,
      Number(con(s, "CabalGate.EXECUTE_WINDOW")),
      Number(con(s, "CabalGate.PENDING_EXPIRY")),
      Number(result.data.lapsed),
    );
    return {
      ...result,
      data: {
        ...result.data,
        ...state,
        cooldown:
          Math.max(
            Number(result.data.executed),
            Number(result.data.denied),
            state.lapsedAt,
          ) + Number(con(s, "CabalGate.COOLDOWN")),
      },
    };
  }
  return result as typeof result & { data?: any };
}
const transferAbi = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export async function poolQuote(
  r: any,
  s: any,
  raw: bigint,
  selling: boolean,
  extra?: bigint,
) {
  const [sqrt, market, wall, liveExtra] = await Promise.all([
    read(r, "PleaHook", "currentSqrtPriceX96"),
    read(r, "PleaHook", "market"),
    read(r, "PleaHook", "wall"),
    read(r, "PleaHook", "launchExtraBps"),
  ]);
  const launchExtra = extra ?? BigInt(liveExtra);
  return estimateHookOutput({
    amount: raw,
    zeroForOne: !selling,
    sqrt,
    bands: [bandOf(market), bandOf(wall)],
    inputBps: BigInt(
      selling
        ? con(s, "PleaHook.PLEA_BURN_BPS")
        : BigInt(con(s, "PleaHook.IMD_FEE_BPS")) + launchExtra,
    ),
    outputBps: BigInt(
      con(s, selling ? "PleaHook.IMD_FEE_BPS" : "PleaHook.PLEA_BURN_BPS"),
    ),
  });
}
export function Buy() {
  const { r, s, now, toast } = useApp(),
    { address } = useAccount(),
    balance = WalletBalances();
  const [input, setInput] = useState(""),
    [selling, setSelling] = useState(false),
    [slip, setSlip] = useState(100),
    [revision, setRevision] = useState(0),
    [approved, setApproved] = useState(false),
    [fill, setFill] = useState(""),
    [maxRaw, setMaxRaw] = useState<bigint>();
  const tx = useTx(`${input}:${selling}:${slip}:${maxRaw}`),
    dead = !!val(s, "CabalGate.diedAt"),
    pair = s?.constants.pairSymbol || "imdTEST",
    unit = selling ? "PLEA" : pair,
    raw = maxRaw ?? parseAmount(input);
  const inputToken = selling ? r.addresses.PLEA : r.addresses.PairToken,
    available = selling ? balance.data?.plea : balance.data?.pair;
  const launch = Number(val(s, "PleaHook.launchedAt")),
    window = Number(con(s, "PleaHook.LAUNCH_WINDOW")),
    launchActive = !!val(s, "PleaHook.seeded") && now < launch + window;
  const extra = launchActive
    ? BigInt(
        Math.floor(
          (Number(con(s, "PleaHook.LAUNCH_EXTRA_BPS")) *
            (launch + window - now)) /
            window,
        ),
      )
    : 0n;
  const quote = useRead(
    async () => {
      const key = val(s, "PleaHook.poolKey"),
        zeroForOne = key.currency0.toLowerCase() === inputToken.toLowerCase(),
        hookData = address
          ? encodeAbiParameters([{ type: "address" }], [address])
          : "0x";
      const estimate = await poolQuote(r, s!, raw, selling, extra);
      return { ...estimate, key, zeroForOne, hookData, at: Date.now() };
    },
    [raw.toString(), selling, address, slip],
    !!s && raw > 0n && !!val(s, "PleaHook.seeded"),
  );
  const allowance = useRead(
    () =>
      r.client.readContract({
        address: inputToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, APP.swapRouter],
      }),
    [address, inputToken, revision],
    !!address && !!s,
  );
  const needsApproval = allowance.data !== undefined && allowance.data < raw;
  const cap = con(s, "PleaHook.LAUNCH_MAX_BUY"),
    capError =
      launchActive && !selling && quote.data && quote.data.gross > cap
        ? `This buy would take ${tokenAmount(quote.data.gross, s)} before the burn, above the ${tokenAmount(cap, s)} launch cap. Lower the amount or wait until ${clock(launch + window)}.`
        : "";
  const invalid = available !== undefined && raw > available;
  const amountReason = !val(s, "PleaHook.seeded")
    ? "Trading is not open yet."
    : raw <= 0n
      ? `Enter how much ${unit} to ${selling ? "sell" : "pay"}, or press Max. The quote and the fees show once there is an amount.`
      : invalid
        ? `You have ${tokenAmount(available, s, !selling)}. Lower the amount or press Max.`
        : capError;
  const reason =
    amountReason ||
    (!needsApproval
      ? quote.error ||
        (!quote.data ? "Waiting for the quote from the pool." : "")
      : "");
  const minOut = quote.data
    ? (quote.data.out * BigInt(10000 - slip)) / 10000n
    : undefined;
  const normal = BigInt(con(s, "PleaHook.IMD_FEE_BPS") || 0),
    rate = normal + extra,
    fee = (raw * rate) / (10000n + rate),
    reaches = raw - fee;
  const feePart = (key: string) =>
      (reaches * BigInt(con(s, `PleaHook.${key}`) || 0)) / 10000n,
    cashbackNow = feePart("CASHBACK_BPS");
  const payout = useRead(
    async () => {
      const own =
        BigInt(val(s, "PleaHook.imdInMarket")) +
        BigInt(val(s, "PleaHook.retainClaims")) +
        bandAmount0(
          bandOf(val(s, "PleaHook.wall")),
          BigInt(val(s, "PleaHook.currentSqrtPriceX96")),
        );
      const needed =
        feePart("CASHBACK_BPS") +
        feePart("OWNER_BPS") +
        (dead ? 0n : feePart("PRIZE_BPS"));
      if (own >= needed) return "plain";
      const pmBalance = await read(r, "PairToken", "balanceOf", [
        r.network.uniswapV4.poolManager,
      ]);
      return pmBalance >= needed
        ? "plain"
        : own + fee < BigInt(con(s, "PleaHook.PAYOUT_RESERVE"))
          ? "pool"
          : "claims";
    },
    [raw.toString(), selling],
    !!s && raw > 0n && !selling,
  );
  async function buy() {
    if (needsApproval) {
      setApproved(true);
      if (
        await tx.send(
          "",
          "approve",
          [],
          {
            to: inputToken,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [APP.swapRouter, raw],
            }),
          },
          {
            prepare:
              launchActive && !selling
                ? async () => {
                    const q = await poolQuote(r, s!, raw, false);
                    if (q.gross > BigInt(cap))
                      throw Error(
                        `This buy exceeds the ${tokenAmount(cap, s)} launch cap. Lower the amount or wait until ${clock(launch + window)}.`,
                      );
                  }
                : undefined,
          },
        )
      )
        setRevision((n) => n + 1);
      return;
    }
    setApproved(false);
    await tx.send("", "swap", [], undefined, {
      prepare: async () => {
        const q = await poolQuote(r, s!, raw, selling),
          key = val(s, "PleaHook.poolKey"),
          zeroForOne = key.currency0.toLowerCase() === inputToken.toLowerCase(),
          hookData = encodeAbiParameters([{ type: "address" }], [address!]);
        const args = [
          key,
          {
            zeroForOne,
            amountSpecified: -raw,
            sqrtPriceLimitX96: priceLimit(q.next, slip, zeroForOne),
          },
          { takeClaims: false, settleUsingBurn: false },
          hookData,
        ] as const;
        const simulation = await r.client.simulateContract({
          address: APP.swapRouter,
          abi: swapAbi,
          functionName: "swap",
          args,
          account: address!,
        });
        const delta = unpackDelta(simulation.result),
          spent = -(zeroForOne ? delta[0] : delta[1]);
        if (spent < raw)
          throw Error(
            `The price moved more than ${slip / 100}%. Nothing was ${selling ? "sold" : "bought"}; your ${unit} stays in your wallet. Try again, or raise the slippage to ${slip < 100 ? 1 : 2}%.`,
          );
        return {
          to: APP.swapRouter,
          data: encodeFunctionData({
            abi: swapAbi,
            functionName: "swap",
            args,
          }),
        };
      },
      toast: (receipt) => {
        const events = receiptEvents(r, receipt),
          transfers = receipt.logs.flatMap((log) => {
            try {
              return [
                {
                  ...decodeEventLog({
                    abi: transferAbi,
                    data: log.data,
                    topics: log.topics,
                  }),
                  address: log.address,
                },
              ];
            } catch {
              return [];
            }
          }) as any[];
        let spent = transfers
          .filter(
            (l) =>
              l.address.toLowerCase() === inputToken.toLowerCase() &&
              l.args.from.toLowerCase() === address?.toLowerCase(),
          )
          .reduce((n, l) => n + l.args.value, 0n);
        const refund = events
          .filter(
            (e) =>
              e.eventName === "FeeRefunded" &&
              e.args.trader?.toLowerCase() === address?.toLowerCase(),
          )
          .reduce((n, e) => n + BigInt(e.args.amount || 0n), 0n);
        spent -= refund;
        const outToken = selling ? r.addresses.PairToken : r.addresses.PLEA;
        const received = transfers
          .filter(
            (l) =>
              l.address.toLowerCase() === outToken.toLowerCase() &&
              l.args.to.toLowerCase() === address?.toLowerCase(),
          )
          .reduce((n, l) => n + l.args.value, 0n);
        const text = selling
          ? `Sold ${tokenAmount(spent, s, false, 0, "up")} for ${tokenAmount(received, s, true)}.`
          : `Bought ${tokenAmount(received, s)} for ${tokenAmount(spent, s, true, 2, "up")}.`;
        const cash = events
          .filter((e) =>
            [
              "CashbackStacked",
              "CashbackPaidPlain",
              "CashbackPaidClaims",
            ].includes(e.eventName),
          )
          .reduce((n, e) => n + BigInt(e.args.amount), 0n);
        const body = events.some((e) => e.eventName === "PayoutsToPool")
          ? "No cashback on this opening buy: its payouts joined the pool."
          : `${smallAmount(cash, s)} cashback ${events.some((e) => e.eventName === "CashbackPaidClaims") ? "paid as a PoolManager claim (see Profile)" : events.some((e) => e.eventName === "CashbackStacked") ? "staked" : "paid to you"}.`;
        const short =
          spent < raw
            ? ` ${tokenAmount(raw - spent, s, !selling)} did not fill and stayed in your wallet: the price reached your ${slip / 100}% limit.`
            : "";
        setFill(text + " " + body + short);
        return { kind: "sold", text, body: body + short };
      },
    });
  }
  return (
    <div className="stack stack--lg">
      <Title title={selling ? "Sell PLEA" : "Buy PLEA"}>
        {dead
          ? "The Cabal is dead, so buying and selling are open to everyone, forever."
          : "Buying is open to anyone. Selling needs a plea while the Cabal lives."}
      </Title>
      <div className="split">
        <Panel
          card
          level={2}
          title={`Swap ${unit} for\u00a0${selling ? pair : "PLEA"}`}
        >
          <TradingGate
            onSeed={() => {
              setInput(formatUnits(con(s, "PleaHook.PAYOUT_RESERVE"), 18));
              document.getElementById("pay")?.focus();
            }}
          />
          {dead && (
            <div className="chips" role="group" aria-label="Buy or sell">
              {[false, true].map((v) => (
                <button
                  key={String(v)}
                  className="chip"
                  aria-pressed={selling === v}
                  onClick={() => setSelling(v)}
                >
                  {v ? "Sell" : "Buy"}
                </button>
              ))}
            </div>
          )}
          <AmountInput
            id="pay"
            label={selling ? "You sell" : "You pay"}
            value={input}
            onChange={(v) => {
              setInput(v);
              setMaxRaw(undefined);
            }}
            unit={unit}
            invalid={invalid}
            hint={invalid ? amountReason : undefined}
            aside={
              address ? (
                <>
                  <span>Balance {tokenAmount(available, s, !selling)}</span> ·{" "}
                  <button
                    className="link-btn"
                    onClick={() =>
                      available !== undefined &&
                      (setInput(amount(available, 18, selling ? 0 : 2)),
                      setMaxRaw(available))
                    }
                  >
                    Max
                    <span className="sr-only">
                      : pay all {tokenAmount(available, s, !selling)}
                    </span>
                  </button>
                </>
              ) : (
                "Your balance shows once you connect"
              )
            }
          />
          <AmountInput
            id="quote"
            label="You get (quote)"
            value={
              quote.data
                ? `≈ ${amount(quote.data.out, 18, selling ? 2 : 0)}`
                : ""
            }
            unit={selling ? pair : "PLEA"}
            aside={
              quote.loading ? (
                <span className="loading-label">
                  <Icon name="hourglass" />
                  Reading the pool…
                </span>
              ) : quote.data ? (
                `Updated ${Math.floor((Date.now() - quote.data.at) / 1000)} s ago`
              ) : (
                ""
              )
            }
          />
          <div className="field">
            <div className="field__top">
              <p className="field__label" id="slip-label">
                Slippage
              </p>
              <span className="field__aside">
                If the price moves more, nothing is{" "}
                {selling ? "sold" : "bought"}
              </span>
            </div>
            <div className="chips" role="group" aria-labelledby="slip-label">
              {[50, 100, 200].map((n) => (
                <button
                  className="chip"
                  key={n}
                  aria-pressed={slip === n}
                  onClick={() => setSlip(n)}
                >
                  {n / 100}%
                </button>
              ))}
            </div>
          </div>
          {raw > 0n && s && (
            <>
              <Costs
                parts={!selling ? [2, 3, 4, 5, 6] : []}
                rows={[
                  [
                    `Minimum, ${slip / 100}% slippage`,
                    minOut !== undefined
                      ? tokenAmount(minOut, s, selling)
                      : "Waiting for the quote",
                  ],
                  [
                    "Fees, " +
                      (Number(normal) +
                        Number(con(s, "PleaHook.PLEA_BURN_BPS"))) /
                        100 +
                      "%",
                    selling
                      ? `${Number(normal) / 100}% of the ${pair} + ${Number(con(s, "PleaHook.PLEA_BURN_BPS")) / 100}% of the PLEA`
                      : `${tokenAmount((reaches * normal) / 10000n, s, true, 2, "up")} + ${Number(con(s, "PleaHook.PLEA_BURN_BPS")) / 100}% of the PLEA`,
                  ],
                  ...((!selling
                    ? [
                        [
                          `Back to you as cashback (${Number(con(s, "PleaHook.CASHBACK_BPS")) / 100}%)`,
                          payout.data === "pool"
                            ? "none on this opening buy: the cashback, owner and prize shares join the pool"
                            : `${smallAmount(cashbackNow, s)}${payout.data === "claims" ? ", paid as a claim on the PoolManager (see Profile)" : ""}`,
                        ],
                        [
                          `Owner (${Number(con(s, "PleaHook.OWNER_BPS")) / 100}%)`,
                          tokenAmount(feePart("OWNER_BPS"), s, true, 2, "up"),
                        ],
                        ...(!dead
                          ? [
                              [
                                `Season prize pot (${Number(con(s, "PleaHook.PRIZE_BPS")) / 100}%)`,
                                tokenAmount(
                                  feePart("PRIZE_BPS"),
                                  s,
                                  true,
                                  3,
                                  "up",
                                ),
                              ],
                            ]
                          : []),
                        [
                          `Buy wall (${(Number(con(s, "PleaHook.POOL_BPS")) + (dead ? Number(con(s, "PleaHook.PRIZE_BPS")) : 0)) / 100}%)`,
                          tokenAmount(
                            feePart("POOL_BPS") +
                              (dead ? feePart("PRIZE_BPS") : 0n),
                            s,
                            true,
                            3,
                            "up",
                          ),
                        ],
                        [
                          "Burned",
                          `${Number(con(s, "PleaHook.PLEA_BURN_BPS")) / 100}% of the PLEA`,
                        ],
                        ...(extra > 0n
                          ? [
                              [
                                `Launch fee (${Number(extra) / 100}%), to the buy wall`,
                                tokenAmount(
                                  fee - (reaches * normal) / 10000n,
                                  s,
                                  true,
                                  2,
                                  "up",
                                ),
                              ],
                            ]
                          : []),
                      ]
                    : [["Plea needed", "none, the Cabal is dead"]]) as [
                    string,
                    string,
                  ][]),
                ]}
              />
              {!selling && (
                <p className="small">
                  {tokenAmount(reaches, s, true)} reaches the pool +{" "}
                  {tokenAmount((reaches * normal) / 10000n, s, true, 2, "up")}{" "}
                  fees
                  {extra
                    ? ` + ${tokenAmount(fee - (reaches * normal) / 10000n, s, true, 2, "up")} launch fee`
                    : ""}{" "}
                  = {tokenAmount(raw, s, true, 2, "up")} you pay.
                </p>
              )}
            </>
          )}
          {quote.error && (
            <Notice
              kind="bad"
              title={
                /RPC|public RPC/i.test(quote.error)
                  ? "Can’t read the price"
                  : "Can’t quote this amount"
              }
            >
              <p>{quote.error}</p>
            </Notice>
          )}
          <Action
            {...tx}
            block
            done={tx.done && !approved}
            confirmed={tx.done}
            label={
              needsApproval
                ? `Approve ${unit}`
                : selling
                  ? "Sell PLEA"
                  : "Buy PLEA"
            }
            walletLabel={
              needsApproval
                ? `Approve ${unit} in your wallet…`
                : selling
                  ? "Confirm the sale in your wallet…"
                  : "Confirm the buy in your wallet…"
            }
            connectText={`Connect in the top bar to ${selling ? "sell" : "buy"}.`}
            onRun={buy}
            disabled={!tx.ready || !!reason || allowance.data === undefined}
            reason={reason}
          />
          {address && raw > 0n && (
            <p className="small">
              {needsApproval
                ? `Step 1 of 2: lets the ${selling ? "sale" : "buy"} spend exactly ${tokenAmount(raw, s, !selling)}. Nothing is ${selling ? "sold" : "bought"} yet.`
                : `One approval for ${unit}, then the ${selling ? "sale" : "buy"}. ${!selling && payout.data !== "pool" ? `${smallAmount(cashbackNow, s)} cashback is paid to you in the same transaction.` : ""}`}
            </p>
          )}
          {fill && <p role="status">{fill}</p>}
          {tx.done && !approved && (
            <button
              className="link-btn"
              onClick={() => {
                tx.reset();
                setFill("");
              }}
            >
              Make another trade
            </button>
          )}
        </Panel>
        <div className="stack stack--lg">
          {launchActive && (
            <Panel level={2} title="Launch window">
              <Notice
                kind="warn"
                title={`Launch window: ${Math.floor((now - launch) / 60)} of ${window / 60} minutes gone.`}
              >
                <p>
                  Until {clock(launch + window)} every buy pays a launch fee on
                  top of the normal{" "}
                  {(Number(normal) + Number(con(s, "PleaHook.PLEA_BURN_BPS"))) /
                    100}
                  %; a buy over the cap is refused.
                </p>
              </Notice>
              <Costs
                rows={[
                  [
                    "Launch fee now",
                    `${(Number(extra) / 100).toFixed(1)}% of the ${pair} that reaches the pool`,
                  ],
                  [
                    "How it falls",
                    `in a straight line from ${Number(con(s, "PleaHook.LAUNCH_EXTRA_BPS")) / 100}% to 0% at ${clock(launch + window)}`,
                  ],
                  ["Most per buy", tokenAmount(cap, s)],
                  [
                    "Normal fees, on top",
                    `${(Number(normal) + Number(con(s, "PleaHook.PLEA_BURN_BPS"))) / 100}%`,
                  ],
                ]}
              />
              <div>
                <Countdown
                  until={launch + window}
                  label={`Launch fee ends at ${clock(launch + window)}`}
                />
              </div>
            </Panel>
          )}
          <Panel level={2} title="Your PLEA">
            {address ? (
              <>
                <p className="stat__value">
                  {tokenAmount(balance.data?.plea, s)}
                </p>
                <p className="label">Your buy record</p>
                <Costs
                  rows={
                    balance.data
                      ? [
                          [
                            "Cost basis",
                            balance.data.basis[1]
                              ? tokenAmount(
                                  (balance.data.basis[0] * 10n ** 24n) /
                                    balance.data.basis[1],
                                  s,
                                  true,
                                ) + " per 1M"
                              : "No buy record",
                          ],
                          [
                            "Held, buy-weighted",
                            balance.data.basis[2]
                              ? heldTime(now - Number(balance.data.basis[2]))
                              : "No buy record",
                          ],
                          [
                            `Now, at ${tokenAmount(val(s, "PleaHook.priceX96") ? (val(s, "PleaHook.priceX96") * 10n ** 24n) / 2n ** 96n : 0n, s, true)} per 1M`,
                            balance.data.basis[0]
                              ? `${((Number((balance.data.basis[1] * BigInt(val(s, "PleaHook.priceX96") || 0n)) / 2n ** 96n) * 100) / Number(balance.data.basis[0]) - 100).toFixed(1)}%`
                              : "No buy record",
                          ],
                        ]
                      : []
                  }
                />
                <p className="label">What selling takes</p>
                <p>
                  {dead
                    ? "Nothing more than a swap. No plea and no need: the Cabal is dead, so PLEA sells like any token on Uniswap v4."
                    : "An approved plea, then a sale within the sell window. Your facts set the need."}
                </p>
                {!dead &&
                  (balance.data?.open ? (
                    <>
                      <p>Plea #{String(balance.data.pending)} is open.</p>
                      <a
                        className="btn btn--sm"
                        href={`#/p/${balance.data.pending}`}
                      >
                        Open plea #{String(balance.data.pending)}{" "}
                        <Icon name="arrow-right" />
                      </a>
                    </>
                  ) : (
                    <>
                      <a className="btn btn--sm" href="#/plead">
                        Plead to sell <Icon name="arrow-right" />
                      </a>
                      {balance.data && balance.data.cooldown > now && (
                        <p>Next plea from {clock(balance.data.cooldown)}.</p>
                      )}
                    </>
                  ))}
              </>
            ) : (
              <p>Connect in the top bar to see your balance and buy record.</p>
            )}
          </Panel>
          <Panel level={2} title="Cashback">
            {address ? (
              <>
                <p className="stat__label">Earned so far</p>
                <p className="stat__value">
                  {s && !s.historyError
                    ? smallAmount(cashback(s.logs, address), s)
                    : "Reading cashback…"}
                </p>
                <p className="small">
                  Paid in the same transaction:{" "}
                  {Number(con(s, "PleaHook.CASHBACK_BPS") || 0) / 100}% of every
                  trade
                  {raw && !selling
                    ? ` (${smallAmount(cashbackNow, s)} on this buy)`
                    : ""}
                  .{" "}
                  {s?.logs.some(
                    (e) =>
                      e.eventName === "CashbackStacked" &&
                      e.args.trader?.toLowerCase() === address.toLowerCase(),
                  ) ? (
                    <a href="https://imdacc.fun">Staked through imd/acc.</a>
                  ) : (
                    `In this test run it arrives as plain ${pair}, not staked.`
                  )}
                </p>
              </>
            ) : (
              <p>Connect in the top bar to see your cashback.</p>
            )}
          </Panel>
          {!dead && (
            <Notice kind="warn" title="Before you buy">
              <p>
                While the Cabal lives you can only sell with an approved plea.
                The Cabal dies after{" "}
                {span(Number(con(s, "CabalGate.DEADMAN") || 118800))} without a
                verdict; then PLEA trades freely forever.
              </p>
            </Notice>
          )}
        </div>
      </div>
    </div>
  );
}

export function Plead() {
  const { r, s, now } = useApp(),
    { address } = useAccount(),
    balance = WalletBalances();
  const [input, setInput] = useState(""),
    [text, setText] = useState(""),
    [auto, setAuto] = useState(true),
    raw = parseAmount(input),
    tx = useTx(`${input}:${auto}:${text}`);
  const returned = useRead(
    () => returnedEscrow(r, s!, address!, s!.timestamp),
    [address],
    !!s && !!address,
  );
  const bal =
      BigInt(balance.data?.plea || 0n) +
      (auto ? returned.data?.returned || 0n : 0n),
    cap = BigInt(con(s, "CabalGate.MAX_SELL") || 0n),
    gateMin = minBig(bal / 100n, cap),
    price = BigInt(val(s, "PleaHook.latestPrice") || 0n),
    max = minBig(bal / 2n, cap);
  const floor = price ? ceil(LETTERBOX.MIN_SALE_VALUE * Q96, price) : 0n,
    min = auto ? maxBig(gateMin, floor) : gateMin;
  const fact = useRead(
    async () => {
      const result = Number(
        await read(r, "CabalGate", "factScore", [address, raw]),
      );
      if (auto && returned.data?.returned && balance.data?.plea)
        return (
          result -
          sharePoints(ceil(raw * 10000n, balance.data.plea)) +
          sharePoints(ceil(raw * 10000n, bal))
        );
      return result;
    },
    [address, raw.toString(), auto, bal.toString()],
    !!s && !!address && raw > 0n,
  );
  const need =
      fact.data === undefined
        ? undefined
        : Number(con(s, "CabalGate.PASS_MARK")) - fact.data,
    fees = s?.v.fees,
    oracle = BigInt(con(s, "CabalGate.ORACLE_FEE") || 0n),
    feeCap = BigInt(fees?.[1] || 0n),
    pair = s?.constants.pairSymbol || "imdTEST";
  const quote = useRead(
    () => poolQuote(r, s!, raw, true),
    [raw.toString()],
    !!s && raw > 0n && !!val(s, "PleaHook.seeded"),
  );
  const chipAmounts = [1, 10, 20, 35, 50].map((n) => {
    let v = n === 50 ? max : (bal * BigInt(n)) / 100n;
    v =
      n === 1
        ? ceil(maxBig(v, min), 10n ** 18n) * 10n ** 18n
        : (v / 10n ** 18n) * 10n ** 18n;
    return { n, v };
  });
  const chipFacts = useRead(
    () =>
      Promise.all(
        chipAmounts.map(async ({ v, n }) => ({
          n,
          v,
          score: await read(r, "CabalGate", "factScore", [address, v]),
        })),
      ),
    [address, auto, bal.toString()],
    !!s && !!address && bal > 0n,
  );
  const passing = chipFacts.data
    ?.filter(
      (c) =>
        Number(con(s, "CabalGate.PASS_MARK")) - Number(c.score) <=
        Number(con(s, "CabalGate.MAX_PLEA_SCORE")),
    )
    .at(-1);
  const invalid = raw > 0n && (raw < min || raw > max),
    cannot =
      need !== undefined && need > Number(con(s, "CabalGate.MAX_PLEA_SCORE"));
  const reason = !val(s, "PleaHook.seeded")
    ? "Trading is not open yet."
    : balance.data?.open
      ? `Plea #${balance.data.pending} is still open. You can write your next plea now; it is kept until you can send it.`
      : balance.data && balance.data.cooldown > now
        ? `Cooldown until ${clock(balance.data.cooldown)}. You can write your plea now and send it then.`
        : auto && returned.data?.blocked
          ? returned.data.blocked
          : auto && feeCap * 10n > bal
            ? `Auto-sell’s fees (at most ${tokenAmount(feeCap, s, false, 0, "up")}) may take at most 10% of your PLEA, so it needs at least ${tokenAmount(feeCap * 10n, s)}. Untick 'Sell automatically if approved' to pay the ${tokenAmount(oracle, s, true)} oracle fee from your ${pair}.`
            : invalid
              ? raw < min
                ? `At least ${tokenAmount(min, s)}${auto ? ` (worth ${tokenAmount(LETTERBOX.MIN_SALE_VALUE, s, true)} at the hourly price)` : ""}. Raise the amount.`
                : `At most ${tokenAmount(max, s)} in one plea. Lower the amount.`
              : raw <= 0n
                ? "Enter an amount to read your fact score and need."
                : cannot
                  ? `Need ${need} of ${con(s, "CabalGate.MAX_PLEA_SCORE")}: cannot pass at this size. Nothing is paid.`
                  : fact.error ||
                    (!fact.data
                      ? "Reading your fact score."
                      : !textCheck("plea", text).ok
                        ? "Fix the text above to submit. Nothing is paid until it passes."
                        : "");
  if (val(s, "CabalGate.diedAt"))
    return (
      <>
        <Title title="Plead to sell" />
        <Empty
          icon="gavel"
          title="Plead is closed"
          action={{ href: "#/buy", label: "Sell on the Buy page" }}
        >
          No verdict for {span(Number(con(s, "CabalGate.DEADMAN")))}, so PLEA
          trades freely forever: sell on the Buy page with no plea. Court is
          adjourned.
        </Empty>
      </>
    );
  const parts =
    balance.data && raw > 0n
      ? factParts(
          bal,
          raw,
          balance.data.basis,
          price,
          BigInt(val(s, "PleaHook.price24hAgo") || 0n),
          Number(val(s, "CabalGate.startedAt")),
          now,
        )
      : undefined;
  const expected = quote.data?.out || 0n,
    autoOut =
      expected > LETTERBOX.AUTO_SELL_FEE
        ? expected - LETTERBOX.AUTO_SELL_FEE
        : 0n,
    minimumAuto =
      (((((raw * price) / Q96) * LETTERBOX.MIN_OUT_BPS) / 10000n) *
        (10000n -
          BigInt(con(s, "PleaHook.IMD_FEE_BPS") || 0n) -
          BigInt(con(s, "PleaHook.PLEA_BURN_BPS") || 0n))) /
      10000n;
  const feePlea = price
    ? ((oracle + LETTERBOX.TIP) * Q96 * 10000n) /
      price /
      (10000n -
        BigInt(con(s, "PleaHook.IMD_FEE_BPS")) -
        BigInt(con(s, "PleaHook.PLEA_BURN_BPS")))
    : 0n;
  return (
    <div className="stack stack--lg">
      <Title title="Plead to sell">
        Write why you want to sell. The Cabal,{" "}
        {String(con(s, "CabalGate.PANEL_SIZE") || "the panel of")} judges,
        scores it from 0 to {String(con(s, "CabalGate.MAX_PLEA_SCORE") || 45)}.
        You pass if the score reaches your need.
      </Title>
      <div className="split">
        <Panel card level={2} title="New plea">
          <TradingGate />
          <AmountInput
            id="plea-amount"
            label="Amount"
            value={input}
            onChange={setInput}
            unit="PLEA"
            invalid={invalid}
            aside={
              address
                ? `Balance ${tokenAmount(bal, s)}`
                : "Your balance shows once you connect"
            }
            hint={
              address
                ? invalid
                  ? reason
                  : `From ${tokenAmount(min, s)}${auto ? ` (worth ${tokenAmount(LETTERBOX.MIN_SALE_VALUE, s, true)} at the hourly price)` : ""} to ${tokenAmount(max, s)}: at most ${Number(con(s, "CabalGate.MAX_SHARE_BPS") || 0) / 100}% and ${tokenAmount(cap, s)}.`
                : undefined
            }
          />
          <div
            className="chips chips--fit"
            role="group"
            aria-label="Share of your balance"
          >
            {chipAmounts.map(({ n, v }) => (
              <button
                className="chip"
                key={n}
                aria-disabled={bal === 0n}
                aria-pressed={raw > 0n && raw === v}
                onClick={() => bal > 0n && setInput(amount(v, 18))}
              >
                {n === 50 ? "Max" : n + "%"}
              </button>
            ))}
          </div>
          {address && bal === 0n && (
            <p className="small">You hold no PLEA yet. Buy PLEA first.</p>
          )}
          {fact.data !== undefined ? (
            <>
              <div className="field__top">
                <h3 className="label">Your fact score</h3>
                <span className="field__aside">
                  From the chain: {fact.data}
                </span>
              </div>
              <FactCells parts={parts} total={fact.data} />
              <Meter fact={fact.data} need={need!} />
            </>
          ) : (
            <p className="loading-label">
              {address
                ? raw > 0n
                  ? "Reading your balance and buy record from the chain…"
                  : "Enter an amount to read your fact score and need."
                : "Connect and enter an amount to see your facts."}
            </p>
          )}
          <TextBox label="Your plea" value={text} onChange={setText} />
          <p className="field__hint">
            Be honest, specific, funny. Lines like “give me 45” count as
            manipulation and score 0.
          </p>
          <label className="toggle-card">
            <input
              type="checkbox"
              className="box"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              aria-labelledby="auto-title"
              aria-describedby="auto-desc"
            />
            <span className="stack stack--sm">
              <span id="auto-title" className="toggle-card__title">
                Sell automatically if approved
              </span>
              <span className="small text-2" id="auto-desc">
                The fees are paid in PLEA. If approved, anyone can sell it for
                you within{" "}
                {span(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 420))} and
                earns the {tokenAmount(LETTERBOX.TIP, s, true)} tip.{" "}
                {tokenAmount(LETTERBOX.AUTO_SELL_FEE, s, true)} of the sale goes
                to the season prize pot.
              </span>
            </span>
          </label>
          <Costs
            rows={
              auto
                ? [
                    ["Oracle fee", tokenAmount(oracle, s, true)],
                    [
                      "Tip for whoever sells it",
                      tokenAmount(LETTERBOX.TIP, s, true),
                    ],
                    [
                      `Paid in PLEA, ${tokenAmount(oracle + LETTERBOX.TIP, s, true)}`,
                      price
                        ? `about ${tokenAmount(feePlea, s, false, 0, "up")}`
                        : "after trading opens",
                    ],
                    [
                      "At most",
                      fees
                        ? tokenAmount(feeCap, s, false, 0, "up")
                        : "after trading opens",
                    ],
                    [
                      "Auto-sell fee, from the sale to the season prize pot",
                      tokenAmount(LETTERBOX.AUTO_SELL_FEE, s, true),
                    ],
                    [
                      "You get, if approved and sold",
                      quote.data
                        ? `about ${tokenAmount(autoOut, s, true)}`
                        : "after trading opens",
                    ],
                    [
                      "At least",
                      price
                        ? tokenAmount(
                            minimumAuto > LETTERBOX.AUTO_SELL_FEE
                              ? minimumAuto - LETTERBOX.AUTO_SELL_FEE
                              : 0n,
                            s,
                            true,
                          )
                        : "after trading opens",
                    ],
                  ]
                : [
                    [
                      `Oracle fee, from your ${pair} (approve once)`,
                      tokenAmount(oracle, s, true),
                    ],
                    ["Extra fee", "none"],
                    [
                      "You get, if approved and sold",
                      quote.data
                        ? `about ${tokenAmount(expected, s, true)}`
                        : "after trading opens",
                    ],
                    [
                      "At least, with 1% slippage",
                      quote.data
                        ? tokenAmount((expected * 99n) / 100n, s, true)
                        : "after trading opens",
                    ],
                  ]
            }
          />
          <p className="small">
            {auto
              ? `Press Sell yourself and you keep the tip. If nobody sells it, or on any other ending, your PLEA and the tip come back; the ${tokenAmount(oracle, s, true)} oracle fee is spent.`
              : `Off: you pay the ${tokenAmount(oracle, s, true)} oracle fee from your ${pair} and sell yourself within ${span(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 420))}, no extra fee.`}
          </p>
          {!address ? (
            <Notice title="Connect in the top bar to plead.">
              <p>Everything else here reads without a wallet.</p>
            </Notice>
          ) : balance.data?.open ? (
            <Notice
              title={`Plea #${balance.data.pending} is open: one plea at a time.`}
            >
              <p>
                {balance.data.pendingPlea.status === 2
                  ? `Sell by ${clock(Number(balance.data.pendingPlea.verdictAt) + Number(con(s, "CabalGate.EXECUTE_WINDOW")))}. Next plea ${span(Number(con(s, "CabalGate.COOLDOWN")))} after the sale, or ${clock(balance.data.cooldown)} if it lapses.`
                  : `Plea #${balance.data.pending} is waiting for the Cabal, until ${clock(Number(balance.data.pendingPlea.submittedAt) + Number(con(s, "CabalGate.PENDING_EXPIRY")))}.`}{" "}
                <a href={`#/p/${balance.data.pending}`}>
                  Open plea #{String(balance.data.pending)}
                </a>
              </p>
            </Notice>
          ) : balance.data && balance.data.cooldown > now ? (
            <Notice
              kind="warn"
              title={`Next plea possible at ${clock(balance.data.cooldown)}.`}
            >
              <p>
                {span(Number(con(s, "CabalGate.COOLDOWN")), "adj")} cooldown
                after your last sale, denial or lapse.
              </p>
            </Notice>
          ) : cannot ? (
            <Notice kind="bad" icon="prohibit" title="This plea cannot pass.">
              <p>
                Even a perfect plea (
                {String(con(s, "CabalGate.MAX_PLEA_SCORE"))}) cannot pass at
                this size.{" "}
                {passing
                  ? `Plead ${passing.n}% or less (${tokenAmount(passing.v, s)}) or wait for better facts.`
                  : "Wait for better facts."}
              </p>
            </Notice>
          ) : null}
          {auto ? (
            <Action
              {...tx}
              label="Submit plea"
              sub={`${tokenAmount(oracle + LETTERBOX.TIP, s, true)} in PLEA`}
              block
              onRun={() =>
                tx.send("Letterbox", "plead", [raw, text], undefined, {
                  errors: {
                    TooSmallForTheFee: (args) =>
                      `Worth ${tokenAmount(BigInt(args[0]), s, true)} at the hourly price; auto-sell needs at least ${tokenAmount(LETTERBOX.MIN_SALE_VALUE, s, true)} (about ${tokenAmount(floor, s)}). Raise the amount or untick auto-sell.`,
                    FeeTooHigh: (args) =>
                      BigInt(args[1]) === bal
                        ? `Auto-sell’s fees (at most ${tokenAmount(feeCap, s, false, 0, "up")}) may take at most 10% of your PLEA, so it needs at least ${tokenAmount(feeCap * 10n, s)}. Untick 'Sell automatically if approved' to pay the ${tokenAmount(oracle, s, true)} oracle fee from your ${pair}.`
                        : "The price fell since the hourly snapshot, so the fee needs more PLEA than its 10% margin. Nothing was paid; try again after the next snapshot or untick auto-sell.",
                  },
                })
              }
              disabled={!!reason || !tx.ready}
              reason={reason}
            />
          ) : (
            <ApprovedAction
              name="CabalGate"
              fn="submitSell"
              args={[raw, text]}
              label="Submit plea"
              sub={tokenAmount(oracle, s, true)}
              token={r.addresses.PairToken}
              spender={r.addresses.CabalGate}
              spend={oracle}
              disabled={!!reason}
              reason={reason}
            />
          )}
          <p className="small">
            Submit stays off until your text passes the checks; nothing is paid
            before that. One plea at a time, and a{" "}
            {span(Number(con(s, "CabalGate.COOLDOWN") || 14400), "adj")}{" "}
            cooldown follows a sale, a denial or a lapse.
          </p>
        </Panel>
        <div className="stack stack--lg">
          <Panel level={2} title="What happens next">
            <ol className="timeline">
              {[
                [
                  "arrow-right",
                  "Submitted",
                  "The contract checks your text, amount and need before taking the fee.",
                ],
                [
                  "hourglass",
                  "Waiting for the Cabal",
                  `Up to ${span(Number(con(s, "CabalGate.PENDING_EXPIRY") || 1200))}, usually 3 to 6. ${con(s, "CabalGate.PANEL_SIZE") || 30} judges score it; ${con(s, "CabalGate.QUORUM") || 17} must agree.`,
                ],
                [
                  "gavel",
                  "Verdict",
                  `Approved: sell within ${span(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 420))}. Denied: one appeal within ${span(Number(con(s, "CabalGate.COOLDOWN") || 14400))}. No verdict: no cooldown, no fee back.`,
                ],
                [
                  "timer",
                  "Cooldown",
                  `${span(Number(con(s, "CabalGate.COOLDOWN") || 14400))} after a sale, a denial or a lapse.`,
                ],
              ].map(([icon, title, body], i) => (
                <li className={i === 0 ? "is-now" : "is-later"} key={title}>
                  <span className="timeline__dot">
                    <Icon name={icon} />
                  </span>
                  <div>
                    <p className="timeline__title">{title}</p>
                    <p className="timeline__meta">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel level={2} title="Rules the contract checks">
            <p>
              One line, 1 to {String(con(s, "CabalGate.MAX_PLEA_BYTES") || 280)}{" "}
              bytes; no hidden characters or plea markers. Sell{" "}
              {Number(con(s, "CabalGate.MIN_SHARE_BPS") || 100) / 100}% to{" "}
              {Number(con(s, "CabalGate.MAX_SHARE_BPS") || 5000) / 100}% of the
              balance, at most {tokenAmount(cap, s)}. The need may not exceed{" "}
              {String(con(s, "CabalGate.MAX_PLEA_SCORE") || 45)}. One open plea
              per wallet.
            </p>
          </Panel>
          <Panel level={2} title="Pleas that passed">
            {s?.pleas
              .filter((p) => [2, 4, 5].includes(p.status))
              .slice(0, 2)
              .map((p) => (
                <div key={String(p.id)}>
                  <Stamp p={p} />
                  <p>
                    <a href={`#/p/${p.id}`}>Plea #{String(p.id)}</a> ·{" "}
                    {p.name || short(p.seller)}
                  </p>
                  <p>“{p.text}”</p>
                </div>
              ))}
            {s && !s.pleas.some((p) => [2, 4, 5].includes(p.status)) && (
              <p>No approvals yet.</p>
            )}
            <a className="link-btn" href="#/wall">
              Every plea on the Wall <Icon name="arrow-right" />
            </a>
          </Panel>
        </div>
      </div>
    </div>
  );
}
