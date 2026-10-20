import { useApp } from "./context";
import { con, val, span, tokenAmount, deadman, words, short } from "./chain";
import { AddressView, Costs, Icon, Notice, Panel } from "./components";
import { APP } from "./config";
import { LETTERBOX } from "./models";
export function HowItWorks() {
  const { s, now } = useApp(),
    c = (k: string) => con(s, k),
    n = (k: string) => Number(c(k)),
    t = (k: string) => span(n(k)),
    pair = s?.constants.pairSymbol;
  return (
    <section className="section" id="how">
      <div className="section__head">
        <h2>How it works</h2>
        <p className="meta">Four steps, all on chain</p>
      </div>
      <div className="steps">
        {[
          [
            "Buy",
            `Buy PLEA on Uniswap v4. Every trade pays ${(n("PleaHook.IMD_FEE_BPS") + n("PleaHook.PLEA_BURN_BPS")) / 100}%: ${n("PleaHook.CASHBACK_BPS") / 100}% back to you (${tokenAmount((100n * 10n ** 18n * BigInt(c("PleaHook.CASHBACK_BPS"))) / (10000n + BigInt(c("PleaHook.IMD_FEE_BPS"))), s, true)} on a 100 ${pair} buy).`,
          ],
          [
            "Plead",
            `Sell ${n("CabalGate.MIN_SHARE_BPS") / 100}% to ${n("CabalGate.MAX_SHARE_BPS") / 100}% of your balance, at most ${tokenAmount(c("CabalGate.MAX_SELL"), s)}. Write 1 to ${c("CabalGate.MAX_PLEA_BYTES")} bytes. The oracle fee is ${tokenAmount(c("CabalGate.ORACLE_FEE"), s, true)}.`,
          ],
          [
            "The Cabal judges",
            `${c("CabalGate.PANEL_SIZE")} judges score it from 0 to ${c("CabalGate.MAX_PLEA_SCORE")}; ${c("CabalGate.QUORUM")} must agree. Usually 3 to 6 minutes, up to ${t("CabalGate.PENDING_EXPIRY")}. Your need is ${c("CabalGate.PASS_MARK")} minus your fact score.`,
          ],
          [
            `Sell in ${t("CabalGate.EXECUTE_WINDOW")}`,
            `Approved: sell before the window closes. On auto-sell, whoever sells it earns the ${tokenAmount(LETTERBOX.TIP, s, true)} tip. Denied: one appeal within ${t("CabalGate.COOLDOWN")}. A ${span(n("CabalGate.COOLDOWN"), "adj")} cooldown follows a sale, denial or lapse.`,
          ],
        ].map(([title, text], i) => (
          <article className="step" key={title}>
            <span className="step__num">{i + 1}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="split form-actions-top">
        <Panel title="Your need">
          <p>
            The better your facts, the less the judges must give. Need ={" "}
            {String(c("CabalGate.PASS_MARK"))} − fact score.
          </p>
          <div className="panel panel--flush">
            <div className="panel__head">
              <h4>The fact score</h4>
              <p className="meta">
                0 to {String(c("CabalGate.MAX_PLEA_SCORE"))} points
              </p>
            </div>
            <div
              className="table-wrap"
              role="region"
              aria-label="Fact score rules"
              tabIndex={0}
            >
              <table className="table facts-table">
                <caption className="sr-only">
                  The four facts and their points
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Fact</th>
                    <th scope="col">Bands and points</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Share sold</th>
                    <td>≤ 20%: 16 · ≤ 35%: 9 · more: 3</td>
                  </tr>
                  <tr>
                    <th scope="row">Held, buy-weighted</th>
                    <td>≥ 7 days: 7 · ≥ 3 days: 4 · ≥ 1 day: 2 · less: 0</td>
                  </tr>
                  <tr>
                    <th scope="row">Profit or loss</th>
                    <td>
                      At a loss: 13 · gain ≤ 50%: 12 · ≤ 200%: 10 · ≤ 500%: 8 ·
                      ≤ 1,000%: 6 · more: 4
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">24h trend</th>
                    <td>Up &gt; 2%: 9 · flat ±2%: 5 · down: 0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="small">
            PLEA that no buy record covers counts as held since trading opened,
            profit 10. Larger pleas use the PLEA-weighted mean.
          </p>
          <Notice
            title={`A need above ${c("CabalGate.MAX_PLEA_SCORE")} cannot pass.`}
          >
            <p>
              The contract refuses such a plea before you pay (CannotPass), so
              no fee is spent. Plead a smaller share or wait for better facts.
            </p>
          </Notice>
          <a className="link-btn" href="#/plead">
            Check your facts <Icon name="arrow-right" />
          </a>
        </Panel>
        <Panel title="Example: a fresh buyer">
          <p>
            A plea for 20% or less, fresh holdings, at a loss, and a flat 24h
            trend.
          </p>
          <Costs
            rows={[
              ["Share sold", "16"],
              ["Held", "0"],
              ["Loss", "13"],
              ["Flat trend", "5"],
              ["Fact", "16 + 0 + 13 + 5 = 34"],
              [
                "Need",
                `${c("CabalGate.PASS_MARK")} − 34 = ${n("CabalGate.PASS_MARK") - 34}`,
              ],
            ]}
          />
          <p>Holding changes the facts:</p>
          <Costs
            rows={[
              ["Fresh", `fact 34 · need ${n("CabalGate.PASS_MARK") - 34}`],
              ["1 day", `fact 36 · need ${n("CabalGate.PASS_MARK") - 36}`],
              ["3 days", `fact 38 · need ${n("CabalGate.PASS_MARK") - 38}`],
              ["7 days", `fact 41 · need ${n("CabalGate.PASS_MARK") - 41}`],
            ]}
          />
        </Panel>
      </div>
      <div className="auto-grid form-actions-top">
        <Panel title="Letters">
          <Icon name="envelope-simple" />
          <p>
            Write to the Letterbox from Sepolia Etherscan. Same judges, score
            and need. The fees come out of your PLEA.
          </p>
          <a className="link-btn" href="#/letters">
            How letters work <Icon name="arrow-right" />
          </a>
        </Panel>
        <Panel title="Objection!">
          <Icon name="megaphone-simple" />
          <p>
            Others have {t("Tribunal.OBJECTION_WINDOW")} after an approval to
            ask a second panel. {tokenAmount(c("Tribunal.ORACLE_FEE"), s, true)}{" "}
            fee + {tokenAmount(c("Tribunal.STAKE"), s, true)} stake; at most{" "}
            {String(c("Tribunal.MAX_OBJECTIONS"))} per plea. The sale stands.
          </p>
          <a className="link-btn" href="#/objections">
            How objections work <Icon name="arrow-right" />
          </a>
        </Panel>
        <Panel title="Seasons">
          <Icon name="trophy" />
          <p>
            {t("Seasons.SEASON")} each. The top {String(c("Seasons.TOP"))} with{" "}
            {String(c("Seasons.MIN_POINTS"))}+ points share the pot. Each of the
            first {String(c("Seasons.BONUS_SEASONS"))} seasons adds{" "}
            {tokenAmount(c("Seasons.BONUS_PER_SEASON"), s)}. A seat gives ×
            {n("Seasons.SEAT_MULTIPLIER_BPS") / 10000} points, rounded down.
          </p>
          <a className="link-btn" href="#/seasons">
            Seasons and prizes <Icon name="arrow-right" />
          </a>
        </Panel>
        <Panel title="The dead-man rule">
          <Icon name="hourglass" />
          <p>
            No verdict for {t("CabalGate.DEADMAN")}: the Cabal dies and PLEA
            trades freely forever.
          </p>
          <p
            role={val(s, "PleaHook.seeded") ? "timer" : undefined}
            aria-label={
              val(s, "PleaHook.seeded")
                ? `Dies without a verdict in ${words(Number(val(s, "CabalGate.lastVerdictAt")) + n("CabalGate.DEADMAN") - now)}`
                : undefined
            }
          >
            {!val(s, "PleaHook.seeded")
              ? "The clock starts when trading opens."
              : val(s, "CabalGate.diedAt")
                ? "The Cabal is dead."
                : `Dies without a verdict in ${deadman(Number(val(s, "CabalGate.lastVerdictAt")) + n("CabalGate.DEADMAN") - now)}`}
          </p>
          <a
            className="link-btn"
            href="https://github.com/khaed1/plea/blob/testnet9/src/CabalGate.sol"
          >
            Read the rule in the code <Icon name="arrow-right" />
          </a>
        </Panel>
      </div>
    </section>
  );
}
export function ContractsPanel() {
  const { r, s } = useApp(),
    roles: Record<string, string> = {
      PLEA: "the token; transfers gated while the Cabal lives",
      CabalGate: "pleas, verdicts, appeals, sells and the dead-man",
      Seasons: "points, the leaderboard and payouts",
      PleaHook: "the pool’s fees, burns and buy wall",
      Letterbox: "letters and auto-sell",
      Tribunal: "objections and the second panel",
      PleaDistributor: "the 12% claim list",
      PleaLaunch: "the launch and the seed",
    };
  const partners = [
    [s?.constants.pairSymbol, r.addresses.PairToken],
    ["imd/acc Stacker", val(s, "PleaHook.stacker")],
    ["identity.md seat NFT (test NFT)", val(s, "Seasons.seat")],
    ["Uniswap v4 PoolManager", r.network.uniswapV4.poolManager],
    [
      "Uniswap v4 PoolSwapTest · the swap router this test run trades through",
      APP.swapRouter,
    ],
    ["IMD Intake v2", val(s, "CabalGate.intake")],
    ["delegate.xyz registry", APP.delegateRegistry],
  ];
  return (
    <section className="section" id="contracts">
      <div className="section__head">
        <h2>Contracts</h2>
        <p className="meta">Sepolia</p>
      </div>
      <div className="split split--even">
        <Panel title="PLEA’s contracts" className="panel--flush">
          <p className="meta">Sepolia test run 9 · launch #2234</p>
          <dl className="addr-list">
            {Object.entries(roles).map(([name, role]) => (
              <div key={name}>
                <dt>
                  <b>{name}</b> · {role}
                </dt>
                <dd>
                  <AddressView address={r.addresses[name]} label={name} />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="What PLEA works with" className="panel--flush">
          <p className="meta">Live today</p>
          <dl className="addr-list">
            {partners.map(
              ([name, address]) =>
                address && (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                      <AddressView address={address} label={name} />
                    </dd>
                  </div>
                ),
            )}
          </dl>
        </Panel>
      </div>
      <Panel
        title="The owner’s powers, in plain words"
        className="form-actions-top"
      >
        <p>
          The PLEA owner can call PLEA.allow(account) to permanently allow a
          sender to transfer freely while the Cabal lives. It is add-only; an
          allowed sender may use other venues without a plea. Direct transfers
          to this pool’s PoolManager and the gate remain restricted.
        </p>
        <p>
          The distributor’s owner sets the claim list’s root once. The gate,
          Letterbox and Tribunal have no owner control to pick a verdict.
        </p>
        <p>
          PLEA’s current owner and the hook’s launch owner earn no season
          prizes. Owner:
        </p>
        <AddressView address={val(s, "PLEA.owner")} label="PLEA owner" />
      </Panel>
      {!val(s, "CabalGate.diedAt") && (
        <Notice
          kind="warn"
          title="While the Cabal lives you cannot sell without an approved plea."
        >
          <p>Only buy what you are happy to hold.</p>
        </Notice>
      )}
    </section>
  );
}
