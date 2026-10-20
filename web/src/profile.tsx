import { useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import {
  isAddress,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
} from "viem";
import { useApp, useRead, useTx } from "./context";
import { claimsAbi } from "./config";
import {
  read,
  getPlea,
  con,
  val,
  amount,
  tokenAmount,
  cashback,
  smallAmount,
  seasonState,
  potOf,
  clock,
  duration,
  heldTime,
  short,
  type Plea,
} from "./chain";
import { pendingState, factParts } from "./models";
import {
  Action,
  AddressView,
  AmountInput,
  Costs,
  Countdown,
  Empty,
  FactCells,
  Icon,
  Meter,
  Notice,
  Panel,
  PleaCard,
  TextBox,
  Title,
  textCheck,
} from "./components";
export function Profile({ target }: { target?: string }) {
  const { r, s, now, refresh } = useApp(),
    { address } = useAccount(),
    { disconnect } = useDisconnect(),
    wallet = target && isAddress(target) ? (target as Address) : address,
    mine = !!wallet && wallet.toLowerCase() === address?.toLowerCase(),
    [lookup, setLookup] = useState(""),
    [name, setName] = useState(""),
    [dirty, setDirty] = useState(false),
    tx = useTx(name);
  const season = seasonState(s, now),
    info = useRead(
      async () => {
        const [
          plea,
          pair,
          basis,
          current,
          seat,
          claimBalance,
          pending,
          executed,
          denied,
          lapsed,
          excluded,
        ] = await Promise.all([
          read(r, "PLEA", "balanceOf", [wallet]),
          read(r, "PairToken", "balanceOf", [wallet]),
          read(r, "PleaHook", "basisOf", [wallet]),
          read(r, "Letterbox", "nameOf", [wallet]),
          read(r, "Seasons", "holdsSeat", [wallet]),
          r.client.readContract({
            address: r.network.uniswapV4.poolManager,
            abi: claimsAbi,
            functionName: "balanceOf",
            args: [wallet!, BigInt(r.addresses.PairToken)],
          }),
          read(r, "CabalGate", "pendingOf", [wallet]),
          read(r, "CabalGate", "lastExecutedAt", [wallet]),
          read(r, "CabalGate", "lastDeniedAt", [wallet]),
          read(r, "CabalGate", "lastLapsedAt", [wallet]),
          read(r, "Seasons", "excluded", [wallet]),
        ]);
        const pendingPlea = pending
            ? await getPlea(r, pending, s?.logs)
            : undefined,
          raw =
            plea / 5n < BigInt(con(s, "CabalGate.MAX_SELL"))
              ? plea / 5n
              : BigInt(con(s, "CabalGate.MAX_SELL")),
          fact = raw
            ? Number(await read(r, "CabalGate", "factScore", [wallet, raw]))
            : 0;
        const submissions = s!.logs
          .filter(
            (l) =>
              l.eventName === "PleaSubmitted" &&
              l.args.seller.toLowerCase() === wallet!.toLowerCase(),
          )
          .slice(-2)
          .reverse();
        const pleas = await Promise.all(
          submissions.map((l) => getPlea(r, l.args.id, s!.logs)),
        );
        const keys = [
          ...new Set([
            ...s!.logs
              .filter(
                (l) =>
                  l.eventName === "Recorded" &&
                  l.args.wallet.toLowerCase() === wallet!.toLowerCase(),
              )
              .map((l) => String(l.args.season)),
            ...(season ? [String(season.displayed)] : []),
          ]),
        ];
        const seasons = await Promise.all(
          keys.map(async (k) => {
            const index = BigInt(k),
              [best, top, closed, fees, bounds] = await Promise.all([
                read(r, "Seasons", "bestOf", [index, wallet]),
                read(r, "Seasons", "topOf", [index]),
                read(r, "Seasons", "closed", [index]),
                read(r, "Seasons", "seasonFees", [index]),
                read(r, "Seasons", "seasonBounds", [index]),
              ]);
            const rank = top.findIndex(
                (e: any) => e.wallet.toLowerCase() === wallet!.toLowerCase(),
              ),
              points = best.reduce((n: number, x: number) => n + Number(x), 0),
              share = rank >= 0 ? BigInt(s!.v.shares[rank]) : 0n,
              pot =
                BigInt(fees) +
                (index === BigInt(val(s, "Seasons.nextToClose"))
                  ? BigInt(val(s, "Seasons.rollover"))
                  : 0n),
              bonus =
                index < BigInt(con(s, "Seasons.BONUS_SEASONS"))
                  ? BigInt(con(s, "Seasons.BONUS_PER_SEASON"))
                  : 0n;
            const paid = s!.logs.filter(
              (l) =>
                ["PrizePaid", "BonusPaid"].includes(l.eventName) &&
                l.args.season === index &&
                l.args.wallet.toLowerCase() === wallet!.toLowerCase(),
            );
            return {
              index,
              best,
              rank,
              points,
              closed,
              bounds,
              imd: closed
                ? paid
                    .filter((l) => l.eventName === "PrizePaid")
                    .reduce((n, l) => n + BigInt(l.args.amount), 0n)
                : !excluded && points >= Number(con(s, "Seasons.MIN_POINTS"))
                  ? (pot * share) / 10000n
                  : 0n,
              bonus: closed
                ? paid
                    .filter((l) => l.eventName === "BonusPaid")
                    .reduce((n, l) => n + BigInt(l.args.amount), 0n)
                : !excluded && points >= Number(con(s, "Seasons.MIN_POINTS"))
                  ? (bonus * share) / 10000n
                  : 0n,
            };
          }),
        );
        return {
          plea,
          pair,
          basis,
          current,
          seat,
          claimBalance,
          pendingPlea,
          executed,
          denied,
          lapsed,
          raw,
          fact,
          pleas,
          seasons,
        };
      },
      [wallet],
      !!wallet && !!s,
    );
  useEffect(() => {
    if (info.data && !dirty) setName(info.data.current);
  }, [info.data, dirty]);
  const owner = useRead(
      () => read(r, "Letterbox", "nameOwner", [keccak256(stringToHex(name))]),
      [name],
      !!s && !!name && textCheck("name", name).ok,
    ),
    taken =
      !!owner.data &&
      owner.data !== zeroAddress &&
      owner.data.toLowerCase() !== wallet?.toLowerCase();
  const data = info.data,
    derived = pendingState(
      data?.pendingPlea,
      now,
      Number(con(s, "CabalGate.EXECUTE_WINDOW")),
      Number(con(s, "CabalGate.PENDING_EXPIRY")),
      Number(data?.lapsed || 0n),
    ),
    cooldown =
      Math.max(
        Number(data?.executed || 0n),
        Number(data?.denied || 0n),
        derived.lapsedAt,
      ) + Number(con(s, "CabalGate.COOLDOWN")),
    label = data?.current || short(wallet || ""),
    next = derived.open
      ? `after #${data?.pendingPlea?.id}`
      : cooldown > now
        ? clock(cooldown)
        : "Ready now";
  if (!wallet)
    return (
      <>
        <Title title="Your profile" />
        <Notice title="Connect in the top bar to see your profile.">
          <p>
            Balances, pleas and seasons read without a wallet. Look up any
            address below.
          </p>
        </Notice>
        <AddressLookup value={lookup} setValue={setLookup} />
      </>
    );
  return (
    <>
      <Title title={label || "Profile"}>
        {mine
          ? "Your wallet as PLEA sees it: what you hold, the buy record your next plea is scored on, your name, your pleas and your seasons."
          : `${label}’s public PLEA holdings, pleas and seasons.`}
      </Title>
      <div className="cluster">
        {data?.seat && (
          <span className="badge badge--seat">
            <Icon name="armchair" />
            SEAT ×{Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) / 10000}
          </span>
        )}
        {!mine && <span className="pill">Read only</span>}
      </div>
      <AddressView address={wallet} label={data?.current || "profile"} />
      {mine && (
        <button className="link-btn" onClick={() => disconnect()}>
          Disconnect this wallet
        </button>
      )}
      {info.error ? (
        <div className="error-box">
          <p className="error-box__title">Can’t read this profile</p>
          <p>{info.error}</p>
          <button className="btn btn--sm" onClick={refresh}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="loading-label">
          <Icon name="hourglass" />
          Reading {label}’s balances, pleas and seasons from the chain…
        </p>
      ) : (
        <>
          <div className="stats stats--4">
            {(mine
              ? [
                  [
                    "PLEA",
                    tokenAmount(data.plea, s),
                    `A plea: ${tokenAmount(data.plea / 100n, s)} to ${tokenAmount(data.plea / 2n < BigInt(con(s, "CabalGate.MAX_SELL")) ? data.plea / 2n : BigInt(con(s, "CabalGate.MAX_SELL")), s)}`,
                  ],
                  [
                    s?.constants.pairSymbol,
                    tokenAmount(data.pair, s, true),
                    `For buys and the ${tokenAmount(con(s, "CabalGate.ORACLE_FEE"), s, true)} oracle fee`,
                  ],
                  [
                    "Cashback earned",
                    smallAmount(cashback(s!.logs, wallet), s),
                    "Paid in plain imdTEST in this test run",
                  ],
                  [
                    "Next plea",
                    next,
                    "A sale, denial or lapse starts the cooldown",
                  ],
                ]
              : [
                  ["PLEA", tokenAmount(data.plea, s), "Public holdings"],
                  ...data.seasons
                    .slice(-2)
                    .reverse()
                    .map((k) => [
                      `Season ${k.index + 1n}`,
                      k.rank >= 0 ? `#${k.rank + 1}` : "none yet",
                      `${k.points} points · ${k.best.join(" + ")}`,
                    ]),
                  ["Next plea", next, "Public cooldown"],
                ]
            ).map(([a, b, note], i) => (
              <div className="stat" key={i}>
                <span className="stat__label">{a}</span>
                <span className="stat__value">{b}</span>
                <span className="stat__note">{note}</span>
              </div>
            ))}
          </div>
          {!mine && (
            <Notice title={`You are viewing ${label}’s profile.`}>
              <p>
                Balances, pleas and seasons are public and read from the chain.
                Only {label} can change this name, so there is no name box.{" "}
                {address && <a href="#/profile">Back to your profile</a>}
              </p>
            </Notice>
          )}
          {mine && derived.open && data.pendingPlea?.status === 2 && (
            <Notice
              title={`Plea #${data.pendingPlea.id} is open: sell by ${clock(Number(data.pendingPlea.verdictAt) + Number(con(s, "CabalGate.EXECUTE_WINDOW")))}.`}
            >
              <div>
                <Countdown
                  urgent
                  until={
                    Number(data.pendingPlea.verdictAt) +
                    Number(con(s, "CabalGate.EXECUTE_WINDOW"))
                  }
                  label="Sell within"
                />
              </div>
              <a
                className="btn btn--ink btn--sm"
                href={`#/p/${data.pendingPlea.id}`}
              >
                Open plea #{String(data.pendingPlea.id)} to sell
              </a>
            </Notice>
          )}
          <div className="split form-actions-top">
            <Panel level={2} title={mine ? "Your buy record" : "Buy record"}>
              <Costs
                rows={[
                  [
                    "Cost basis",
                    data.basis[1]
                      ? tokenAmount(
                          (data.basis[0] * 10n ** 24n) / data.basis[1],
                          s,
                          true,
                        ) + " per 1M"
                      : "No buy record",
                  ],
                  [
                    "Held, buy-weighted",
                    data.basis[2]
                      ? heldTime(now - Number(data.basis[2]))
                      : "No buy record",
                  ],
                  [
                    `Now, at ${tokenAmount((BigInt(val(s, "PleaHook.latestPrice") || 0n) * 10n ** 24n) / 2n ** 96n, s, true)} per 1M`,
                    data.basis[0]
                      ? `${((Number((data.basis[1] * BigInt(val(s, "PleaHook.latestPrice") || 0n)) / 2n ** 96n) * 100) / Number(data.basis[0]) - 100).toFixed(1)}%`
                      : "No buy record",
                  ],
                  [
                    `${s?.constants.pairSymbol} claims on the PoolManager`,
                    smallAmount(data.claimBalance, s),
                  ],
                ]}
              />
              <p className="small">
                Paid on opening buys when the pool could not pay at once. They
                are ERC-6909 balances on Uniswap v4’s PoolManager (id = the
                imdTEST address), separate from the imdTEST balance; this site
                cannot redeem them.
              </p>
              {mine && !val(s, "CabalGate.diedAt") && (
                <>
                  <h3>Your next plea, at 20%</h3>
                  {data.plea === 0n ? (
                    <p>
                      This wallet holds no PLEA, so it has nothing to plead.
                    </p>
                  ) : (
                    <>
                      <FactCells
                        parts={factParts(
                          data.plea,
                          data.raw,
                          data.basis,
                          BigInt(val(s, "PleaHook.latestPrice") || 0n),
                          BigInt(val(s, "PleaHook.price24hAgo") || 0n),
                          Number(val(s, "CabalGate.startedAt")),
                          now,
                        )}
                        total={data.fact}
                      />
                      <Meter
                        fact={data.fact}
                        need={Number(con(s, "CabalGate.PASS_MARK")) - data.fact}
                        label={`No score yet. A 20% plea needs ${Number(con(s, "CabalGate.PASS_MARK")) - data.fact} of ${con(s, "CabalGate.MAX_PLEA_SCORE")} from the judges.`}
                      />
                      <p>
                        {tokenAmount(data.raw, s)} at today’s balance. A new buy
                        or checkpoint can change these facts.
                      </p>
                      <a className="btn btn--sm" href="#/plead">
                        Plead to sell <Icon name="arrow-right" />
                      </a>
                    </>
                  )}
                </>
              )}
            </Panel>
            {mine && (
              <Panel level={2} card title="Display name">
                <p>
                  Shown on the Wall and the leaderboard instead of{" "}
                  <span className="mono">{short(wallet)}</span>:
                </p>
                <p className="wall-card__who">{name || short(wallet)}</p>
                <TextBox
                  kind="name"
                  fieldId="profile-name"
                  label="Display name"
                  value={name}
                  onChange={(v) => {
                    setName(v);
                    setDirty(true);
                  }}
                  currentName={data.current}
                  extraError={
                    taken ? `${name} is taken. Try another name.` : undefined
                  }
                />
                <div className="btn-row">
                  <Action
                    {...tx}
                    label="Save name"
                    describedBy="profile-name-checks"
                    pendingLabel="Saving name…"
                    onRun={() =>
                      tx.send("Letterbox", "setName", [name], undefined, {
                        toast: () => ({
                          text: name
                            ? `Name saved: ${name}.`
                            : "Display name cleared.",
                        }),
                      })
                    }
                    disabled={
                      !tx.ready ||
                      !textCheck("name", name).ok ||
                      (!name && !data.current) ||
                      name === data.current ||
                      taken ||
                      owner.loading
                    }
                  />
                  {data.current && (
                    <button
                      className="link-btn"
                      aria-disabled={tx.busy}
                      onClick={() => {
                        if (!tx.busy) {
                          setName("");
                          setDirty(true);
                        }
                      }}
                    >
                      Clear name
                    </button>
                  )}
                </div>
                <p className="field__hint">
                  Names are unique. Reserved: cabal, admin, imd, plea and owner.
                </p>
                <p className="small">
                  Or send the letter NAME &lt;name&gt; to the Letterbox from
                  Etherscan; NAME alone clears it.{" "}
                  <a href="#/letters">How letters work</a>
                </p>
              </Panel>
            )}
          </div>
          <section className="section">
            <div className="section__head">
              <h2>{mine ? "Your" : "Their"} pleas</h2>
              <a className="link-btn" href={`#/wall?wallet=${wallet}`}>
                All pleas on the Wall <Icon name="arrow-right" />
              </a>
            </div>
            {data.pleas.length ? (
              <div className="wall-grid">
                {data.pleas.map((p) => (
                  <PleaCard key={String(p.id)} p={p} />
                ))}
              </div>
            ) : (
              <Empty
                title="No pleas yet"
                action={
                  mine &&
                  !val(s, "CabalGate.diedAt") &&
                  val(s, "PleaHook.seeded")
                    ? { href: "#/plead", label: "Write a plea" }
                    : undefined
                }
              >
                When this wallet makes its case, it appears here.
              </Empty>
            )}
          </section>
          <section className="section">
            <div className="split">
              <Panel level={2} title={mine ? "Your seasons" : "Seasons"}>
                <div
                  className="table-wrap"
                  role="region"
                  aria-label="Profile seasons"
                  tabIndex={0}
                >
                  <table className="table">
                    <caption className="sr-only">
                      Points, rank and prizes by season
                    </caption>
                    <thead>
                      <tr>
                        {["Season", "Points", "Rank", "Prize"].map((t) => (
                          <th scope="col" key={t}>
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.seasons.map((k) => (
                        <tr key={String(k.index)}>
                          <th scope="row">
                            {String(k.index + 1n)}
                            <span className="small">
                              {k.closed ? " closed, paid" : " so far"}
                            </span>
                          </th>
                          <td>{k.points}</td>
                          <td>{k.rank >= 0 ? k.rank + 1 : "none yet"}</td>
                          <td>
                            {tokenAmount(k.imd, s, true)} +{" "}
                            {tokenAmount(k.bonus, s)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small">
                  Best three approved pleas count; prizes use the current season
                  pot until the close. Each amount is rounded down.
                </p>
              </Panel>
              <Panel level={2} title="IMD seat">
                <p>
                  {data.seat
                    ? "This wallet holds an IMD seat."
                    : "No seat multiplier for this wallet now."}{" "}
                  The seat counts when the points are recorded; each score is
                  multiplied by{" "}
                  {Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) / 10000},
                  rounded down.
                </p>
                <AddressView
                  address={val(s, "Seasons.seat")}
                  label="Seat NFT"
                />
                <a className="link-btn" href="#/seasons?seat=1">
                  How the seat multiplier works <Icon name="arrow-right" />
                </a>
              </Panel>
            </div>
          </section>
        </>
      )}
    </>
  );
}
function AddressLookup({
  value,
  setValue,
}: {
  value: string;
  setValue: (v: string) => void;
}) {
  const invalid = !!value && !isAddress(value);
  return (
    <div className="field form-actions-top">
      <label className="field__label" htmlFor="profile-address">
        Any address
      </label>
      <div className={`input input--addr ${invalid ? "is-invalid" : ""}`}>
        <input
          id="profile-address"
          className="input__control"
          value={value}
          onChange={(e) => setValue(e.target.value.trim())}
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={invalid ? "profile-address-error" : undefined}
        />
      </div>
      {invalid && (
        <p className="field__hint bad-text" id="profile-address-error">
          That is not an address. Paste one that starts with 0x and has 40 more
          characters, 0–9 and a–f in either case.
        </p>
      )}
      <button
        className="btn form-actions-top"
        aria-disabled={!isAddress(value)}
        onClick={() =>
          isAddress(value) && (location.hash = `#/profile/${value}`)
        }
      >
        Show profile
      </button>
    </div>
  );
}
