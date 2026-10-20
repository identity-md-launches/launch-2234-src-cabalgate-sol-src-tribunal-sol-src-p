import { useAccount } from "wagmi";
import { useState } from "react";
import { useApp, useRead } from "./context";
import { con, read, tokenAmount, utc, val, type Plea } from "./chain";
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
  const { r, s } = useApp();
  const owner = useRead(() => read(r, "PLEA", "owner"), [], !!s);
  const mintedTo = (name: string) =>
    s?.historyError
      ? undefined
      : s?.logs
          .filter(
            (l) =>
              l.eventName === "Transfer" &&
              l.args.from === "0x" + "0".repeat(40) &&
              l.args.to?.toLowerCase() === r.addresses[name]?.toLowerCase(),
          )
          .reduce((n, l) => n + l.args.value, 0n);
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h2>Fees and supply</h2>
        </div>
        <div className="split">
          <Panel title="Fees on every trade">
            <Costs
              rows={[
                [
                  "Cashback",
                  `${Number(con(s, "PleaHook.CASHBACK_BPS") || 0) / 100}%`,
                ],
                [
                  "Owner",
                  `${Number(con(s, "PleaHook.OWNER_BPS") || 0) / 100}%`,
                ],
                [
                  "Season prize pot",
                  `${Number(con(s, "PleaHook.PRIZE_BPS") || 0) / 100}%`,
                ],
                [
                  "Buy wall",
                  `${Number(con(s, "PleaHook.POOL_BPS") || 0) / 100}%`,
                ],
                [
                  "PLEA burned",
                  `${Number(con(s, "PleaHook.PLEA_BURN_BPS") || 0) / 100}%`,
                ],
              ]}
            />
            <p className="small">
              Paired-token fees are charged on what reaches the pool. The burn
              is taken from the PLEA leg. During the opening window, buys also
              pay the live launch fee shown on Buy.
            </p>
          </Panel>
          <Panel title="Supply">
            <Costs
              rows={[
                ["At launch", tokenAmount(con(s, "PLEA.TOTAL_SUPPLY"), s)],
                [
                  "Current total supply",
                  tokenAmount(val(s, "PLEA.totalSupply"), s),
                ],
                ["Minted to pool hook", tokenAmount(mintedTo("PleaHook"), s)],
                ["Minted for seasons", tokenAmount(mintedTo("Seasons"), s)],
                [
                  "Minted to distributor",
                  tokenAmount(mintedTo("PleaDistributor"), s),
                ],
                [
                  "Burned by hook",
                  tokenAmount(val(s, "PleaHook.totalBurned"), s),
                ],
              ]}
            />
            <p className="small">
              Launch allocations are read from the token’s mint events. The
              supply cannot grow after initialization.
            </p>
          </Panel>
        </div>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>The owner’s powers, in plain words</h2>
        </div>
        <Panel>
          <p>
            The owner can permanently allow a sender to transfer freely while
            the Cabal lives. This power is add-only. An allowed sender may use
            other venues without a plea. Direct transfers to this pool’s
            PoolManager and the gate remain restricted.
          </p>
          <p>
            The distributor’s owner can set its Merkle root once. The gate,
            Letterbox and Tribunal have no owner controls to pick a verdict.
            PLEA’s current owner and the hook’s launch owner are excluded from
            season prizes.
          </p>
          {owner.data && (
            <AddressView address={owner.data} label="PLEA owner" />
          )}
        </Panel>
      </section>
    </>
  );
}
export function BuyWallPanel() {
  const { r, s } = useApp();
  const [input, setInput] = useState("");
  const raw = parseAmount(input, s?.constants.pairDecimals || 18);
  return (
    <section className="section">
      <div className="section__head">
        <h2>The buy wall</h2>
      </div>
      <div className="split">
        <Panel title="Inventory and reserves">
          <Costs
            rows={[
              [
                "Inventory cap",
                tokenAmount(val(s, "PleaHook.inventoryCap"), s),
              ],
              ["Cap floor", tokenAmount(con(s, "PleaHook.CAP_FLOOR"), s)],
              [
                "Reserve, plain tokens",
                tokenAmount(val(s, "PleaHook.retainedImd"), s, true),
              ],
              [
                "Reserve, PoolManager claims",
                tokenAmount(val(s, "PleaHook.retainClaims"), s, true),
              ],
              [
                "Placement guard per day",
                `${String(con(s, "PleaHook.WALL_GUARD_TICKS_PER_DAY") || "—")} ticks`,
              ],
            ]}
          />
          <TxButton
            name="PleaHook"
            fn="rebalance"
            label="Rebalance buy wall"
            disabled={
              !val(s, "PleaHook.seeded") || !val(s, "PleaHook.pendingRebalance")
            }
            reason="Anyone may rebalance when the hook reports work ready."
          />
        </Panel>
        <Panel title="Fund the buy wall">
          <p>
            Contribute paired tokens to the hook’s wall reserve. This is a
            contribution to liquidity, with no personal withdrawal.
          </p>
          <AmountInput
            id="fund-wall"
            label="Contribution"
            value={input}
            onChange={setInput}
            unit={s?.constants.pairSymbol || "paired token"}
          />
          <ApprovedAction
            name="PleaHook"
            fn="fundWall"
            args={[raw]}
            label="Fund buy wall"
            token={r.addresses.PairToken}
            spender={r.addresses.PleaHook}
            spend={raw}
            disabled={raw <= 0n || !val(s, "PleaHook.seeded")}
            reason={raw <= 0n ? "Enter a contribution amount." : undefined}
            primary={false}
          />
        </Panel>
      </div>
    </section>
  );
}
export function LetterDetails() {
  const { r, s } = useApp();
  const fee = s?.v.fees?.[0] as bigint | undefined;
  const oracle = con(s, "CabalGate.ORACLE_FEE") as bigint | undefined;
  return (
    <section className="section">
      <div className="section__head">
        <h2>What it costs</h2>
        <p className="meta">Letters pay no auto-sell fee</p>
      </div>
      <div className="split">
        <Panel title="Fees">
          <Costs
            rows={[
              ["Oracle fee", tokenAmount(oracle, s, true)],
              [
                "Tip for whoever sells",
                tokenAmount(
                  fee !== undefined && oracle !== undefined
                    ? fee - oracle
                    : undefined,
                  s,
                  true,
                ),
              ],
              ["New letter, paid in PLEA", tokenAmount(fee, s, true)],
              [
                "Appeal, paid in PLEA",
                tokenAmount(s?.v.appealFees?.[0], s, true),
              ],
              ["Most PLEA for the fee", tokenAmount(s?.v.fees?.[1], s)],
            ]}
          />
          <p className="small">
            The contract calculates the PLEA fee at its hourly snapshot, with a
            cap. Unspent PLEA comes back. Sending SELL yourself returns the
            runner tip to you. The oracle fee is spent even if there is no
            verdict.
          </p>
        </Panel>
        <Panel title="Read your status on Etherscan">
          <p>
            On the Letterbox’s Read Contract tab, call{" "}
            <code>status(address)</code> with your wallet address. It returns
            one sentence about your latest plea, its verdict and points.
          </p>
          <p>
            <code>leaderboard()</code> prints the current season’s standings,
            rank shares and bonus amounts.
          </p>
          <a
            className="btn"
            href={`${r.network.explorer}/address/${r.addresses.Letterbox}#readContract`}
            target="_blank"
            rel="noreferrer"
          >
            Read the Letterbox
          </a>
        </Panel>
      </div>
    </section>
  );
}
export function ProfileDetails({
  wallet,
  balance,
}: {
  wallet: `0x${string}`;
  balance: bigint | undefined;
}) {
  const { r, s, now } = useApp();
  const { address } = useAccount();
  const season = s?.v["Seasons.currentSeason"]?.[1];
  const cap = con(s, "CabalGate.MAX_SELL") as bigint | undefined;
  const raw =
    balance !== undefined && cap !== undefined
      ? balance / 5n < cap
        ? balance / 5n
        : cap
      : 0n;
  const info = useRead(
    async () => {
      const [fact, best, seat, nft] = await Promise.all([
        read(r, "CabalGate", "factScore", [wallet, raw]),
        read(r, "Seasons", "bestOf", [season, wallet]),
        read(r, "Seasons", "holdsSeat", [wallet]),
        read(r, "Seasons", "seat"),
      ]);
      return { fact, best, seat, nft };
    },
    [wallet, raw.toString(), season?.toString()],
    !!s && balance !== undefined,
  );
  const prizes =
    s?.logs.filter(
      (l) =>
        ["PrizePaid", "BonusPaid"].includes(l.eventName) &&
        l.args.wallet?.toLowerCase() === wallet.toLowerCase(),
    ) || [];
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h2>Your next plea, at 20%</h2>
        </div>
        <Panel>
          <p>
            {tokenAmount(raw, s)} at today’s balance, within the live cap. The
            facts below are calculated by CabalGate.factScore; buying or the
            next checkpoint can change them.
          </p>
          {info.data && (
            <Meter
              fact={info.data.fact}
              need={Number(con(s, "CabalGate.PASS_MARK")) - info.data.fact}
            />
          )}
          <a className="btn" href="#/plead">
            Plead to sell
          </a>
        </Panel>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>Your seasons</h2>
        </div>
        <Panel>
          <Costs
            rows={[
              [
                "Current season",
                season !== undefined ? String(season + 1n) : "Reading…",
              ],
              [
                "Best three recorded pleas",
                info.data?.best.join(" · ") || "Reading…",
              ],
              [
                "Points",
                info.data
                  ? String(
                      info.data.best.reduce(
                        (n: number, p: number) => n + Number(p),
                        0,
                      ),
                    )
                  : "Reading…",
              ],
            ]}
          />
          {prizes.map((l) => (
            <p key={l.transactionHash + String(l.logIndex)}>
              Season {Number(l.args.season) + 1}:{" "}
              {tokenAmount(l.args.amount, s, l.eventName === "PrizePaid")} ·{" "}
              <a href={`${r.network.explorer}/tx/${l.transactionHash}`}>
                View prize transaction
              </a>
            </p>
          ))}
          {!prizes.length && <p>No prize payouts in this test run yet.</p>}
          <a className="link-btn" href="#/seasons">
            Open Seasons <Icon name="arrow-right" />
          </a>
        </Panel>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>IMD seat</h2>
        </div>
        <Panel>
          <p>
            {info.data?.seat
              ? "This wallet holds an IMD seat."
              : "No seat multiplier for this wallet now."}{" "}
            Seasons checks seat ownership when points are recorded. A seat
            multiplies points by ×
            {Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS") || 0) / 10000},
            rounded down; it does not change the judges’ score, your need or the
            prize threshold.
          </p>
          {info.data?.nft && (
            <AddressView address={info.data.nft} label="IMD seat NFT" />
          )}
        </Panel>
      </section>
    </>
  );
}
export function PleaTimeline({ p }: { p: Plea }) {
  const { s, r } = useApp();
  const sold = s?.logs.find(
    (l) => l.eventName === "SellExecuted" && l.args.id === p.id,
  );
  return (
    <Panel title="Timeline">
      <ol className="timeline">
        <li className="is-now">
          <span className="timeline__dot">
            <Icon name="check" />
          </span>
          <div>
            <p className="timeline__title">Submitted</p>
            <p className="timeline__meta">{utc(p.submittedAt)}</p>
          </div>
        </li>
        <li className={p.verdictAt ? "is-now" : "is-later"}>
          <span className="timeline__dot">
            <Icon name="gavel" />
          </span>
          <div>
            <p className="timeline__title">
              {p.verdictAt ? "Verdict" : "Waiting for the Cabal"}
            </p>
            <p className="timeline__meta">
              {p.verdictAt
                ? `${utc(p.verdictAt)} · ${p.score} vs need ${p.need}`
                : "The deadline is shown above. No fee is returned if no score arrives."}
            </p>
          </div>
        </li>
        {sold && (
          <li className="is-now">
            <span className="timeline__dot">
              <Icon name="check" />
            </span>
            <div>
              <p className="timeline__title">Sold</p>
              <p className="timeline__meta">
                {tokenAmount(sold.args.imdOut, s, true)} ·{" "}
                <a href={`${r.network.explorer}/tx/${sold.transactionHash}`}>
                  View sale transaction
                </a>
              </p>
            </div>
          </li>
        )}
        <li className={p.recorded ? "is-now" : "is-later"}>
          <span className="timeline__dot">
            <Icon name="trophy" />
          </span>
          <div>
            <p className="timeline__title">
              {p.recorded ? "Points recorded" : "Points wait"}
            </p>
            <p className="timeline__meta">
              {p.recorded
                ? `${p.points} points counted at record time.`
                : "An approval can be recorded after the objection hold ends. Nothing records it by itself."}
            </p>
          </div>
        </li>
      </ol>
    </Panel>
  );
}
