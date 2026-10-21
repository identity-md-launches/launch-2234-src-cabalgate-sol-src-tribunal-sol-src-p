import { useApp } from "./context";
import {
  con,
  val,
  span,
  tokenAmount,
  deadman,
  words,
  short,
  seasonState,
} from "./chain";
import {
  AddressView,
  Costs,
  Icon,
  Notice,
  Panel,
  FactCells,
  Countdown,
} from "./components";
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
      <ol className="steps steps--4">
        {[
          [
            "Buy",
            `Open to anyone. Every trade pays a ${(n("PleaHook.IMD_FEE_BPS") + n("PleaHook.PLEA_BURN_BPS")) / 100}% fee, and ${n("PleaHook.CASHBACK_BPS") / 100}% comes back to you as cashback in ${pair} (${tokenAmount((100n * 10n ** 18n * BigInt(c("PleaHook.CASHBACK_BPS"))) / (10000n + BigInt(c("PleaHook.IMD_FEE_BPS"))), s, true)} on a 100 ${pair} buy).`,
          ],
          [
            "Plead",
            `Write why you want to sell ${n("CabalGate.MIN_SHARE_BPS") / 100}% to ${n("CabalGate.MAX_SHARE_BPS") / 100}% of your PLEA (at most ${tokenAmount(c("CabalGate.MAX_SELL"), s)}): 1 to ${c("CabalGate.MAX_PLEA_BYTES")} bytes, any language. Pay the ${tokenAmount(c("CabalGate.ORACLE_FEE"), s, true)} oracle fee. The contract computes your need first.`,
          ],
          [
            "The Cabal judges",
            `${c("CabalGate.PANEL_SIZE")} judges score your plea from 0 to ${c("CabalGate.MAX_PLEA_SCORE")}, and ${c("CabalGate.QUORUM")} must agree. It usually takes 3 to 6 minutes. A score at or above your need is approved.`,
          ],
          [
            `Sell in ${t("CabalGate.EXECUTE_WINDOW")}`,
            `Approved: sell within ${t("CabalGate.EXECUTE_WINDOW")}, or tick auto-sell and anyone may sell it for you for a ${tokenAmount(LETTERBOX.TIP, s, true)} tip. Denied: one appeal within ${t("CabalGate.COOLDOWN")}. After a sale, a denial or a lapse: a ${span(n("CabalGate.COOLDOWN"), "adj")} cooldown.`,
          ],
        ].map(([title, text], i) => (
          <li className="step" key={title}>
            <h3>{title}</h3>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <div className="stack stack--md form-actions-top">
        <h3>Your need</h3>
        <div className="split">
          <div className="stack stack--lg">
            <p>
              Before you pay, the contract scores four facts about your sale
              from the chain. Your need is {String(c("CabalGate.PASS_MARK"))}{" "}
              minus that fact score: the judges must reach it.
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
                        At a loss: 13 · gain ≤ 50%: 12 · ≤ 200%: 10 · ≤ 500%: 8
                        · ≤ 1,000%: 6 · more: 4
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">24h trend</th>
                      <td>Up &gt; 2%: 9 · flat ±2%: 5 · down: 0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="panel__body">
                <p className="small">
                  PLEA that no buy record covers (received, not bought) counts
                  as held since trading opened, with 10 points for profit or
                  loss. Larger pleas use the PLEA-weighted mean.
                </p>
              </div>
            </div>
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
          </div>
          <Panel level={4} title="Example: a fresh buyer">
            <p className="small">
              Selling up to 20% at a loss, on a flat day, held under a day:
            </p>
            <FactCells
              total={34}
              parts={{
                shareBps: 2000n,
                heldFor: 0,
                pnlBps: -1800n,
                trendLabel: "flat",
                share: 16,
                held: 0,
                profit: 13,
                trend: 5,
                total: 34,
                uncovered: 0n,
              }}
            />
            <p className="strong num">
              Fact 16 + 0 + 13 + 5 = 34, so the need is{" "}
              {String(c("CabalGate.PASS_MARK"))} − 34 ={" "}
              {n("CabalGate.PASS_MARK") - 34}.
            </p>
            <div
              className="table-wrap"
              role="region"
              aria-label="Need by holding time"
              tabIndex={0}
            >
              <table className="table">
                <caption className="sr-only">
                  The same sale after holding longer
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Held</th>
                    <th scope="col" className="r">
                      Fact score
                    </th>
                    <th scope="col" className="r">
                      Need
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["under a day", 34],
                    ["a day", 36],
                    ["three days", 38],
                    ["a week", 41],
                  ].map(([held, fact]) => (
                    <tr key={held}>
                      <th scope="row">{held}</th>
                      <td className="r">{fact}</td>
                      <td className="r">
                        {n("CabalGate.PASS_MARK") - Number(fact)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
      <div className="auto-grid form-actions-top">
        <Panel
          title={
            <span className="cluster cluster--sm">
              <Icon name="envelope-simple" />
              Letters
            </span>
          }
          className="info-panel"
        >
          <p>
            Plead without the site: send your plea as text to the Letterbox from
            Sepolia Etherscan. It pleads {n("Letterbox.LETTER_SHARE_BPS") / 100}
            % of your PLEA and pays its fees in PLEA. If approved, anyone can
            sell it for you within {t("CabalGate.EXECUTE_WINDOW")} and earns the{" "}
            {tokenAmount(LETTERBOX.TIP, s, true)} tip; send SELL yourself and
            you keep it.
          </p>
          <a className="link-btn" href="#/letters">
            How to send a letter <Icon name="arrow-right" />
          </a>
        </Panel>
        <Panel
          title={
            <span className="cluster cluster--sm">
              <Icon name="megaphone-simple" />
              Objection!
            </span>
          }
          className="info-panel"
        >
          <p>
            Others have {t("Tribunal.OBJECTION_WINDOW")} after an approval to
            ask a second panel. {tokenAmount(c("Tribunal.ORACLE_FEE"), s, true)}{" "}
            fee + {tokenAmount(c("Tribunal.STAKE"), s, true)} stake; at most{" "}
            {String(c("Tribunal.MAX_OBJECTIONS"))} per plea. The sale stands.
          </p>
          <a className="link-btn" href="#/objections">
            Open objections <Icon name="arrow-right" />
          </a>
        </Panel>
        <Panel
          title={
            <span className="cluster cluster--sm">
              <Icon name="trophy" />
              Seasons
            </span>
          }
          className="info-panel"
        >
          <p>
            {t("Seasons.SEASON")} each. The top {String(c("Seasons.TOP"))} with{" "}
            {String(c("Seasons.MIN_POINTS"))}+ points share the pot. Each of the
            first {String(c("Seasons.BONUS_SEASONS"))} seasons adds{" "}
            {tokenAmount(c("Seasons.BONUS_PER_SEASON"), s)}. IMD seat holders
            earn ×{n("Seasons.SEAT_MULTIPLIER_BPS") / 10000} points, rounded
            down.
          </p>
          <a className="link-btn" href="#/seasons">
            See the season {String(BigInt(s?.v.displayedSeason || 0n) + 1n)}{" "}
            leaderboard <Icon name="arrow-right" />
          </a>
        </Panel>
        <Panel
          title={
            <span className="cluster cluster--sm">
              <Icon name="hourglass" />
              The dead-man rule
            </span>
          }
          className="info-panel"
        >
          <p>
            No verdict for {t("CabalGate.DEADMAN")}: the Cabal dies and PLEA
            trades freely forever.
          </p>
          {!val(s, "PleaHook.seeded") ? (
            <p>The clock starts when trading opens.</p>
          ) : val(s, "CabalGate.diedAt") ? (
            <p>The Cabal is dead.</p>
          ) : (
            <div className="cluster">
              <Countdown
                until={
                  Number(val(s, "CabalGate.lastVerdictAt")) +
                  n("CabalGate.DEADMAN")
                }
                label="Dies without a verdict in"
                format="deadman"
                ariaLabel={`The Cabal dies in ${words(Number(val(s, "CabalGate.lastVerdictAt")) + n("CabalGate.DEADMAN") - now)} without a verdict`}
              />
            </div>
          )}
          <a
            className="link-btn"
            href="https://github.com/khaed1/plea/blob/testnet9/src/CabalGate.sol"
          >
            Read the rule in the code <Icon name="arrow-square-out" />
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
    ["identity.md seat NFT", val(s, "Seasons.seat")],
    ["Uniswap v4 PoolManager", r.network.uniswapV4.poolManager],
    ["Uniswap v4 PoolSwapTest", APP.swapRouter],
    ["IMD Intake v2", val(s, "CabalGate.intake")],
    ["delegate.xyz registry", APP.delegateRegistry],
  ];
  return (
    <section className="section" id="contracts">
      <div className="section__head">
        <h2>Contracts</h2>
        <p className="meta">Sepolia</p>
      </div>
      <div className="stack stack--lg">
        <Panel
          title="PLEA’s contracts"
          flush
          meta="Sepolia test run 9 · launch #2234"
        >
          <dl className="addr-list">
            {Object.entries(roles).map(([name, role]) => (
              <div key={name}>
                <dt>
                  <b>{name}</b>
                </dt>
                <dd>
                  <AddressView address={r.addresses[name]} label={name} />
                  <span className="meta">· {role}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="What PLEA works with" flush meta="Live today">
          <dl className="addr-list">
            {partners.map(
              ([name, address]) =>
                address && (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>
                      <AddressView address={address} label={name} />
                      {name === "Uniswap v4 PoolSwapTest" && (
                        <span className="meta">
                          · the swap router this test run trades through
                        </span>
                      )}
                      {name === "identity.md seat NFT" && (
                        <span className="meta">· a test NFT on Sepolia</span>
                      )}
                    </dd>
                  </div>
                ),
            )}
          </dl>
        </Panel>
        <Panel title="The owner’s powers, in plain words">
          <p>
            <b>One switch, add-only.</b> <code>PLEA.allow(account)</code> lets a
            sender move PLEA without a plea, permanently. Accounts can be added,
            never removed. It is for routers and the claim contract.
          </p>
          <p>
            <b>Nothing else.</b> The owner cannot change the fees, the judges,
            the rules or anyone’s pleas.
          </p>
          <p>
            <b>The owner does not play.</b> Its pleas earn no points, no prize
            and no bonus.
          </p>
          <p>The distributor’s owner sets the claim list’s root once.</p>
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
      </div>
    </section>
  );
}
