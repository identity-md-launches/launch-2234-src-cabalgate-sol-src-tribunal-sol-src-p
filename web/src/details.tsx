import { LETTERBOX, Q96 } from "./models";
import { useAccount } from "wagmi";
import { useState } from "react";
import { useApp, useRead } from "./context";
import {
  con,
  read,
  tokenAmount,
  utc,
  val,
  clock,
  span,
  soldFor,
  pleaState,
  short,
  type Plea,
} from "./chain";
import {
  AddressView,
  Costs,
  Countdown,
  Icon,
  Meter,
  Panel,
  TxButton,
  ApprovedAction,
  AmountInput,
} from "./components";
import { parseAmount } from "./pages-trade";
export function HomeDetails() {
  const { s } = useApp(),
    dead = !!val(s, "CabalGate.diedAt"),
    c = (key: string) => Number(con(s, `PleaHook.${key}`) || 0),
    pair = s?.constants.pairSymbol;
  const total = BigInt(con(s, "PLEA.TOTAL_SUPPLY") || 0n);
  return (
    <section className="section">
      <div className="section__head">
        <h2>Fees and supply</h2>
        <p className="meta">Paid inside the swap, nothing to claim later</p>
      </div>
      <div className="split">
        <Panel title="Fees on every trade">
          <Costs
            rows={[
              [
                `Cashback to you, in plain ${pair}`,
                `${c("CASHBACK_BPS") / 100}%`,
              ],
              ["Owner", `${c("OWNER_BPS") / 100}%`],
              ...(!dead
                ? [
                    ["Season prize pot", `${c("PRIZE_BPS") / 100}%`] as [
                      string,
                      string,
                    ],
                  ]
                : []),
              [
                `${pair} buy wall, kept in the pool`,
                `${(c("POOL_BPS") + (dead ? c("PRIZE_BPS") : 0)) / 100}%`,
              ],
              ["Burned", `${c("PLEA_BURN_BPS") / 100}% of the PLEA`],
              ["Total", `${(c("IMD_FEE_BPS") + c("PLEA_BURN_BPS")) / 100}%`],
            ]}
          />
          <p className="small">
            On a 100 {pair} buy,{" "}
            {tokenAmount(
              (100n * 10n ** 18n * 10000n) / BigInt(10000 + c("IMD_FEE_BPS")),
              s,
              true,
            )}{" "}
            reaches the pool. The fee is charged on what reaches it;{" "}
            {c("PLEA_BURN_BPS") / 100}% of the PLEA is burned. Launch fees come
            on top during the opening window.
          </p>
          {val(s, "PleaHook.pendingRebalance") && (
            <>
              <p className="small">
                Anyone can rebalance the buy wall: it burns bought PLEA and
                places collected imdTEST in the pool just below the price.
              </p>
              <TxButton
                name="PleaHook"
                fn="rebalance"
                label="Rebalance buy wall"
                small
              />
            </>
          )}
        </Panel>
        <Panel title="Supply">
          <Costs
            rows={[
              [
                "Pool liquidity, locked forever",
                `${tokenAmount((total * 82n) / 100n, s)} (82%)`,
              ],
              [
                `Season bonus: ${tokenAmount(con(s, "Seasons.BONUS_PER_SEASON"), s)} in each of the first ${con(s, "Seasons.BONUS_SEASONS")} seasons`,
                `${tokenAmount((total * 6n) / 100n, s)} (6%)`,
              ],
              [
                "Claim list: swarm 10% + airdrop 2%",
                `${tokenAmount((total * 12n) / 100n, s)} (12%)`,
              ],
              ["Total PLEA at launch", tokenAmount(total, s)],
              [
                "Burned so far",
                tokenAmount(
                  total - BigInt(val(s, "PLEA.totalSupply") || 0n),
                  s,
                ),
              ],
              ["Supply now", tokenAmount(val(s, "PLEA.totalSupply"), s)],
            ]}
          />
          <a className="btn btn--sm" href="#/claim">
            Check the claim list <Icon name="arrow-right" />
          </a>
        </Panel>
      </div>
    </section>
  );
}
export function BuyWallPanel() {
  return null;
}
export function LetterDetails() {
  const { r, s } = useApp(),
    { address } = useAccount(),
    oracle = BigInt(con(s, "CabalGate.ORACLE_FEE") || 0n),
    fee = oracle + LETTERBOX.TIP,
    appeal = fee + BigInt(con(s, "CabalGate.APPEAL_POOL_SHARE") || 0n),
    price = BigInt(val(s, "PleaHook.latestPrice") || 0n),
    pleaFee = (v: bigint) =>
      price
        ? `about ${tokenAmount((v * Q96 * 10000n) / price / (10000n - BigInt(con(s, "PleaHook.IMD_FEE_BPS")) - BigInt(con(s, "PleaHook.PLEA_BURN_BPS"))), s, false, 0, "up")}`
        : "after trading opens";
  const status = useRead(
      () => read(r, "Letterbox", "status", [address]),
      [address],
      !!s && !!address,
    ),
    leaderboard = useRead(() => read(r, "Letterbox", "leaderboard"), [], !!s);
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h2>What it costs</h2>
        </div>
        <div className="split">
          <Panel title="Fees">
            <Costs
              rows={[
                ["Oracle fee", tokenAmount(oracle, s, true)],
                [
                  "Tip for whoever sells it",
                  tokenAmount(LETTERBOX.TIP, s, true),
                ],
                ["A letter", tokenAmount(fee, s, true)],
                ["In PLEA", pleaFee(fee)],
                [
                  "Never more than",
                  s?.v.fees
                    ? tokenAmount(s.v.fees[1], s, false, 0, "up")
                    : "after trading opens",
                ],
                ["APPEAL", tokenAmount(appeal, s, true)],
                ["Appeal in PLEA", pleaFee(appeal)],
                [
                  "Appeal, never more than",
                  s?.v.appealFees
                    ? tokenAmount(s.v.appealFees[1], s, false, 0, "up")
                    : "after trading opens",
                ],
                ["Auto-sell fee", "none for letters"],
              ]}
            />
          </Panel>
          <Panel title="Limits">
            <ul>
              <li>
                1 to {String(con(s, "CabalGate.MAX_PLEA_BYTES") || 280)} bytes:
                about 280 Latin, 140 Cyrillic or 93 CJK characters.
              </li>
              <li>One line, no hidden characters.</li>
              <li>
                A balance of at least{" "}
                {s?.v.fees
                  ? tokenAmount(BigInt(s.v.fees[1]) * 10n, s)
                  : "10 × the PLEA fee cap, after trading opens"}
                .
              </li>
              <li>
                A plea worth at least{" "}
                {tokenAmount(LETTERBOX.MIN_SALE_VALUE, s, true)}.
              </li>
              <li>
                20% of the balance must be at least{" "}
                {tokenAmount(LETTERBOX.MIN_LETTER, s)}.
              </li>
            </ul>
            <p>
              The same need and cooldown apply. Fees are paid in PLEA; the
              oracle fee is spent even if no verdict comes.
            </p>
          </Panel>
        </div>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>Example letters</h2>
        </div>
        <div className="auto-grid">
          {[
            "I kept the rest. This fifth pays the rent.",
            "APPEAL My first plea was too brief. Here is what I meant.",
            "NAME kafka_cat",
          ].map((text) => (
            <Panel key={text}>
              <p className="letter-sample">{text}</p>
              <p className="small">
                Reads as:{" "}
                {window.PleaText.checkLetter(text).reads?.replace(
                  /\bIMD\b/g,
                  s?.constants.pairSymbol || "imdTEST",
                )}
              </p>
            </Panel>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>Read your status on Etherscan</h2>
        </div>
        <Panel>
          <p>
            {status.data ||
              "Connect in the top bar to read the wallet’s letter status here, or use status(address) on Etherscan."}
          </p>
          {leaderboard.data && <p>{leaderboard.data}</p>}
          <a
            className="btn btn--sm"
            href={`${r.network.explorer}/address/${r.addresses.Letterbox}#readContract`}
          >
            Open Read Contract <Icon name="arrow-right" />
          </a>
        </Panel>
      </section>
    </>
  );
}

export function PleaTimeline({
  p,
  missedSeason,
}: {
  p: Plea;
  missedSeason?: bigint;
}) {
  const { s, now, r } = useApp(),
    approved = [2, 4, 5].includes(p.status),
    points = approved && !p.standing?.[1] && !p.excluded,
    window = Number(p.verdictAt) + Number(con(s, "CabalGate.EXECUTE_WINDOW")),
    objection =
      Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW")),
    cooldown = Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN"));
  const steps: any[] = [
    ["Submitted", clock(p.submittedAt), "arrow-right", "is-done"],
    [
      p.verdictAt ? "Judged" : "Waiting for the Cabal",
      p.verdictAt
        ? `${clock(p.verdictAt)} · ${p.score} vs need ${p.need}`
        : "Usually 3 to 6 minutes.",
      "gavel",
      p.verdictAt ? "is-done" : "is-now",
    ],
  ];
  if (approved)
    steps.push([
      p.status === 4 ? "Sold" : "Sell window",
      p.status === 4
        ? `${tokenAmount(soldFor(p, s!), s, true)} to the writer`
        : now > window
          ? `Closed at ${clock(window)}`
          : `Sell by ${clock(window)}`,
      "coins",
      p.status === 4 || now > window ? "is-done" : "is-now",
    ]);
  if (points)
    steps.push(
      [
        "Objections",
        p.standing?.[0] && missedSeason === undefined
          ? `Points held until ${clock(objection)} or the panel rules`
          : `Closed at ${clock(objection)}`,
        "megaphone-simple",
        p.standing?.[0] && missedSeason === undefined ? "is-now" : "is-done",
      ],
      [
        missedSeason !== undefined
          ? "Points not recorded"
          : "Record the points",
        p.recorded
          ? `+${p.points} points recorded.`
          : missedSeason !== undefined
            ? `Season ${missedSeason + 1n} closed before these points were recorded.`
            : `+${p.points} points. Nothing records them by itself.`,
        "trophy",
        p.recorded || missedSeason !== undefined
          ? "is-done"
          : p.standing?.[0]
            ? "is-later"
            : "is-now",
      ],
    );
  if (p.status === 3 && !p.isAppeal)
    steps.push([
      "Appeal window",
      p.appealed
        ? "An appeal has been sent."
        : `One appeal until ${clock(cooldown)}`,
      "arrow-right",
      now <= cooldown && !p.appealed ? "is-now" : "is-done",
    ]);
  if (p.verdictAt)
    steps.push([
      `${span(Number(con(s, "CabalGate.COOLDOWN")), "adj")} cooldown`,
      p.status === 4
        ? "Runs from the sale."
        : `From this verdict until ${clock(cooldown)}`,
      "timer",
      now > cooldown ? "is-done" : "is-now",
    ]);
  return (
    <Panel level={2} title="Timeline">
      <ol className="timeline">
        {steps.map(([title, body, icon, state]) => (
          <li className={state} key={title}>
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
  );
}
