import { potFor } from "./models";
import { resetHealth } from "./config";
import { getAddress } from "viem";
import { Fragment, useState } from "react";
import { useAccount } from "wagmi";
import { useApp, useRead } from "./context";
import {
  con,
  read as chainRead,
  pct,
  countedPleas,
  blockTime,
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
          {state.awaitingAll.length > 1 && (
            <p>
              Seasons {String(state.awaitingAll[0] + 1n)} to{" "}
              {String(state.awaitingAll.at(-1)! + 1n)} wait to be closed, oldest
              first.
            </p>
          )}
          {state.awaiting !== undefined && state.awaiting < state.displayed && (
            <section className="section">
              <div className="section__head">
                <h2>Season {String(state.awaiting + 1n)} ended</h2>
                <span className="pill">Awaiting close</span>
              </div>
              <SeasonView season={state.awaiting} ended />
              {state.awaitingAll
                .filter((k) => k > state.awaiting! && k < state.displayed)
                .map((k) => (
                  <WaitingSeason key={String(k)} season={k} />
                ))}
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
                connectText="Connect in the top bar to send leftovers to the buy wall."
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
function WaitingSeason({ season }: { season: bigint }) {
  const { r, s } = useApp(),
    { address } = useAccount(),
    [open, setOpen] = useState(false);
  const info = useRead(
    async () => {
      const fees = await chainRead(r, "Seasons", "seasonFees", [season]);
      const candidates = s!.logs
        .filter(
          (l) =>
            l.eventName === "Verdict" &&
            l.args.approved &&
            !s!.logs.some(
              (x) => x.eventName === "Recorded" && x.args.pleaId === l.args.id,
            ),
        )
        .filter((l) =>
          s!.logs.some(
            (x) =>
              x.eventName === "PleaSubmitted" &&
              x.args.id === l.args.id &&
              equal(x.args.seller, address),
          ),
        );
      const own = (
        await Promise.all(
          candidates.map(async (l) => ({
            id: l.args.id,
            time: await blockTime(r, l.blockNumber),
          })),
        )
      ).filter(
        (l) =>
          verdictSeason(
            BigInt(l.time),
            BigInt(val(s, "CabalGate.startedAt")),
            BigInt(con(s, "Seasons.SEASON")),
          ) === season,
      );
      return { fees, own };
    },
    [season, address],
    !!s,
  );
  return (
    <details
      className="panel waiting-season"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Season {String(season + 1n)} ended · Awaiting close · pot{" "}
        {tokenAmount(info.data?.fees, s, true)}
        {info.data?.own.length
          ? ` · your plea ${info.data.own.map((l) => `#${l.id}`).join(", ")} to record`
          : ""}
      </summary>
      {open && <SeasonView season={season} ended />}
    </details>
  );
}

function SeasonView({
  season,
  ended = false,
}: {
  season: bigint;
  ended?: boolean;
}) {
  const { r, s } = useApp(),
    known = s!.v.seasons[String(season)];
  const query = useRead(
    async () => {
      const [bounds, fees, top, closed] = await Promise.all(
        ["seasonBounds", "seasonFees", "topOf", "closed"].map((fn) =>
          chainRead(r, "Seasons", fn, [season]),
        ),
      );
      return {
        bounds,
        fees,
        top,
        closed,
        pot: potFor(
          fees,
          season,
          BigInt(val(s, "Seasons.nextToClose")),
          BigInt(val(s, "Seasons.rollover")),
        ),
      };
    },
    [season],
    !known,
  );
  const data = known || query.data;
  return data ? (
    <SeasonBody season={season} ended={ended} data={data} />
  ) : (
    <div aria-busy="true">
      <p className="loading-label">Reading season {String(season + 1n)}…</p>
      {query.error && <p role="alert">{query.error}</p>}
    </div>
  );
}
function SeasonBody({
  season,
  ended,
  data,
}: {
  season: bigint;
  ended: boolean;
  data: any;
}) {
  const { r, s, now, refresh } = useApp(),
    { address } = useAccount(),
    bounds = data.bounds,
    pot = BigInt(data.pot),
    top = data.top.filter((e: any) => !/^0x0{40}$/i.test(e.wallet));
  const last =
      !!val(s, "CabalGate.diedAt") && season === BigInt(s!.v.displayedSeason),
    level = ended ? 3 : 2;
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
          return {
            ...e,
            name,
            best: [...best].sort((a, b) => Number(b) - Number(a)),
            seat,
            excluded,
          };
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
      return {
        rows,
        best: [...best].sort((a, b) => Number(b) - Number(a)),
        own,
        closeIds,
        seatHeld,
      };
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
  const counted = (wallet: string, values: number[]) =>
    countedPleas(s!, season, wallet, values);
  const judgeScores = (wallet: string, values: number[]) =>
    counted(wallet, values)
      ?.map((p) => p.score)
      .join(" · ");
  const hasMultiplier = (wallet: string, values: number[]) =>
    counted(wallet, values)?.some((p) => p.multiplied);
  const line = `${minPoints}-point line · below it no prize: the ${s!.constants.pairSymbol} share ${last ? "goes to the buy wall" : `rolls over to season ${season + 2n}`}${bonus ? " and the PLEA bonus share is burned" : ""}`;
  function projection(p: Plea) {
    const pnt = Number(p.points || 0),
      filled = best.filter(Number),
      next = [...best, pnt].sort((a, b) => b - a).slice(0, 3),
      total = next.reduce((a, b) => a + Number(b), 0),
      rank =
        1 +
        rows.filter(
          (e: any) => !equal(e.wallet, address) && Number(e.points) >= total,
        ).length;
    const bps = BigInt(s!.v.shares[rank - 1] || 0),
      eligible = total >= minPoints && rank <= Number(con(s, "Seasons.TOP"));
    return `Recorded, they make ${total} points (${next.join(" + ")}${filled.length === 3 && pnt > Math.min(...filled) ? `; the ${Math.min(...filled)} drops out` : ""}) and rank ${rank}: ${eligible ? `${tokenAmount((pot * bps) / 10000n, s, true)} + ${tokenAmount((bonus * bps) / 10000n, s)}` : `no prize yet (${total} of ${minPoints})`} at today’s season prize pot.`;
  }
  return (
    <>
      <div className="grid season-summary form-actions-top">
        <Panel level={level} title="Ends" className="md-span-8 lg-span-4">
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
        <Panel
          level={level}
          title="Season prize pot"
          className="md-span-4 lg-span-4"
        >
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
              Plus what season {String(season)} rolls over at its close.
            </p>
          )}
        </Panel>
        <Panel level={level} title="PLEA bonus" className="md-span-4 lg-span-4">
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
                  `${pct(s!.v.shares[0])} to ${pct(s!.v.shares.at(-1))}`,
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
        <Panel card level={level} title="Your standing">
          {!address ? (
            <Notice title="Connect in the top bar to see your rank.">
              <p>
                The leaderboard, the season prize pot and past seasons read
                without a wallet.
              </p>
            </Notice>
          ) : (
            <>
              <div className="cluster standing">
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
                {rank >= 0 && (
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
                      {tokenAmount(
                        qualifies ? (bonus * share) / 10000n : 0n,
                        s,
                      )}
                    </span>
                  </div>
                )}
              </div>
              <Costs
                rows={[
                  ["Best three", sums(best)],
                  ...(hasMultiplier(address, best) && points > 0
                    ? [
                        [
                          "Judges’ scores, before × 1.2",
                          judgeScores(address, best),
                        ] as [string, string],
                      ]
                    : []),
                  ...(rank >= 0
                    ? ([
                        [
                          "Share at rank " + (rank + 1),
                          qualifies
                            ? pct(share)
                            : `no prize (${points} of ${minPoints})`,
                        ],
                      ] as [string, string][])
                    : []),
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
                    <p>
                      <a href={`#/p/${p.id}`}>Plea #{String(p.id)}</a> · +
                      {p.points} points
                    </p>
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
                            <p>{projection(p)}</p>
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
                        srLabel={` for plea #${p.id}`}
                        connectText="Connect in the top bar to record points."
                        disabled={!!p.standing?.[0] || data.closed}
                        reason={
                          p.standing?.[0]
                            ? `Record your +${p.points} points after ${clock(until)}, when objections on plea #${p.id} close. Nothing records them by itself: anyone can press Record my points.`
                            : `Objections on plea #${p.id} closed. Anyone can record a plea’s points; nothing records them by itself.`
                        }
                      />
                    )}
                  </div>
                );
              })}
              {!points && !query.data?.own.length && (
                <p>
                  No approved plea of yours is recorded in season{" "}
                  {String(season + 1n)}. Your best three count, and two pleas
                  that score {minPoints / 2} already reach the {minPoints}-point
                  bar; an IMD seat makes each one ×{" "}
                  {Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) / 10000}.{" "}
                  {!val(s, "CabalGate.diedAt") && (
                    <a href="#/plead">Write a plea</a>
                  )}
                </p>
              )}
            </>
          )}
        </Panel>
        {!ended && (
          <Panel level={2} title="The seat multiplier" id="seat">
            <p>
              Hold an IMD seat NFT when your plea is recorded and its points are
              the judges’ score ×{" "}
              {Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) / 10000}, rounded
              down.
            </p>
            <Costs
              rows={[
                [
                  "Score 36, with a seat",
                  String(
                    Math.floor(
                      (36 * Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS"))) /
                        10000,
                    ),
                  ) + " points",
                ],
                [
                  "Score 45, with a seat",
                  String(
                    Math.floor(
                      (45 * Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS"))) /
                        10000,
                    ),
                  ) + " points",
                ],
                ["Score 36, no seat", "36 points"],
              ]}
            />
            <p className="small">
              One seat or ten, the same multiplier. The need and verdict do not
              change.
            </p>
            <p className="label">Seat NFT · identity.md</p>
            <AddressView
              address={val(s, "Seasons.seat")}
              label="identity.md seat NFT"
              shortDisplay
            />
            {seatHeld && (
              <Notice
                kind="ok"
                title="Seat held: every recorded plea earns × 1.2."
              >
                <p>Rounded down for each plea.</p>
              </Notice>
            )}
          </Panel>
        )}
      </div>
      <section className="section">
        <div className="panel panel--flush">
          <div className="panel__head">
            {ended ? (
              <h3>Season {String(season + 1n)} leaderboard</h3>
            ) : (
              <h2>Season {String(season + 1n)} leaderboard</h2>
            )}
            <p className="meta">
              Season prize pot {tokenAmount(pot, s, true)} +{" "}
              {tokenAmount(bonus, s)} · top {String(con(s, "Seasons.TOP"))} with{" "}
              {minPoints}+ points
            </p>
          </div>
          {query.error ? (
            <div className="error-box" role="alert">
              <p className="error-box__title">Can’t read the leaderboard</p>
              <p className="small">{query.error}</p>
              <div className="btn-row">
                <button
                  className="btn btn--sm"
                  onClick={() => {
                    resetHealth();
                    void refresh();
                  }}
                >
                  <Icon name="arrow-clockwise" />
                  Try again
                </button>
              </div>
            </div>
          ) : query.loading ? (
            <div className="panel__body stack" aria-busy="true">
              <p className="loading-label">
                <Icon name="hourglass" />
                Reading the leaderboard from Seasons…
              </p>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton__line" />
              ))}
            </div>
          ) : !top.length ? (
            <Empty
              icon="trophy"
              title={bounds[3] || last ? "No points" : "No points yet"}
              action={
                !bounds[3] && !last
                  ? { href: "#/plead", label: "Write a plea" }
                  : undefined
              }
            >
              {bounds[3] || last
                ? `No plea is recorded in season ${season + 1n}. Approved pleas of season ${season + 1n} can be recorded until it closes; the close records any that nobody recorded.`
                : `Season ${season + 1n} has begun. The first approved plea to be recorded takes rank 1${season ? `; its season prize pot starts with what season ${season} rolled over` : ""}. The gavel is polished and waiting.`}
            </Empty>
          ) : (
            <ol className="lb" aria-label={`Season ${season + 1n} leaderboard`}>
              <li className="lb__head" aria-hidden="true">
                <span className="lb__rank">Rank</span>
                <span className="lb__who">Player</span>
                <span className="lb__best">Best three</span>
                <span className="lb__pts">Points</span>
                <span className="lb__prize">Prize now</span>
              </li>
              {rows.map((e: any, i: number) => {
                const qualified = !e.excluded && Number(e.points) >= minPoints,
                  bps = BigInt(s!.v.shares[i]);
                return (
                  <Fragment key={e.wallet}>
                    {i === qualifiesRows.length && (
                      <li className="lb__bar">{line}</li>
                    )}
                    <li
                      className={`lb__row ${!qualified ? "lb__row--out" : ""} ${equal(e.wallet, address) ? "lb__row--you" : ""}`}
                    >
                      <span className="lb__rank">
                        <span className="sr-only">Rank </span>
                        {i + 1}
                      </span>
                      <span className="lb__who">
                        <a
                          href={`#/profile/${e.wallet}`}
                          className={!e.name ? "mono" : ""}
                        >
                          {e.name || short(e.wallet)}
                        </a>
                        {e.seat && (
                          <span className="badge badge--seat">
                            SEAT ×
                            {Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) /
                              10000}
                          </span>
                        )}
                        {equal(e.wallet, address) && (
                          <span className="badge badge--you">YOU</span>
                        )}
                      </span>
                      <span className="lb__best">
                        <span className="lb__label">Best three </span>
                        {e.best.filter(Number).join(" · ")}
                        {hasMultiplier(e.wallet, e.best) && (
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
                <li className="lb__bar">{line}</li>
              )}
            </ol>
          )}
          <p className="panel__foot">
            Equal points: the wallet whose newest counted plea is older ranks
            higher. Seat holders’ judges’ scores are in brackets (each × 1.2,
            rounded down).
          </p>
        </div>
        <div className="split split--even split--stretch form-actions-top">
          <Panel title="If the season ended now" className="panel--sunken">
            <Costs
              rows={[
                [
                  `Paid to ${qualifiesRows.length} wallets`,
                  `${pct(shares)} · ${tokenAmount(paid, s, true)}`,
                ],
                [
                  last
                    ? "Left for the buy wall"
                    : `Rolls over to season ${season + 2n}`,
                  `${pct(10000n - shares)} · ${tokenAmount(pot - paid, s, true)}`,
                ],
                ["PLEA bonus paid", tokenAmount(bonusPaid, s)],
                ["PLEA bonus burned", tokenAmount(bonus - bonusPaid, s)],
              ]}
            />
            <p className="small">
              Each imdTEST amount is rounded down on its own;{" "}
              {last
                ? "the leftover goes to the buy wall."
                : "the leftover rolls over."}
            </p>
          </Panel>
          <Panel title="Closing the season">
            {data.closed ? (
              <p>Season {String(season + 1n)} is closed.</p>
            ) : (
              <>
                <p>
                  {last
                    ? `The close records any approved plea nobody recorded and pays the top ${con(s, "Seasons.TOP")} wallets with ${minPoints}+ points in ${s!.constants.pairSymbol} and PLEA.`
                    : now >= closeAt &&
                        season === BigInt(val(s, "Seasons.nextToClose"))
                      ? `The grace is over: anyone can close season ${season + 1n} now. The close records any approved plea nobody recorded, pays the top ${con(s, "Seasons.TOP")} with ${minPoints}+ points and rolls the rest over.`
                      : `Anyone can close it from ${clock(closeAt)} (${span(grace, "adj")} grace). Closing records eligible pleas, pays the qualifying wallets and carries the unpaid prize shares forward.`}
                </p>
                <TxButton
                  connectText="Connect in the top bar to close the season."
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
          const names = Object.fromEntries(
            await Promise.all(
              (top as any[])
                .filter((e: any) => !/^0x0{40}$/i.test(e.wallet))
                .map(async (e: any) => [
                  e.wallet,
                  await chainRead(r, "Letterbox", "nameOf", [e.wallet]),
                ]),
            ),
          );
          return { l, block, tx, bounds, top, names };
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
        (details.data || []).map(
          ({ l, block, tx, bounds, top, names }: any) => {
            const prizes = s!.logs.filter(
                (e) =>
                  e.eventName === "PrizePaid" &&
                  e.args.season === l.args.season,
              ),
              bonuses = s!.logs.filter(
                (e) =>
                  e.eventName === "BonusPaid" &&
                  e.args.season === l.args.season,
              ),
              burn =
                s!.logs.find(
                  (e) =>
                    e.eventName === "BonusBurned" &&
                    e.args.season === l.args.season,
                )?.args.amount || 0n;
            const selected = top
              .map((e: any, i: number) => ({ ...e, rank: i + 1 }))
              .filter(
                (e: any) =>
                  !/^0x0{40}$/i.test(e.wallet) &&
                  (e.rank <= 3 || equal(e.wallet, address)),
              );
            return (
              <article className="panel stack" key={String(l.args.season)}>
                <div className="cluster cluster--between">
                  <h3>Season {Number(l.args.season) + 1}</h3>
                  <span className="pill">Closed</span>
                </div>
                <p className="meta">
                  {clock(bounds[1])} to {clock(bounds[2])}. Closed{" "}
                  <a href={`${r.network.explorer}/tx/${l.transactionHash}`}>
                    {clock(block.timestamp)}
                  </a>{" "}
                  by <span className="mono">{short(getAddress(tx.from))}</span>.
                </p>
                <div className="split split--even">
                  <div>
                    <p className="label">Season prize pot and bonus</p>
                    <Costs
                      rows={[
                        ["Season prize pot", tokenAmount(l.args.pot, s, true)],
                        [
                          `Paid to ${prizes.length} wallets`,
                          tokenAmount(l.args.paid, s, true),
                        ],
                        [
                          val(s, "CabalGate.diedAt") &&
                          BigInt(l.args.season) === BigInt(s!.v.displayedSeason)
                            ? "Left for the buy wall"
                            : `Rolled over to season ${Number(l.args.season) + 2}`,
                          tokenAmount(
                            BigInt(l.args.pot) - BigInt(l.args.paid),
                            s,
                            true,
                          ),
                        ],
                        [
                          "PLEA bonus paid",
                          tokenAmount(
                            bonuses.reduce(
                              (n, e) => n + BigInt(e.args.amount),
                              0n,
                            ),
                            s,
                          ),
                        ],
                        ["PLEA bonus burned", tokenAmount(burn, s)],
                      ]}
                    />
                    <p className="small">
                      Each imdTEST amount is rounded down on its own.
                    </p>
                  </div>
                  <div>
                    {selected.length ? (
                      <>
                        <p className="label">Top three, and you</p>
                        <Costs
                          rows={selected.map((e: any) => [
                            <span>
                              {e.rank} ·{" "}
                              <a
                                className={names[e.wallet] ? "" : "mono"}
                                href={`#/profile/${e.wallet}`}
                              >
                                {names[e.wallet] || short(e.wallet)}
                              </a>
                              {equal(e.wallet, address) ? " (you)" : ""},{" "}
                              {e.points} points
                            </span>,
                            Number(e.points) >=
                            Number(con(s, "Seasons.MIN_POINTS"))
                              ? `${tokenAmount(prizes.find((p) => equal(p.args.wallet, e.wallet))?.args.amount || 0n, s, true)} + ${tokenAmount(bonuses.find((b) => equal(b.args.wallet, e.wallet))?.args.amount || 0n, s)}`
                              : `no prize (${e.points} of ${con(s, "Seasons.MIN_POINTS")})`,
                          ])}
                        />
                      </>
                    ) : (
                      <p>
                        No plea was recorded in season{" "}
                        {Number(l.args.season) + 1}.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          },
        )
      )}
    </section>
  );
}
