import { Fragment } from "react";
import { useAccount } from "wagmi";
import { useApp, useRead } from "./context";
import {
  con,
  val,
  seasonState,
  tokenAmount,
  clock,
  span,
  short,
  getPlea,
  type Plea,
  amount,
  verdictSeason,
} from "./chain";
import {
  Action,
  AddressView,
  Costs,
  Countdown,
  Empty,
  Icon,
  Notice,
  Panel,
  Title,
  TxButton,
} from "./components";
const equal = (a: string, b?: string) => a?.toLowerCase() === b?.toLowerCase();
export function Seasons() {
  const { s, now } = useApp(),
    state = seasonState(s, now);
  return (
    <>
      <Title title={state ? `Season ${state.displayed + 1n}` : "Seasons"}>
        {state?.dead
          ? `Season ${state.displayed + 1n} ended at ${clock(state.current.bounds[2])}, when the Cabal died. No season ${state.displayed + 2n} follows: the leaderboard as it stands is the last one.`
          : s
            ? `${span(Number(con(s, "Seasons.SEASON")))}. Your best three approved pleas count, and the top ${con(s, "Seasons.TOP")} with at least ${con(s, "Seasons.MIN_POINTS")} points share the season prize pot and the PLEA bonus.`
            : "Reading the leaderboard from Seasons…"}
      </Title>
      {!s ? (
        <p className="loading-label">
          <Icon name="hourglass" />
          Reading the leaderboard from Seasons…
        </p>
      ) : !state ? (
        <Empty icon="trophy" title="No season has begun.">
          The first season begins when trading opens.
        </Empty>
      ) : (
        <>
          {state.awaiting !== undefined && state.awaiting < state.displayed && (
            <section className="section">
              <div className="section__head">
                <h2>Season {String(state.awaiting + 1n)} ended</h2>
                <span className="pill">Awaiting close</span>
              </div>
              {state.dead && state.displayed > state.awaiting && (
                <p>
                  Seasons {String(state.awaiting + 1n)} to{" "}
                  {String(state.displayed + 1n)} wait to be closed, oldest
                  first.
                </p>
              )}
              <SeasonView season={state.awaiting} />
            </section>
          )}
          <div className="pills">
            {state.dead ? (
              <span className="pill">
                {state.current.closed ? "Closed" : "Ended with the Cabal"}
              </span>
            ) : (
              <Countdown
                until={Number(state.current.bounds[2])}
                label={`Season ${state.displayed + 1n} ends in`}
              />
            )}
          </div>
          <SeasonView season={state.displayed} />
          {val(s, "Seasons.finished") && (
            <Panel level={2} title="No more seasons">
              <p>
                The Cabal is dead and every season is closed. Send the remaining
                prize assets to the buy wall; leftover PLEA bonuses are burned.
              </p>
              <TxButton
                name="Seasons"
                fn="flushToWall"
                label="Send leftovers to the buy wall"
              />
            </Panel>
          )}
        </>
      )}
      <PastSeasons />
    </>
  );
}
function SeasonView({ season }: { season: bigint }) {
  const { r, s, now } = useApp(),
    { address } = useAccount(),
    data = s!.v.seasons[String(season)],
    bounds = data.bounds,
    pot = BigInt(data.pot),
    top = data.top.filter((e: any) => !/^0x0{40}$/i.test(e.wallet));
  const minPoints = Number(con(s, "Seasons.MIN_POINTS")),
    bonus =
      season < BigInt(con(s, "Seasons.BONUS_SEASONS"))
        ? BigInt(con(s, "Seasons.BONUS_PER_SEASON"))
        : 0n,
    grace = Number(con(s, "Seasons.CLOSE_GRACE")),
    closeAt = Number(bounds[2]) + grace;
  const query = useRead(
    async () => {
      const rows = await Promise.all(
        top.map(async (e: any) => {
          const [name, best, seat, excluded] = await Promise.all([
            read("Letterbox", "nameOf", [e.wallet]),
            read("Seasons", "bestOf", [season, e.wallet]),
            read("Seasons", "holdsSeat", [e.wallet]),
            read("Seasons", "excluded", [e.wallet]),
          ]);
          return { ...e, name, best, seat, excluded };
        }),
      );
      const [best, seatHeld] = address
        ? await Promise.all([
            read("Seasons", "bestOf", [season, address]),
            read("Seasons", "holdsSeat", [address]),
          ])
        : [[0, 0, 0], false];
      const eligibleLogs = s!.logs.filter(
        (l) => l.eventName === "Verdict" && l.args.approved,
      );
      const ids = eligibleLogs
        .filter(
          (l) =>
            !s!.logs.some(
              (x) => x.eventName === "Recorded" && x.args.pleaId === l.args.id,
            ),
        )
        .map((l) => l.args.id);
      const pleas = await Promise.all(ids.map((id) => getPlea(r, id, s!.logs)));
      const closeIds = pleas
        .filter(
          (p) =>
            seasonOf(p) === season &&
            !p.recorded &&
            !p.excluded &&
            !p.standing?.[1],
        )
        .map((p) => p.id);
      const own = pleas.filter(
        (p) =>
          equal(p.seller, address) &&
          !p.excluded &&
          !p.standing?.[1] &&
          seasonOf(p) === season,
      );
      return { rows, best, own, closeIds, seatHeld };
    },
    [
      String(season),
      address,
      top.map((x: any) => x.wallet + ":" + x.points).join(","),
    ],
    !!s,
  );
  function read(name: string, fn: string, args: any[] = []) {
    return r.client.readContract({
      address: r.addresses[name],
      abi: r.abis[name],
      functionName: fn,
      args,
    }) as Promise<any>;
  }
  function seasonOf(p: Plea) {
    return verdictSeason(
      p.verdictAt,
      BigInt(val(s, "CabalGate.startedAt")),
      BigInt(con(s, "Seasons.SEASON")),
    );
  }
  const fundedTx = s!.logs
    .filter((l) => l.eventName === "PrizeFunded" && l.args.season === season)
    .map((l) => l.transactionHash);
  const deliveries = s!.logs.filter(
      (l) =>
        l.eventName === "Delivered" &&
        fundedTx.includes(l.transactionHash) &&
        l.args.fee > 0n,
    ),
    stakes = s!.logs.filter(
      (l) =>
        l.eventName === "StakeSettled" &&
        equal(l.args.to, r.addresses.Seasons) &&
        fundedTx.includes(l.transactionHash),
    );
  const autoFees = deliveries.reduce((n, l) => n + BigInt(l.args.fee), 0n),
    stakeFees = stakes.reduce((n, l) => n + BigInt(l.args.amount), 0n),
    rolled =
      season === BigInt(val(s, "Seasons.nextToClose"))
        ? BigInt(val(s, "Seasons.rollover"))
        : 0n;
  const rows = query.data?.rows || [],
    rank = rows.findIndex((e: any) => equal(e.wallet, address)),
    best = query.data?.best || [0, 0, 0],
    points = best.reduce((a: number, b: number) => a + Number(b), 0),
    share = rank >= 0 ? BigInt(s!.v.shares[rank]) : 0n,
    qualifies = rank >= 0 && points >= minPoints && !rows[rank]?.excluded;
  const qualifiesRows = rows.filter(
    (e: any) => !e.excluded && Number(e.points) >= minPoints,
  );
  const shares = rows.reduce(
      (n: bigint, e: any, i: number) =>
        n +
        (!e.excluded && Number(e.points) >= minPoints
          ? BigInt(s!.v.shares[i])
          : 0n),
      0n,
    ),
    paid = rows.reduce(
      (n: bigint, e: any, i: number) =>
        n +
        (!e.excluded && Number(e.points) >= minPoints
          ? (pot * BigInt(s!.v.shares[i])) / 10000n
          : 0n),
      0n,
    ),
    bonusPaid = rows.reduce(
      (n: bigint, e: any, i: number) =>
        n +
        (!e.excluded && Number(e.points) >= minPoints
          ? (bonus * BigInt(s!.v.shares[i])) / 10000n
          : 0n),
      0n,
    );
  const seatHeld = query.data?.seatHeld;
  const sums = (values: number[]) =>
    values.join(" + ") + " = " + values.reduce((a, b) => a + Number(b), 0);
  const judgeScores = (wallet: string, values: number[]) =>
    values
      .map(
        (value) =>
          s!.logs.find(
            (l) =>
              l.eventName === "Recorded" &&
              l.args.season === season &&
              equal(l.args.wallet, wallet) &&
              Number(l.args.points) === Number(value),
          )?.args.score ?? "?",
      )
      .join(" · ");
  return (
    <>
      <div className="auto-grid form-actions-top">
        <Panel level={2} title="Ends">
          <p className="stat__value">{clock(bounds[2])}</p>
          <Costs
            rows={[
              [
                "Left",
                bounds[3] ? (
                  "Ended"
                ) : (
                  <Countdown until={Number(bounds[2])} label="Ends in" />
                ),
              ],
              ["Started", clock(bounds[1])],
              ["Length", span(Number(con(s, "Seasons.SEASON")))],
              ["Grace after the end", span(grace)],
              ["Anyone can close it", `from ${clock(closeAt)}`],
            ]}
          />
        </Panel>
        <Panel level={2} title="Season prize pot">
          <p className="stat__value">
            <span className="nowrap">{tokenAmount(pot, s, true)}</span>
          </p>
          <Costs
            rows={[
              [
                `Trade fees (${Number(con(s, "PleaHook.PRIZE_BPS")) / 100}% of every trade)`,
                tokenAmount(BigInt(data.fees) - autoFees - stakeFees, s, true),
              ],
              [
                `Site auto-sell sales (${deliveries.length} × 0.35; letters pay none)`,
                tokenAmount(autoFees, s, true),
              ],
              [
                `Overruled stakes (${stakes.length} × 0.35)`,
                tokenAmount(stakeFees, s, true),
              ],
              ...(rolled
                ? [
                    [
                      `Rolled over from season ${season}`,
                      tokenAmount(rolled, s, true),
                    ] as [string, string],
                  ]
                : []),
              ["Total", tokenAmount(pot, s, true)],
            ]}
          />
          {season > BigInt(val(s, "Seasons.nextToClose")) && (
            <p className="small">
              Plus what season{" "}
              {String(BigInt(val(s, "Seasons.nextToClose")) + 1n)} rolls over at
              its close.
            </p>
          )}
        </Panel>
        <Panel level={2} title="PLEA bonus">
          <p className="stat__value">
            <span className="nowrap">{tokenAmount(bonus, s)}</span>
          </p>
          {bonus ? (
            <Costs
              rows={[
                [
                  "Season",
                  `${season + 1n} of ${con(s, "Seasons.BONUS_SEASONS")}`,
                ],
                [
                  "Paid to",
                  `top ${con(s, "Seasons.TOP")}, ${minPoints}+ points`,
                ],
                [
                  "Shares, as for the imdTEST",
                  `${Number(s!.v.shares[0]) / 100}% to ${Number(s!.v.shares.at(-1)) / 100}%`,
                ],
                ["Unpaid shares", "burned at the close"],
                ["From", "the 6% season bonus"],
              ]}
            />
          ) : (
            <p>
              The PLEA bonus ran in seasons 1 to{" "}
              {String(con(s, "Seasons.BONUS_SEASONS"))}.
            </p>
          )}
        </Panel>
      </div>
      <div className="split split--stretch form-actions-top">
        <Panel card level={2} title="Your standing">
          {!address ? (
            <Notice title="Connect in the top bar to see your rank.">
              <p>
                The leaderboard, the season prize pot and past seasons read
                without a wallet.
              </p>
            </Notice>
          ) : (
            <>
              <div className="stats stats--3">
                <div className="stat">
                  <span className="stat__label">Rank</span>
                  <span className="stat__value">
                    {rank >= 0 ? rank + 1 : "none yet"}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">Points</span>
                  <span className="stat__value">{points}</span>
                  <span className="stat__note">
                    {minPoints} to share the season prize pot
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">Prize now</span>
                  <span className="stat__value">
                    {tokenAmount(
                      qualifies ? (pot * share) / 10000n : 0n,
                      s,
                      true,
                    )}
                  </span>
                  <span className="stat__note">
                    +{" "}
                    {tokenAmount(qualifies ? (bonus * share) / 10000n : 0n, s)}
                  </span>
                </div>
              </div>
              <Costs
                rows={[
                  ["Best three", sums(best)],
                  ...(seatHeld && points > 0
                    ? [
                        [
                          "Judges’ scores, before × 1.2",
                          judgeScores(address, best),
                        ] as [string, string],
                      ]
                    : []),
                  [
                    "Share at rank " + (rank + 1),
                    qualifies ? `${Number(share) / 100}%` : "none yet",
                  ],
                ]}
              />
              {query.data?.own.map((p: Plea) => {
                const until = Math.max(
                  Number(p.verdictAt) +
                    Number(con(s, "Tribunal.OBJECTION_WINDOW")),
                  ...(p.objections || [])
                    .filter((o) => o.ruling === 1)
                    .map(
                      (o) =>
                        Number(o.filedAt) +
                        Number(con(s, "Tribunal.PENDING_EXPIRY")),
                    ),
                );
                return (
                  <div className="stack" key={String(p.id)}>
                    {data.closed ? (
                      <p>
                        Season {season + 1n} is closed; these points were not
                        recorded.
                      </p>
                    ) : (
                      p.standing?.[0] && (
                        <>
                          <Notice
                            title={`Plea #${p.id}’s +${p.points} points are held until ${clock(until)}.`}
                          >
                            <p>
                              Record them after objections close. Nothing
                              records them by itself.
                            </p>
                          </Notice>
                          <div>
                            <Countdown
                              until={until}
                              label="Objections close in"
                            />
                          </div>
                        </>
                      )
                    )}
                    {!data.closed && (
                      <TxButton
                        name="Seasons"
                        fn="record"
                        args={[p.id]}
                        label="Record my points"
                        disabled={!!p.standing?.[0] || data.closed}
                        reason={
                          p.standing?.[0]
                            ? `Record your +${p.points} points after ${clock(until)}, when objections on plea #${p.id} close. Nothing records them by itself: anyone can press Record my points.`
                            : undefined
                        }
                      />
                    )}
                  </div>
                );
              })}
              {!points && !query.data?.own.length && (
                <p>
                  No recorded plea yet. Your best three approved pleas count
                  here.{" "}
                  {!val(s, "CabalGate.diedAt") && (
                    <a href="#/plead">Write a plea</a>
                  )}
                </p>
              )}
            </>
          )}
        </Panel>
        <Panel level={2} title="The seat multiplier">
          <div id="seat" />
          <p>
            Seasons reads the identity.md seat NFT when points are recorded.
            Each judges’ score is multiplied by{" "}
            {Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) / 10000} and rounded
            down. The need and the judges’ verdict stay the same.
          </p>
          <Costs
            rows={[
              [
                "36, with a seat",
                String(
                  Math.floor(
                    (36 * Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS"))) /
                      10000,
                  ),
                ),
              ],
              [
                "45, with a seat",
                String(
                  Math.floor(
                    (45 * Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS"))) /
                      10000,
                  ),
                ),
              ],
              ["36, without a seat", "36"],
            ]}
          />
          <AddressView address={val(s, "Seasons.seat")} label="Seat NFT" />
          {seatHeld && (
            <Notice
              kind="ok"
              title="Seat held: every recorded plea earns × 1.2."
            >
              <p>Rounded down for each plea.</p>
            </Notice>
          )}
        </Panel>
      </div>
      <section className="section">
        <div className="panel panel--flush">
          <div className="panel__head">
            <h2>Season {String(season + 1n)} leaderboard</h2>
            <p className="meta">
              Season prize pot {tokenAmount(pot, s, true)} +{" "}
              {tokenAmount(bonus, s)} · top {String(con(s, "Seasons.TOP"))} with{" "}
              {minPoints}+ points
            </p>
          </div>
          {query.error ? (
            <div className="error-box">
              <p className="error-box__title">Can’t read the leaderboard</p>
              <p>{query.error}</p>
            </div>
          ) : query.loading ? (
            <p className="loading-label">
              <Icon name="hourglass" />
              Reading the leaderboard from Seasons…
            </p>
          ) : !top.length ? (
            <Empty
              icon="trophy"
              title="No points yet"
              action={
                !val(s, "CabalGate.diedAt")
                  ? { href: "#/plead", label: "Write a plea" }
                  : undefined
              }
            >
              No recorded pleas in this season yet. The court is in session.
            </Empty>
          ) : (
            <ol className="lb" aria-label={`Season ${season + 1n} leaderboard`}>
              <li className="lb__head" aria-hidden="true">
                <span>Rank</span>
                <span>Player</span>
                <span>Best three</span>
                <span>Points</span>
                <span>Prize now</span>
              </li>
              {rows.map((e: any, i: number) => {
                const qualified = !e.excluded && Number(e.points) >= minPoints,
                  bps = BigInt(s!.v.shares[i]);
                return (
                  <Fragment key={e.wallet}>
                    {i === qualifiesRows.length && (
                      <li className="lb__bar">
                        {minPoints}-point line · below it no prize: the imdTEST
                        share rolls over to season {String(season + 2n)}
                        {bonus > 0n
                          ? " and the PLEA bonus share is burned"
                          : ""}
                      </li>
                    )}
                    <li
                      className={`lb__row ${!qualified ? "lb__row--out" : ""} ${equal(e.wallet, address) ? "lb__row--you" : ""}`}
                    >
                      <span className="lb__rank">{i + 1}</span>
                      <span className="lb__who">
                        <a
                          href={`#/profile/${e.wallet}`}
                          className={!e.name ? "mono" : ""}
                        >
                          {e.name || short(e.wallet)}
                        </a>
                        {equal(e.wallet, address) && (
                          <span className="badge badge--you">YOU</span>
                        )}
                      </span>
                      <span className="lb__best">
                        <span className="lb__label">Best three </span>
                        {e.best.join(" · ")}
                        {e.seat && (
                          <span className="seatx nowrap">
                            ({judgeScores(e.wallet, e.best)} × 1.2)
                          </span>
                        )}
                      </span>
                      <span className="lb__pts">
                        <span className="lb__label">Points </span>
                        {e.points}
                      </span>
                      <span className="lb__prize">
                        <span className="lb__label">Prize now </span>
                        {qualified ? (
                          <>
                            <span className="nowrap">
                              {tokenAmount((pot * bps) / 10000n, s, true)}
                            </span>{" "}
                            +{" "}
                            <span className="nowrap">
                              {tokenAmount((bonus * bps) / 10000n, s)}
                            </span>
                          </>
                        ) : (
                          `no prize (${e.points} of ${minPoints})`
                        )}
                      </span>
                    </li>
                  </Fragment>
                );
              })}
              {rows.length > 0 && qualifiesRows.length === rows.length && (
                <li className="lb__bar">
                  {minPoints}-point line · below it no prize: the imdTEST share
                  rolls over to season {String(season + 2n)}
                  {bonus > 0n ? " and the PLEA bonus share is burned" : ""}
                </li>
              )}
            </ol>
          )}
          <p className="panel__foot">
            Equal points: the wallet whose newest counted plea is older ranks
            higher. Seat holders’ judges’ scores are in brackets (each × 1.2,
            rounded down).
          </p>
        </div>
        <div className="split form-actions-top">
          <Panel title="If the season ended now" className="panel--sunken">
            <Costs
              rows={[
                [
                  `Paid to ${qualifiesRows.length} wallets`,
                  `${Number(shares) / 100}% · ${tokenAmount(paid, s, true)}`,
                ],
                [
                  `Rolls over to season ${season + 2n}`,
                  `${100 - Number(shares) / 100}% · ${tokenAmount(pot - paid, s, true)}`,
                ],
                ["PLEA bonus paid", tokenAmount(bonusPaid, s)],
                ["PLEA bonus burned", tokenAmount(bonus - bonusPaid, s)],
              ]}
            />
            <p className="small">
              Each imdTEST amount is rounded down on its own; the leftover rolls
              over.
            </p>
          </Panel>
          <Panel title="Closing the season">
            {data.closed ? (
              <p>Season {String(season + 1n)} is closed.</p>
            ) : (
              <>
                <p>
                  Anyone can close it from {clock(closeAt)} (
                  {span(grace, "adj")} grace). Closing records eligible pleas,
                  pays the qualifying wallets and carries the unpaid prize
                  shares forward.
                </p>
                <TxButton
                  name="Seasons"
                  fn="closeSeason"
                  resetKey={`close:${season}`}
                  args={[query.data?.closeIds || []]}
                  label={`Close season ${season + 1n}`}
                  disabled={
                    now < closeAt ||
                    !bounds[0] ||
                    season !== BigInt(val(s, "Seasons.nextToClose")) ||
                    !query.data
                  }
                  reason={
                    now < closeAt
                      ? `Anyone can close it from ${clock(closeAt)} (${span(grace, "adj")} grace).`
                      : season !== BigInt(val(s, "Seasons.nextToClose"))
                        ? "Close the oldest season first."
                        : undefined
                  }
                />
              </>
            )}
          </Panel>
        </div>
      </section>
    </>
  );
}
function PastSeasons() {
  const { r, s } = useApp(),
    { address } = useAccount(),
    logs =
      s?.logs
        .filter((l) => l.eventName === "SeasonClosedOut")
        .slice()
        .reverse() || [];
  const details = useRead(
    () =>
      Promise.all(
        logs.map(async (l) => {
          const [block, tx, bounds, top] = await Promise.all([
            r.client.getBlock({ blockNumber: l.blockNumber }),
            r.client.getTransaction({ hash: l.transactionHash }),
            r.client.readContract({
              address: r.addresses.Seasons,
              abi: r.abis.Seasons,
              functionName: "seasonBounds",
              args: [l.args.season],
            }),
            r.client.readContract({
              address: r.addresses.Seasons,
              abi: r.abis.Seasons,
              functionName: "topOf",
              args: [l.args.season],
            }),
          ]);
          return { l, block, tx, bounds, top };
        }),
      ),
    [logs.length],
    !!s && logs.length > 0,
  );
  return (
    <section className="section">
      <div className="section__head">
        <h2>Past seasons</h2>
      </div>
      {!logs.length ? (
        <p>No seasons have closed in this test run.</p>
      ) : (
        (details.data || []).map(({ l, block, tx, bounds, top }: any) => {
          const prizes = s!.logs.filter(
              (e) =>
                e.eventName === "PrizePaid" && e.args.season === l.args.season,
            ),
            bonuses = s!.logs.filter(
              (e) =>
                e.eventName === "BonusPaid" && e.args.season === l.args.season,
            ),
            burn =
              s!.logs.find(
                (e) =>
                  e.eventName === "BonusBurned" &&
                  e.args.season === l.args.season,
              )?.args.amount || 0n;
          const selected = prizes.filter(
            (e) => Number(e.args.rank) <= 3 || equal(e.args.wallet, address),
          );
          return (
            <Panel
              key={String(l.args.season)}
              title={`Season ${Number(l.args.season) + 1}`}
            >
              <span className="pill">Closed</span>
              <p className="meta">
                {clock(bounds[1])} to {clock(bounds[2])}. Closed{" "}
                <a href={`${r.network.explorer}/tx/${l.transactionHash}`}>
                  {clock(block.timestamp)}
                </a>{" "}
                by <span className="mono">{short(tx.from)}</span>.
              </p>
              <Costs
                rows={[
                  ["Season prize pot", tokenAmount(l.args.pot, s, true)],
                  [
                    `Paid to ${prizes.length} wallets`,
                    tokenAmount(l.args.paid, s, true),
                  ],
                  [
                    `Rolled over to season ${Number(l.args.season) + 2}`,
                    tokenAmount(
                      BigInt(l.args.pot) - BigInt(l.args.paid),
                      s,
                      true,
                    ),
                  ],
                  [
                    "PLEA bonus paid",
                    tokenAmount(
                      bonuses.reduce((n, e) => n + BigInt(e.args.amount), 0n),
                      s,
                    ),
                  ],
                  ["PLEA bonus burned", tokenAmount(burn, s)],
                ]}
              />
              <h4>Top three, and you</h4>
              {selected.map((e) => (
                <p key={e.args.wallet}>
                  #{Number(e.args.rank)} ·{" "}
                  <a className="mono" href={`#/profile/${e.args.wallet}`}>
                    {short(e.args.wallet)}
                  </a>{" "}
                  · {top[Number(e.args.rank) - 1]?.points} points ·{" "}
                  {tokenAmount(e.args.amount, s, true)} +{" "}
                  {tokenAmount(
                    bonuses.find((b) => equal(b.args.wallet, e.args.wallet))
                      ?.args.amount || 0n,
                    s,
                  )}
                </p>
              ))}
              <p className="small">
                Each imdTEST amount is rounded down on its own.
              </p>
            </Panel>
          );
        })
      )}
    </section>
  );
}
