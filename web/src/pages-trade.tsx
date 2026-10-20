import { estimateHookOutput, priceLimit } from "./swap-math";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { useApp, useRead, useTx } from "./context";
import { APP, erc20Abi, swapAbi, quoterAbi } from "./config";
import {
  amount,
  con,
  read,
  tokenAmount,
  duration,
  utc,
  val,
  cashback,
} from "./chain";
import {
  Action,
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
    if (!/^\d+(\.\d*)?$/.test(s)) return 0n;
    return parseUnits(s, decimals);
  } catch {
    return 0n;
  }
}
export function WalletBalances() {
  const { r, s } = useApp();
  const { address } = useAccount();
  return useRead(
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
      return {
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
}
export function Buy() {
  const { r, s, now } = useApp();
  const { address } = useAccount();
  const balance = WalletBalances();
  const [input, setInput] = useState("");
  const [selling, setSelling] = useState(false);
  const [slip, setSlip] = useState(100);
  const tx = useTx(`${input}:${selling}:${slip}`);
  const [revision, setRevision] = useState(0);
  const [lastWasApproval, setLastWasApproval] = useState(false);
  const symbol = s?.constants.symbol || "PLEA",
    pair = s?.constants.pairSymbol || "fee token",
    dead = !!val(s, "CabalGate.diedAt");
  const unit = selling ? symbol : pair;
  const raw = parseAmount(
    input,
    s?.constants[selling ? "decimals" : "pairDecimals"] || 18,
  );
  const inputToken = selling ? r.addresses.PLEA : r.addresses.PairToken;
  const quote = useRead(
    async () => {
      const key = val(s, "PleaHook.poolKey");
      const zeroForOne =
        key.currency0.toLowerCase() === inputToken.toLowerCase();
      const hookData = address
        ? encodeAbiParameters([{ type: "address" }], [address])
        : "0x";
      let out: bigint | undefined;
      if (address)
        try {
          const result = await r.client.simulateContract({
            address: r.network.uniswapV4.quoter,
            abi: quoterAbi,
            functionName: "quoteExactInputSingle",
            args: [{ poolKey: key, zeroForOne, exactAmount: raw, hookData }],
            account: address,
          });
          if (result.result[0] > 0n) out = result.result[0];
        } catch {}
      const source =
        out === undefined ? "Indicative pool calculation" : "Live v4 Quoter";
      if (out === undefined) {
        const sqrt = await read(r, "PleaHook", "currentSqrtPriceX96");
        const band = (b: any) => ({
          tickLower: Number(b[0]),
          tickUpper: Number(b[1]),
          liquidity: BigInt(b[2]),
        });
        out = estimateHookOutput({
          amount: raw,
          zeroForOne,
          sqrt,
          bands: [
            band(val(s, "PleaHook.market")),
            band(val(s, "PleaHook.wall")),
          ],
          inputBps: BigInt(
            selling
              ? con(s, "PleaHook.PLEA_BURN_BPS")
              : BigInt(con(s, "PleaHook.IMD_FEE_BPS")) +
                  BigInt(val(s, "PleaHook.launchExtraBps")),
          ),
          outputBps: BigInt(
            selling
              ? con(s, "PleaHook.IMD_FEE_BPS")
              : con(s, "PleaHook.PLEA_BURN_BPS"),
          ),
        });
      }
      return { out, zeroForOne, hookData, key, source };
    },
    [raw.toString(), selling, address, slip],
    !!s && raw > 0n && val(s, "PleaHook.seeded") && (!selling || dead),
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
    !!s && !!address,
  );
  const needsApproval = allowance.data !== undefined && allowance.data < raw;
  const minOut = quote.data
    ? (quote.data.out * BigInt(10000 - slip)) / 10000n
    : undefined;
  const available = selling ? balance.data?.plea : balance.data?.pair;
  const launch = Number(val(s, "PleaHook.launchedAt"));
  const launchWindow = Number(con(s, "PleaHook.LAUNCH_WINDOW"));
  const launchActive =
    !!s && val(s, "PleaHook.seeded") && now < launch + launchWindow;
  async function buy() {
    if (needsApproval) {
      setLastWasApproval(true);
      const hash = await tx.send("", "approve", [], {
        to: inputToken,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [APP.swapRouter, raw],
        }),
      });
      if (hash) setRevision((n) => n + 1);
      return;
    }
    if (!quote.data || !minOut) return;
    setLastWasApproval(false);
    const q = quote.data;
    const sqrt = (await read(r, "PleaHook", "currentSqrtPriceX96")) as bigint;
    // Limit the execution price in PoolSwapTest. This router has no amountOutMinimum argument.
    const limit = priceLimit(sqrt, slip, q.zeroForOne);
    const args = [
      q.key,
      {
        zeroForOne: q.zeroForOne,
        amountSpecified: -raw,
        sqrtPriceLimitX96: limit,
      },
      { takeClaims: false, settleUsingBurn: false },
      q.hookData,
    ] as const;
    await tx.send("", "swap", [], {
      to: APP.swapRouter,
      data: encodeFunctionData({ abi: swapAbi, functionName: "swap", args }),
    });
  }
  const reason = !val(s, "PleaHook.seeded")
    ? "Trading is not open yet."
    : raw <= 0n
      ? `Enter how much ${unit} to ${selling ? "sell" : "pay"}, or press Max.`
      : available !== undefined && raw > available
        ? `You have ${tokenAmount(available, s, !selling)}. Lower the amount or press Max.`
        : quote.error ||
          (!quote.data ? "Waiting for a quote from the pool." : undefined);
  return (
    <div className="stack stack--lg">
      <Title title={selling ? `Sell ${symbol}` : `Buy ${symbol}`}>
        Buying is open to anyone. Selling needs a plea while the Cabal lives.
      </Title>
      <div className="split">
        <Panel card title={`Swap ${unit} for ${selling ? pair : symbol}`}>
          <TradingGate />
          <Action
            {...tx}
            done={tx.done && !lastWasApproval}
            confirmed={tx.done}
            label={
              needsApproval
                ? `Approve ${unit}`
                : selling
                  ? `Sell ${symbol}`
                  : `Buy ${symbol}`
            }
            onRun={buy}
            disabled={
              !tx.ready ||
              !!reason ||
              allowance.loading ||
              allowance.data === undefined
            }
            reason={reason}
          />
          {dead && (
            <div className="chips" role="group" aria-label="Buy or sell">
              <button
                className="chip"
                aria-pressed={!selling}
                onClick={() => setSelling(false)}
              >
                Buy
              </button>
              <button
                className="chip"
                aria-pressed={selling}
                onClick={() => setSelling(true)}
              >
                Sell
              </button>
            </div>
          )}
          <AmountInput
            id="pay"
            label={selling ? "You sell" : "You pay"}
            value={input}
            onChange={setInput}
            unit={unit}
            aside={
              <>
                <span>
                  Balance{" "}
                  {amount(available, s?.constants.decimals, !selling ? 2 : 0)}
                </span>{" "}
                ·{" "}
                <button
                  className="link-btn"
                  onClick={() => {
                    if (available !== undefined)
                      setInput(
                        formatUnits(available, s?.constants.decimals || 18),
                      );
                  }}
                >
                  Max
                </button>
              </>
            }
          />
          <AmountInput
            id="quote"
            label={quote.data?.source || "You get (quote)"}
            value={
              quote.loading
                ? "Reading the pool…"
                : quote.data
                  ? amount(
                      quote.data.out,
                      s?.constants.decimals,
                      selling ? 2 : 0,
                    )
                  : "—"
            }
            unit={selling ? pair : symbol}
          />
          <div className="field">
            <p className="field__label" id="slip-label">
              Slippage / price limit
            </p>
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
          {tx.done && !lastWasApproval && (
            <button className="link-btn" onClick={tx.reset}>
              Make another trade
            </button>
          )}
          <Costs
            rows={[
              [
                "Price",
                `1M ${symbol} = ${tokenAmount(val(s, "PleaHook.priceX96") ? (val(s, "PleaHook.priceX96") * 10n ** 24n) / 2n ** 96n : undefined, s, true)}`,
              ],
              ["Minimum estimate", tokenAmount(minOut, s, selling)],
              [
                "Trade fees",
                s
                  ? `${(Number(con(s, "PleaHook.IMD_FEE_BPS")) + Number(con(s, "PleaHook.PLEA_BURN_BPS"))) / 100}%`
                  : "Reading…",
              ],
              [
                "Cashback",
                `${Number(con(s, "PleaHook.CASHBACK_BPS") || 0) / 100}% in ${pair}`,
              ],
              ["Owner", `${Number(con(s, "PleaHook.OWNER_BPS") || 0) / 100}%`],
              [
                "Season prize pot",
                `${Number(con(s, "PleaHook.PRIZE_BPS") || 0) / 100}%`,
              ],
              [
                "Buy wall",
                `${Number(con(s, "PleaHook.POOL_BPS") || 0) / 100}%`,
              ],
              [
                "Burned",
                `${Number(con(s, "PleaHook.PLEA_BURN_BPS") || 0) / 100}% of ${symbol}`,
              ],
            ]}
          />
          <p className="small text-2">
            One approval to PoolSwapTest, then the swap. Every buy identifies
            you in hookData. Cashback in this run falls back to plain {pair} if
            staking fails.
          </p>
          {quote.data && (
            <Notice title="Price protection">
              <p>
                The minimum above is an estimate. PoolSwapTest enforces the
                price limit and can fill only part of your input. It has no
                guaranteed minimum-output parameter. Review this before signing.
              </p>
            </Notice>
          )}
          <p className="token-note">
            Test tokens have no value. No USD price source is configured.
          </p>
        </Panel>
        <div className="stack stack--lg">
          <Panel title="Your PLEA">
            {address ? (
              <>
                <p>
                  <span className="stat__label">Balance</span>
                  <span className="stat__value">
                    {tokenAmount(balance.data?.plea, s)}
                  </span>
                </p>
                <Costs
                  rows={
                    balance.data
                      ? [
                          [
                            "Cost basis",
                            balance.data.basis[1] > 0n
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
                            balance.data.basis[2] > 0n
                              ? duration(now - Number(balance.data.basis[2]))
                              : "No buy record",
                          ],
                          [
                            "Next plea",
                            balance.data!.pending > 0n
                              ? `after plea #${balance.data!.pending}`
                              : balance.data.cooldown > now
                                ? utc(balance.data.cooldown)
                                : "Ready when trading opens",
                          ],
                        ]
                      : []
                  }
                />
                {(balance.data?.last || 0n) > 0n ? (
                  <a className="btn" href={`#/p/${balance.data!.last}`}>
                    Open plea #{String(balance.data!.last)}
                  </a>
                ) : (
                  <a className="btn" href="#/plead">
                    Plead to sell
                  </a>
                )}
              </>
            ) : (
              <p>Connect in the top bar to see your balance and buy record.</p>
            )}
          </Panel>
          <Panel title="Cashback">
            <p>
              <span className="stat__label">Earned so far</span>
              <span className="stat__value">
                {address && !s?.historyError
                  ? tokenAmount(
                      s ? cashback(s.logs, address) : undefined,
                      s,
                      true,
                    )
                  : "—"}
              </span>
            </p>
            <p className="small">
              Sum of CashbackStacked, CashbackPaidPlain and CashbackPaidClaims
              for your wallet, from the first deployment block.
            </p>
            {s?.historyError && (
              <p className="small bad-text">{s.historyError}</p>
            )}
          </Panel>
          {launchActive && (
            <Panel title="Launch window">
              <Countdown
                until={launch + launchWindow}
                label="Launch fee ends in"
              />
              <Costs
                rows={[
                  [
                    "Launch fee now",
                    `${Number(val(s, "PleaHook.launchExtraBps")) / 100}% of input reaching the pool`,
                  ],
                  [
                    "Most per buy",
                    tokenAmount(con(s, "PleaHook.LAUNCH_MAX_BUY"), s),
                  ],
                ]}
              />
            </Panel>
          )}
          <Notice kind="warn" title="Before you buy">
            <p>
              While the Cabal lives you can only sell with an approved plea.
              After{" "}
              {s
                ? duration(Number(con(s, "CabalGate.DEADMAN")))
                : "the dead-man window"}{" "}
              without a verdict, PLEA trades freely forever.
            </p>
          </Notice>
        </div>
      </div>
    </div>
  );
}
export function Plead() {
  const { r, s, now } = useApp();
  const { address } = useAccount();
  const balance = WalletBalances();
  const [input, setInput] = useState("");
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(true);
  const raw = parseAmount(input, s?.constants.decimals || 18);
  const fact = useRead(
    () => read(r, "CabalGate", "factScore", [address, raw]),
    [address, raw.toString()],
    !!s && !!address && raw > 0n,
  );
  const need =
    fact.data === undefined
      ? undefined
      : Number(con(s, "CabalGate.PASS_MARK")) - Number(fact.data);
  const cap = con(s, "CabalGate.MAX_SELL") as bigint | undefined;
  const max =
    balance.data && cap
      ? (balance.data.plea * BigInt(con(s, "CabalGate.MAX_SHARE_BPS"))) /
          10000n <
        cap
        ? (balance.data.plea * BigInt(con(s, "CabalGate.MAX_SHARE_BPS"))) /
          10000n
        : cap
      : undefined;
  const min =
    balance.data && cap
      ? (balance.data.plea * BigInt(con(s, "CabalGate.MIN_SHARE_BPS"))) /
          10000n <
        cap
        ? (balance.data.plea * BigInt(con(s, "CabalGate.MIN_SHARE_BPS"))) /
          10000n
        : cap
      : undefined;
  const tx = useTx(`${input}:${auto}:${text}`);
  const oracle = con(s, "CabalGate.ORACLE_FEE") || 0n;
  const fees = s?.v.fees;
  const feeTotal = fees?.[0];
  const tip =
    feeTotal !== undefined ? BigInt(feeTotal) - BigInt(oracle) : undefined;
  const reason = !val(s, "PleaHook.seeded")
    ? "Trading is not open yet."
    : !val(s, "CabalGate.cabalAlive")
      ? "The Cabal is dead. Pleas are closed."
      : (balance.data?.pending || 0n) > 0n
        ? `Plea #${balance.data!.pending} is open. Open it before sending another plea.`
        : balance.data && balance.data.cooldown > now
          ? `Cooldown until ${utc(balance.data.cooldown)}.`
          : min !== undefined && (raw < min || raw > max!)
            ? `Choose ${tokenAmount(min, s)} to ${tokenAmount(max, s)}.`
            : need !== undefined &&
                need > Number(con(s, "CabalGate.MAX_PLEA_SCORE"))
              ? "This plea cannot pass (CannotPass). Sell a smaller share or wait for your facts to improve."
              : fact.error ||
                (!fact.data
                  ? "Reading your fact score."
                  : !textCheck("plea", text).ok
                    ? "Fix the text checks before submitting."
                    : undefined);
  return (
    <div className="stack stack--lg">
      <Title title="Plead to sell">
        Write why you want to sell. The Cabal scores it; you pass if the score
        reaches your need.
      </Title>
      <div className="split">
        <Panel card title="New plea">
          <TradingGate />
          {auto ? (
            <Action
              {...tx}
              label="Submit plea"
              onRun={() => tx.send("Letterbox", "plead", [raw, text])}
              disabled={!!reason || !tx.ready}
              reason={reason}
            />
          ) : (
            <ApprovedAction
              name="CabalGate"
              fn="submitSell"
              args={[raw, text]}
              label="Submit plea"
              token={r.addresses.PairToken}
              spender={r.addresses.CabalGate}
              spend={oracle}
              disabled={!!reason}
              reason={reason}
            />
          )}
          {(balance.data?.pending || 0n) > 0n && (
            <a href={`#/p/${balance.data!.pending}`} className="btn">
              Open plea #{String(balance.data!.pending)}
            </a>
          )}
          <AmountInput
            id="plea-amount"
            label="Amount"
            value={input}
            onChange={setInput}
            unit={s?.constants.symbol || "PLEA"}
            aside={`Balance ${amount(balance.data?.plea)}`}
            hint={`From ${tokenAmount(min, s)} to ${tokenAmount(max, s)}. At most ${Number(con(s, "CabalGate.MAX_SHARE_BPS") || 0) / 100}% of your balance and ${tokenAmount(cap, s)}.`}
          />
          <div
            className="chips chips--fit"
            role="group"
            aria-label="Share of your balance"
          >
            {[1, 10, 20, 35, 50].map((n) => (
              <button
                className="chip"
                key={n}
                aria-pressed={
                  !!balance.data &&
                  raw ===
                    (n === 50 ? max! : (balance.data.plea * BigInt(n)) / 100n)
                }
                onClick={() =>
                  balance.data &&
                  setInput(
                    formatUnits(
                      n === 50 ? max! : (balance.data.plea * BigInt(n)) / 100n,
                      s?.constants.decimals || 18,
                    ),
                  )
                }
              >
                {n === 50 ? "Max" : n + "%"}
              </button>
            ))}
          </div>
          {need !== undefined ? (
            <Meter fact={Number(fact.data)} need={need} />
          ) : (
            <p className="small">
              Your fact score and need are read from chain before you pay.
              Connect and enter an amount to see them.
            </p>
          )}
          {need !== undefined &&
            need > Number(con(s, "CabalGate.MAX_PLEA_SCORE")) && (
              <Notice title="This plea cannot pass" kind="bad">
                <p>{reason}</p>
              </Notice>
            )}
          <TextBox label="Your plea" value={text} onChange={setText} />
          <p className="field__hint">
            Be honest, specific, funny. Never tell the judges how to score.
            Pleas are always rendered as plain text.
          </p>
          <label className="toggle-card">
            <input
              className="box"
              type="checkbox"
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
                Fees are paid in PLEA. Anyone can deliver the sale within{" "}
                {duration(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 0))} and
                earn the runner tip. The delivered sale pays the season prize
                pot.
              </span>
            </span>
          </label>
          <Costs
            rows={
              auto
                ? [
                    ["Oracle fee", tokenAmount(oracle, s, true)],
                    [
                      "Runner tip",
                      tip !== undefined
                        ? tokenAmount(tip, s, true)
                        : "Read when trading opens",
                    ],
                    [
                      "Paid in PLEA",
                      feeTotal !== undefined
                        ? `${tokenAmount(feeTotal, s, true)} equivalent`
                        : "Calculated on chain when trading opens",
                    ],
                    ["At most", tokenAmount(fees?.[1], s)],
                    [
                      "Auto-sell fee from delivered sale",
                      tokenAmount(
                        con(s, "CabalGate.APPEAL_POOL_SHARE"),
                        s,
                        true,
                      ),
                    ],
                  ]
                : [
                    ["Oracle fee, approve once", tokenAmount(oracle, s, true)],
                    ["Extra fee", "none"],
                    [
                      "Sell yourself within",
                      duration(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 0)),
                    ],
                  ]
            }
          />
          <p className="small text-2">
            Manual: pay the oracle fee from{" "}
            {s?.constants.pairSymbol || "the fee token"}, then sell yourself
            with executeSell(minOut). Automatic: PLEA is escrowed; a runner can
            deliver it. If no sale happens, settle returns the escrow and tip.
            The oracle fee is spent.
          </p>
        </Panel>
        <div className="stack stack--lg">
          <Panel title="What happens next">
            <ol className="timeline">
              {[
                [
                  "Submitted",
                  "The contract checks your text, amount and need before taking the fee.",
                ],
                [
                  "Waiting for the Cabal",
                  `Up to ${duration(Number(con(s, "CabalGate.PENDING_EXPIRY") || 0))}; ${String(con(s, "CabalGate.PANEL_SIZE") || "—")} judges, ${String(con(s, "CabalGate.QUORUM") || "—")} must agree.`,
                ],
                [
                  "Verdict",
                  `Approved: sell within ${duration(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 0))}. Denied: one appeal within ${duration(Number(con(s, "CabalGate.COOLDOWN") || 0))}. No verdict: no cooldown, no fee back.`,
                ],
                [
                  "Record points",
                  "Points are held while objections are open or pending. Press Record my points when the hold ends.",
                ],
              ].map(([a, b], i) => (
                <li className="is-later" key={a}>
                  <span className="timeline__dot">{i + 1}</span>
                  <div>
                    <p className="timeline__title">{a}</p>
                    <p className="timeline__meta">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Pleas that passed">
            {s?.pleas
              .filter((p) => [2, 4, 5].includes(p.status))
              .slice(0, 2)
              .map((p) => (
                <PleaCard key={String(p.id)} p={p} />
              ))}
            {!s?.pleas.some((p) => [2, 4, 5].includes(p.status)) && (
              <Empty title="No approvals yet">
                The first successful case will appear here.
              </Empty>
            )}
            <a className="link-btn" href="#/wall">
              Every plea on the Wall
            </a>
          </Panel>
        </div>
      </div>
    </div>
  );
}
