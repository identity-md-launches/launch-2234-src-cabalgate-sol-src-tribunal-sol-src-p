import { Share } from "./share";
import { LETTERBOX, Q96 } from "./models";
import { appealPreview } from "./appeal";
import { PleaTimeline } from "./details";
import { oracleRequest } from "./oracle";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useApp, useRead, useTx } from "./context";
import {
  amount,
  clock,
  span,
  seasonState,
  potOf,
  soldFor,
  objectionLine,
  con,
  duration,
  elapsed,
  getPlea,
  pleaState,
  read,
  short,
  tokenAmount,
  utc,
  val,
  type Plea,
} from "./chain";
import {
  Action,
  AddressView,
  Stamp,
  FactCells,
  AmountInput,
  ApprovedAction,
  Costs,
  Countdown,
  Empty,
  Icon,
  Meter,
  Notice,
  Panel,
  PleaCard,
  TextBox,
  Title,
  TxButton,
  textCheck,
} from "./components";
import { parseAmount, WalletBalances, poolQuote } from "./pages-trade";
export function Wall() {
  const { r, s, now } = useApp(),
    [family, setFamily] = useState("All"),
    [flags, setFlags] = useState<string[]>([]),
    [sort, setSort] = useState("Newest"),
    [older, setOlder] = useState<Plea[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const wallet = new URLSearchParams(location.hash.split("?")[1]).get("wallet"),
    all = [...(s?.pleas || []), ...older].filter(
      (p, i, a) => a.findIndex((x) => x.id === p.id) === i,
    ),
    oldest = all.reduce((v, p) => (p.id < v ? p.id : v), all[0]?.id || 1n);
  const group = (p: Plea) =>
    [2, 4, 5].includes(p.status)
      ? "Approved"
      : p.status === 3
        ? "Denied"
        : pleaState(p, now, s!) === "PENDING"
          ? "Pending"
          : "No verdict";
  const shown = all
    .filter(
      (p) =>
        (family === "All" || group(p) === family) &&
        (!wallet || p.seller.toLowerCase() === wallet.toLowerCase()) &&
        flags.every((f) =>
          f === "Sold"
            ? p.status === 4
            : f === "Appeals"
              ? p.isAppeal
              : f === "By letter"
                ? !!(p.flags & 1)
                : !!p.objections?.length,
        ),
    )
    .sort((a, b) =>
      sort === "Newest"
        ? Number(b.id - a.id)
        : (b.verdictAt ? b.score : -1) - (a.verdictAt ? a.score : -1) ||
          Number(b.id - a.id),
    );
  const total = Number(val(s, "CabalGate.nextId") || 1n) - 1,
    approved =
      s?.logs.filter((l) => l.eventName === "Verdict" && l.args.approved)
        .length || 0,
    denied =
      s?.logs.filter((l) => l.eventName === "Verdict" && !l.args.approved)
        .length || 0,
    pending =
      s?.logs.filter(
        (l) =>
          l.eventName === "PleaSubmitted" &&
          !s.logs.some(
            (e) =>
              ["Verdict", "PleaFailed", "PleaExpired"].includes(e.eventName) &&
              e.args.id === l.args.id,
          ) &&
          now <=
            Number(
              s.v.submissionTimes?.[String(l.args.id)] ||
                all.find((p) => p.id === l.args.id)?.submittedAt ||
                0,
            ) +
              Number(con(s, "CabalGate.PENDING_EXPIRY")),
      ).length || 0;
  const counts: Record<string, number> = {
    All: total,
    Approved: approved,
    Denied: denied,
    Pending: pending,
    "No verdict": total - approved - denied - pending,
  };
  async function loadMore() {
    if (busy || oldest <= 1n) return;
    setBusy(true);
    try {
      const more = await Promise.all(
        Array.from({ length: Math.min(12, Number(oldest - 1n)) }, (_, i) =>
          getPlea(r, oldest - 1n - BigInt(i), s?.logs),
        ),
      );
      setOlder((o) => [...o, ...more]);
      setError("");
    } catch {
      setError("Older pleas could not be read. Try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      s &&
      !shown.length &&
      oldest > 1n &&
      !busy &&
      !error &&
      (family !== "All" || flags.length || wallet)
    )
      void loadMore();
  }, [family, flags.join(), wallet, oldest, shown.length, busy]);
  const reset = () => {
    setFamily("All");
    setFlags([]);
    setSort("Newest");
    if (wallet) location.hash = "#/wall";
  };
  return (
    <>
      <Title title="The Wall">
        Every plea and its verdict, newest first; times are when each plea was
        sent. Open a card for its facts and the judges’ note.
      </Title>
      <div className="wall-tools">
        <div className="chips" role="group" aria-label="Show pleas by verdict">
          {Object.keys(counts).map((f) => (
            <button
              className="chip"
              key={f}
              aria-pressed={family === f}
              onClick={() => setFamily(f)}
            >
              {f}
              {!s?.historyError && (
                <span className="chip__count">{counts[f]}</span>
              )}
            </button>
          ))}
        </div>
        <details className="wall-tools__more">
          <summary className="chip">
            More filters{flags.length ? ` · ${flags.length} on` : ""}{" "}
            <Icon name="caret-down" />
          </summary>
          <div className="stack">
            <p className="label">Show only</p>
            <div className="chips" role="group" aria-label="Show only">
              {["Sold", "Appeals", "By letter", "Objected"].map((f) => (
                <button
                  key={f}
                  className="chip"
                  aria-pressed={flags.includes(f)}
                  onClick={() =>
                    setFlags((a) =>
                      a.includes(f) ? a.filter((x) => x !== f) : [...a, f],
                    )
                  }
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="label">Sort</p>
            <div className="chips" role="group" aria-label="Sort pleas">
              {["Newest", "Highest score"].map((f) => (
                <button
                  className="chip"
                  key={f}
                  aria-pressed={sort === f}
                  onClick={() => setSort(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>
      <p className="meta form-actions-top" aria-live="polite">
        {shown.length
          ? `Showing #${shown[0].id} to #${shown.at(-1)!.id}: ${shown.length} of ${total}, ${sort.toLowerCase()} first`
          : "No matching pleas"}
        {wallet ? ` · Showing pleas by ${short(wallet)}` : ""}
        {flags.length ? ` · ${flags.join(", ")}` : ""}
        {approved + denied && !s?.historyError
          ? ` · ${((approved * 100) / (approved + denied)).toFixed(1)}% of judged pleas approved`
          : ""}
      </p>
      {shown.length ? (
        <div className="wall-grid">
          {shown.map((p) => (
            <PleaCard key={String(p.id)} p={p} />
          ))}
        </div>
      ) : busy ? (
        <p className="loading-label">
          <Icon name="hourglass" />
          Reading older pleas…
        </p>
      ) : (
        <Empty
          icon={flags.includes("Objected") ? "gavel" : "scales"}
          title={
            flags.includes("Objected")
              ? "No objections yet"
              : family === "Denied"
                ? "No denied pleas yet"
                : total
                  ? "No matching pleas"
                  : "No pleas yet"
          }
          action={
            total ? { href: "#/wall", label: "Show all pleas" } : undefined
          }
        >
          {flags.includes("Objected")
            ? "Every approval so far went unchallenged. Suspicious."
            : family === "Denied"
              ? "The Cabal is in a good mood. It will not last."
              : !val(s, "PleaHook.seeded")
                ? "The first plea comes after trading opens."
                : "Every verdict lands here, newest first."}
        </Empty>
      )}
      {!shown.length && total > 0 && (
        <button className="btn btn--sm" onClick={reset}>
          Show all pleas
        </button>
      )}
      {error && (
        <p className="bad-text" role="alert">
          {error}
        </p>
      )}
      {oldest > 1n ? (
        <div className="wall-more">
          <button
            className="btn"
            aria-busy={busy}
            aria-disabled={busy}
            onClick={() => !busy && loadMore()}
          >
            {busy
              ? `Reading #${oldest - 1n} to #${oldest > 12n ? oldest - 12n : 1n}…`
              : "Load older pleas"}
          </button>
          <p className="small">
            {busy
              ? "The cards above stay put."
              : `Next: #${oldest - 1n} to #${oldest > 12n ? oldest - 12n : 1n}`}
          </p>
        </div>
      ) : (
        total > 0 && (
          <div className="wall-more">
            <p>That is every plea, back to #1.</p>
            <p>Yours would be #{total + 1}.</p>
            {val(s, "PleaHook.seeded") && !val(s, "CabalGate.diedAt") && (
              <a className="btn" href="#/plead">
                Write a plea <Icon name="arrow-right" />
              </a>
            )}
          </div>
        )
      )}
    </>
  );
}
export function Appeal({ p }: { p: Plea }) {
  const { r, s, now } = useApp();
  const { address } = useAccount();
  const balances = WalletBalances();
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(true);
  const [input, setInput] = useState(
    formatUnits(p.amount, s?.constants.decimals || 18),
  );
  const raw = parseAmount(input, s?.constants.decimals || 18);
  const tx = useTx(`${p.id}:${auto}:${input}:${text}`);
  const preview = useRead(
    () => appealPreview(r, s!, p, address!, auto, raw),
    [address, auto, raw.toString(), p.id.toString()],
    !!address && !!s,
  );
  const need = preview.data?.need;
  const openReason = balances.data?.open
    ? `Plea #${balances.data.pending} is open: one plea at a time.`
    : "";
  const fee =
    (con(s, "CabalGate.ORACLE_FEE") || 0n) +
    (con(s, "CabalGate.APPEAL_POOL_SHARE") || 0n);
  const closed =
    now > Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN")) ||
    p.appealed ||
    p.isAppeal ||
    !val(s, "CabalGate.cabalAlive");
  return (
    <Panel card title="One appeal">
      <Countdown
        until={Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN"))}
        label="Appeal window"
      />
      {auto ? (
        <>
          <p className="label">Appeal amount</p>
          <p className="stat__value">{tokenAmount(preview.data?.amount, s)}</p>
          {!!preview.data?.returned && (
            <p>
              Your open escrow of {tokenAmount(preview.data.returned, s)} comes
              back first.
            </p>
          )}
        </>
      ) : (
        <AmountInput
          id={`appeal-${p.id}`}
          label="Appeal amount"
          value={input}
          onChange={setInput}
          unit="PLEA"
        />
      )}
      {need !== undefined && (
        <Meter need={need} fact={Number(preview.data?.fact)} />
      )}
      <TextBox label="Your appeal" value={text} onChange={setText} />
      <label className="toggle-card">
        <input
          type="checkbox"
          className="box"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
          aria-labelledby="appeal-auto-title"
          aria-describedby="appeal-auto-desc"
        />
        <span className="toggle-card__title" id="appeal-auto-title">
          Sell automatically if approved
        </span>
        <span className="small" id="appeal-auto-desc">
          The fees are paid in PLEA. Anyone may sell within{" "}
          {span(Number(con(s, "CabalGate.EXECUTE_WINDOW")))} and earn the{" "}
          {tokenAmount(LETTERBOX.TIP, s, true)} tip. A delivered site sale pays{" "}
          {tokenAmount(LETTERBOX.AUTO_SELL_FEE, s, true)} to the prize pot.
        </span>
      </label>
      <Costs
        rows={
          auto
            ? [
                [
                  "Oracle fee",
                  tokenAmount(con(s, "CabalGate.ORACLE_FEE"), s, true),
                ],
                [
                  "To the buy wall",
                  tokenAmount(con(s, "CabalGate.APPEAL_POOL_SHARE"), s, true),
                ],
                [
                  "Tip for whoever sells it",
                  tokenAmount(LETTERBOX.TIP, s, true),
                ],
                [
                  `Paid in PLEA, ${tokenAmount(s?.v.appealFees?.[0], s, true)}`,
                  s?.v.appealFees
                    ? `about ${tokenAmount(priceFee(s!, s!.v.appealFees[0]), s, false, 0, "up")}`
                    : "after trading opens",
                ],
                [
                  "At most",
                  tokenAmount(s?.v.appealFees?.[1], s, false, 0, "up"),
                ],
                [
                  "Auto-sell fee, to the season prize pot",
                  tokenAmount(LETTERBOX.AUTO_SELL_FEE, s, true),
                ],
              ]
            : [
                [
                  "Oracle fee, from your imdTEST",
                  tokenAmount(con(s, "CabalGate.ORACLE_FEE"), s, true),
                ],
                [
                  "To the buy wall, from your imdTEST",
                  tokenAmount(con(s, "CabalGate.APPEAL_POOL_SHARE"), s, true),
                ],
                ["You pay", tokenAmount(fee, s, true, 2, "up")],
                ["Extra fee", "none"],
              ]
        }
      />
      <p className="small">
        {auto
          ? "Press Sell yourself and keep the tip. Your open escrow comes back first; the oracle fee is spent."
          : `Off: you pay in ${s?.constants.pairSymbol} and, if approved, sell yourself within ${span(Number(con(s, "CabalGate.EXECUTE_WINDOW")))}.`}
      </p>
      {auto ? (
        <Action
          {...tx}
          label="Appeal"
          sub={
            auto
              ? `${tokenAmount(s?.v.appealFees?.[0], s, true)} in PLEA`
              : tokenAmount(fee, s, true)
          }
          onRun={() => tx.send("Letterbox", "appealAuto", [p.id, text])}
          disabled={
            !tx.ready ||
            !!openReason ||
            closed ||
            !!preview.data?.reason ||
            !textCheck("plea", text).ok ||
            need === undefined ||
            need > Number(con(s, "CabalGate.MAX_PLEA_SCORE"))
          }
          reason={
            openReason ||
            preview.error ||
            preview.data?.reason ||
            (closed
              ? "This appeal window is closed."
              : need && need > Number(con(s, "CabalGate.MAX_PLEA_SCORE"))
                ? "This plea cannot pass. Try a smaller amount or wait for your facts to improve."
                : undefined)
          }
        />
      ) : (
        <ApprovedAction
          name="CabalGate"
          fn="appeal"
          args={[p.id, raw, text]}
          label="Appeal"
          sub={
            auto
              ? `${tokenAmount(s?.v.appealFees?.[0], s, true)} in PLEA`
              : tokenAmount(fee, s, true)
          }
          token={r.addresses.PairToken}
          spender={r.addresses.CabalGate}
          spend={fee}
          disabled={
            closed ||
            !!openReason ||
            !preview.data ||
            raw < (preview.data?.minimum || 0n) ||
            raw > (preview.data?.maximum || p.amount) ||
            raw <= 0n ||
            raw > p.amount ||
            !textCheck("plea", text).ok ||
            need === undefined ||
            need > Number(con(s, "CabalGate.MAX_PLEA_SCORE"))
          }
          reason={
            openReason ||
            (closed
              ? "This appeal window is closed."
              : raw > p.amount
                ? "An appeal cannot increase the original amount."
                : undefined)
          }
        />
      )}
      <p className="small">
        Or send APPEAL &lt;text&gt; to the Letterbox from Etherscan:{" "}
        {tokenAmount(
          BigInt(con(s, "CabalGate.ORACLE_FEE")) +
            BigInt(con(s, "CabalGate.APPEAL_POOL_SHARE")) +
            LETTERBOX.TIP,
          s,
          true,
        )}{" "}
        paid in PLEA, about{" "}
        {tokenAmount(
          priceFee(
            s!,
            BigInt(con(s, "CabalGate.ORACLE_FEE")) +
              BigInt(con(s, "CabalGate.APPEAL_POOL_SHARE")) +
              LETTERBOX.TIP,
          ),
          s,
        )}{" "}
        (oracle fee + buy-wall share + tip, back if you send SELL yourself).{" "}
        <a href="#/letters">How letters work</a>
      </p>
      {p.escrow?.[1] && (
        <p className="small">
          Not appealing? Call Return escrow and tip above to get your PLEA back;
          a new plea waits for the cooldown, until{" "}
          {clock(Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN")))}.
        </p>
      )}
      <p className="small">
        Name the earlier verdict if it helps. Demands for a score count as
        manipulation.
      </p>
    </Panel>
  );
}
export function PleaPage({ id }: { id: string }) {
  const { r, s, now } = useApp();
  const { address } = useAccount();
  const number = /^\d+$/.test(id) ? BigInt(id) : 0n;
  const query = useRead(
    () => getPlea(r, number, s?.logs),
    [id],
    !!s &&
      number > 0n &&
      number < val(s, "CabalGate.nextId") &&
      !s.pleas.some((p) => p.id === number),
  );
  let p = s?.pleas.find((p) => p.id === number) || query.data;
  const saleQuote = useRead(
    async () => {
      if (!p) return 0n;
      const allowance = address
        ? await read(r, "PLEA", "allowance", [address, r.addresses.CabalGate])
        : 0n;
      if (
        address?.toLowerCase() === p.seller.toLowerCase() &&
        allowance >= p.amount &&
        !(p.flags & 2)
      ) {
        const result = await r.client.simulateContract({
          address: r.addresses.CabalGate,
          abi: r.abis.CabalGate,
          functionName: "executeSell",
          args: [0n],
          account: address,
        });
        return result.result as bigint;
      }
      return (await poolQuote(r, s!, p.amount, true)).out;
    },
    [id, address, p?.status],
    !!s && !!p && p.status === 2,
  );

  const mine = p?.seller.toLowerCase() === address?.toLowerCase();
  const tx = useTx(id);
  const pointTx = useTx(id);
  const oracle = useRead(
    () => oracleRequest(r, p!, s?.logs || []),
    [p?.id.toString(), p?.status],
    !!p,
  );
  if (!s)
    return (
      <div className="stack">
        <Title title={`Plea #${id}`} />
        <p>Reading the plea from Sepolia…</p>
      </div>
    );
  if (!p)
    return (
      <div className="stack">
        <nav className="meta" aria-label="Breadcrumb">
          <a href="#/wall">Wall</a> /{" "}
          <a href={`#/p/${id}`} aria-current="page">
            Plea #{id}
          </a>
        </nav>
        <Title title={`Plea #${id}`} />
        {query.loading ? (
          <p>Reading the case…</p>
        ) : (
          <Empty
            icon="scales"
            title={`No plea #${id} yet`}
            action={{ href: "#/wall", label: "See the Wall" }}
          >
            {query.error ||
              (val(s, "PleaHook.seeded")
                ? `Check the plea number in this link. ${Number(val(s, "CabalGate.nextId")) - 1} pleas so far.`
                : "The first plea comes after trading opens.")}
          </Empty>
        )}
      </div>
    );
  const state = pleaState(p, now, s);
  const approved = [2, 4, 5].includes(p.status);
  const sellUntil =
    Number(p.verdictAt) + Number(con(s, "CabalGate.EXECUTE_WINDOW"));
  const objectionUntil =
    Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW"));
  const net = saleQuote.data || 0n;
  const minOut = (net * 99n) / 100n;
  const canSell = p.status === 2 && now <= sellUntil;
  const auto = (p.flags & 2) > 0;
  const held = !p.excluded && !p.standing?.[1] && !!p.standing?.[0];
  const settled = p.escrow && !p.escrow[1];
  const appealId = s.logs.find(
    (l) => l.eventName === "PleaSubmitted" && l.args.originalId === p.id,
  )?.args.id;
  return (
    <div className="stack stack--lg">
      <nav aria-label="Breadcrumb" className="meta">
        <a href="#/wall">Wall</a> /{" "}
        <a href={`#/p/${id}`} aria-current="page">
          Plea #{id}
        </a>
      </nav>
      <div className="page-title">
        <h1>Plea #{id}</h1>
        {mine && <span className="badge badge--you">YOU</span>}
      </div>
      <p className="lead">
        {state === "PENDING"
          ? "Waiting for the Cabal: usually 3 to 6 minutes."
          : state === "NO VERDICT"
            ? "No verdict. No cooldown; the oracle fee is spent."
            : p.standing?.[1]
              ? "A second panel sustained an objection. No points; the sale stands."
              : canSell
                ? `The Cabal approved ${mine ? "your" : "this"} plea. Sell within the ${span(Number(con(s, "CabalGate.EXECUTE_WINDOW")), "adj")} window, by ${clock(sellUntil)}.`
                : p.status === 4
                  ? `Sold ${tokenAmount(p.amount, s)} for ${tokenAmount(soldFor(p, s), s, true)}.`
                  : state === "UPHELD"
                    ? "The denial was upheld. No further appeal."
                    : state === "LAPSED"
                      ? "The approval lapsed unsold; its points still count."
                      : "The Cabal denied this plea."}{" "}
        {held
          ? `The +${p.points} points are held while objections are open; record them after ${clock(objectionUntil)}.`
          : p.recorded
            ? `+${p.points} points recorded.`
            : ""}
      </p>
      <div className="split split--even status">
        <div className="stack status__plea">
          <PleaCard p={p} detail />
          <PleaTimeline p={p} />
          <Panel level={2} title="The judges">
            <Costs
              rows={[
                ["Amount", tokenAmount(p.amount, s)],
                ["Submitted", utc(p.submittedAt)],
                ["Verdict", p.verdictAt > 0n ? utc(p.verdictAt) : "Waiting"],
                ["Oracle request", short(p.intakeId)],
              ]}
            />
            <p className="small">
              {oracle.loading
                ? "Reading the oracle request…"
                : oracle.error
                  ? "Oracle request details are unavailable. The on-chain verdict above remains the source of truth."
                  : "Oracle request loaded from api.imd.fun."}
            </p>
            {oracle.data && (
              <div className="stack stack--sm">
                <p className="plea__judge">
                  Judged by {oracle.data.panelSize || "Panel"} judges ·{" "}
                  {oracle.data.attestation?.agreed ??
                    oracle.data.agreement?.agreed ??
                    "Agreement pending"}{" "}
                  agreed ·{" "}
                  {elapsed(Number(p.verdictAt) - Number(p.submittedAt))}
                  {oracle.data.comment
                    ? ` · A judge said: “${oracle.data.comment}”`
                    : ""}
                </p>
                <a
                  className="link-btn"
                  href={`${APP.oracleApi}/oracle/requests/${encodeURIComponent(oracle.data.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View oracle request
                </a>
              </div>
            )}
            <a className="btn" href={`#/share/${p.id}`}>
              <Icon name="share-network" />
              Share this plea
            </a>
          </Panel>
        </div>
        <div className="stack stack--lg status__side">
          <Panel
            level={2}
            card
            className="status__sell"
            title={mine ? "Your sale" : "Sale status"}
          >
            {state === "PENDING" ? (
              <>
                <Countdown
                  until={
                    Number(p.submittedAt) +
                    Number(con(s, "CabalGate.PENDING_EXPIRY"))
                  }
                  label="Waiting for the Cabal"
                  block
                  wait
                />
                <p>
                  Usually 3 to 6 minutes. The request expires at{" "}
                  {utc(
                    Number(p.submittedAt) +
                      Number(con(s, "CabalGate.PENDING_EXPIRY")),
                  )}
                  .
                  <Meter fact={p.factScore} need={p.need} verdict="PENDING" />
                </p>
              </>
            ) : canSell ? (
              <>
                <Countdown
                  until={sellUntil}
                  label="Sell within"
                  urgent={!!mine}
                  block={!!mine}
                />
                <p className="small">
                  The window closes at {clock(sellUntil, true)}. Miss it and the
                  plea lapses (the points still count).
                </p>
                {auto ? (
                  <>
                    <p>
                      PLEA is escrowed in the Letterbox. Anyone can deliver; the
                      sale goes to the writer. The runner earns the tip.
                    </p>
                    <Action
                      {...tx}
                      label={mine ? "Sell yourself" : "Deliver approved sale"}
                      variant={mine ? "ink" : undefined}
                      primary={false}
                      block
                      sub={`≈ ${tokenAmount(net > LETTERBOX.AUTO_SELL_FEE ? net - LETTERBOX.AUTO_SELL_FEE : 0n, s, true)}`}
                      onRun={() =>
                        tx.send("Letterbox", "deliver", [p!.id], undefined, {
                          errors: {
                            SlippageExceeded: `The pool price is more than 5% under the hourly snapshot, so the Letterbox’s minimum can’t be met. Nothing was sold; try again before ${clock(sellUntil, true)}.`,
                          },
                        })
                      }
                      disabled={!tx.ready}
                    />
                  </>
                ) : mine ? (
                  <>
                    <Costs
                      rows={[
                        ["Sells", tokenAmount(p.amount, s)],
                        [
                          "You get about",
                          saleQuote.data
                            ? tokenAmount(net, s, true)
                            : "Reading the pool…",
                        ],
                        [
                          "At least, with 1% slippage",
                          saleQuote.data
                            ? tokenAmount(minOut, s, true)
                            : "Reading the pool…",
                        ],
                      ]}
                    />
                    <ApprovedAction
                      name="CabalGate"
                      fn="executeSell"
                      args={[minOut]}
                      label="Sell now"
                      token={r.addresses.PLEA}
                      spender={r.addresses.CabalGate}
                      spend={p.amount}
                      variant="ink"
                      sub={`≈ ${tokenAmount(net, s, true)}`}
                      disabled={minOut <= 0n}
                      reason={saleQuote.error}
                      prepare={async () => {
                        const simulation = await r.client.simulateContract({
                          address: r.addresses.CabalGate,
                          abi: r.abis.CabalGate,
                          functionName: "executeSell",
                          args: [0n],
                          account: address!,
                        });
                        return [((simulation.result as bigint) * 99n) / 100n];
                      }}
                      errors={{
                        SlippageExceeded: `The price moved more than 1%. Nothing was sold; your PLEA stays in your wallet. The window is open until ${clock(sellUntil, true)}: try again.`,
                        WindowLapsed: `The window closed at ${clock(sellUntil, true)}. Plea #${p.id} lapsed: nothing was sold. Your +${p.points} points still count. Next plea at ${clock(Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN")))}.`,
                      }}
                    />
                  </>
                ) : (
                  <p>Only the seller can sell plea #{String(p.id)}.</p>
                )}
              </>
            ) : (
              <SaleSummary p={p} state={state} appealId={appealId} />
            )}
            {p.status === 1 && state === "NO VERDICT" && !auto && (
              <TxButton
                label="Expire unanswered plea"
                name="CabalGate"
                fn="expire"
                args={[p.id]}
              />
            )}{" "}
            {auto &&
              p.escrow?.[1] &&
              !canSell &&
              (p.status !== 1 || state === "NO VERDICT") && (
                <TxButton
                  label="Return escrow and tip"
                  name="Letterbox"
                  fn="settle"
                  args={[p.id]}
                />
              )}
          </Panel>
          {approved && (
            <Panel level={2} title="Your points">
              <p className="stat__value">
                {p.standing?.[1] || p.excluded
                  ? "No points"
                  : `+${p.points} points ${p.recorded ? "recorded" : held ? "held" : "once recorded"}`}
              </p>
              {p.seat && (
                <p className="small">
                  Seat multiplier ×
                  {Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) / 10000},
                  rounded down. The judges’ score and need stay the same.
                </p>
              )}
              {held && (
                <Countdown
                  until={objectionUntil}
                  label={
                    now > objectionUntil
                      ? "Objection panel pending"
                      : "Objections close in"
                  }
                />
              )}
              <Action
                {...pointTx}
                label="Record my points"
                primary={false}
                onRun={() => pointTx.send("Seasons", "record", [p!.id])}
                disabled={
                  !pointTx.ready ||
                  held ||
                  p.recorded ||
                  p.standing?.[1] ||
                  p.excluded
                }
                reason={
                  p.excluded
                    ? "This seller is excluded from season points and prizes."
                    : p.recorded
                      ? "Already recorded"
                      : p.standing?.[1]
                        ? "An objection was sustained. This plea earns no points."
                        : held
                          ? "Points are held while the objection window is open or a panel is pending."
                          : "Anyone may record these points. Nothing records them by itself."
                }
              />
            </Panel>
          )}
          {state === "DENIED" &&
            !p.isAppeal &&
            !p.appealed &&
            now <= Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN")) &&
            val(s, "CabalGate.cabalAlive") &&
            mine && <Appeal p={p} />}
          {approved && (
            <Panel level={2} title="Objections">
              {now <= objectionUntil ? (
                <>
                  <div>
                    <Countdown
                      until={objectionUntil}
                      label="Objections close in"
                    />
                  </div>
                  <span className="pill">
                    {p.objections?.length || 0} of{" "}
                    {String(con(s, "Tribunal.MAX_OBJECTIONS"))} filed
                  </span>
                  <p>
                    You can’t object to your own plea. Others may until{" "}
                    {clock(objectionUntil)}, for a{" "}
                    {tokenAmount(con(s, "Tribunal.ORACLE_FEE"), s, true)} fee +{" "}
                    {tokenAmount(con(s, "Tribunal.STAKE"), s, true)} stake. A
                    new panel of {String(con(s, "Tribunal.PANEL_SIZE"))}{" "}
                    re-scores it: sustained only at{" "}
                    {p.need - Number(con(s, "Tribunal.MARGIN")) - 1} or less.
                    Void if the panel splits or gives no answer within{" "}
                    {span(Number(con(s, "Tribunal.PENDING_EXPIRY")))}: nothing
                    changes. The sale is never touched.
                  </p>
                  {!mine &&
                    (address ? (
                      <a
                        className="btn btn--primary"
                        href={`#/objections?plea=${p.id}`}
                      >
                        Object{" "}
                        <span className="btn__sub">
                          {tokenAmount(
                            BigInt(con(s, "Tribunal.ORACLE_FEE")) +
                              BigInt(con(s, "Tribunal.STAKE")),
                            s,
                            true,
                          )}
                        </span>
                      </a>
                    ) : (
                      <Notice title="Connect in the top bar to object.">
                        <p>
                          The plea, its verdict and its timeline read without a
                          wallet. Only the seller can sell it.
                        </p>
                      </Notice>
                    ))}
                </>
              ) : (
                <p>
                  Objections closed at {clock(objectionUntil)} ·{" "}
                  {p.objections?.length || 0} of{" "}
                  {String(con(s, "Tribunal.MAX_OBJECTIONS"))} filed.
                </p>
              )}
              <ObjectionLines p={p} />
              <a className="btn" href={`#/objections?plea=${p.id}`}>
                How objections work <Icon name="arrow-right" />
              </a>
            </Panel>
          )}
        </div>
      </div>
      <section className="section">
        <div className="split split--even split--stretch">
          <div>
            <Share id={String(p.id)} embedded />
          </div>
          <Panel level={2} title="Details">
            <dl className="addr-list">
              <div>
                <dt>Seller</dt>
                <dd>
                  {p.name && <p>{p.name}</p>}
                  <AddressView address={p.seller} label="seller" />
                </dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>
                  {tokenAmount(p.amount, s)}{" "}
                  {p.balance
                    ? `(${Number((p.amount * 10000n) / p.balance) / 100}% of ${tokenAmount(p.balance, s)})`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Value</dt>
                <dd>
                  {tokenAmount(
                    (p.amount * BigInt(val(s, "PleaHook.latestPrice") || 0n)) /
                      Q96,
                    s,
                    true,
                  )}{" "}
                  at 1M PLEA ={" "}
                  {tokenAmount(
                    (BigInt(val(s, "PleaHook.latestPrice") || 0n) *
                      10n ** 24n) /
                      Q96,
                    s,
                    true,
                  )}
                </dd>
              </div>
              <div>
                <dt>Fact score</dt>
                <dd>
                  {p.factScore}
                  {p.facts?.total === p.factScore
                    ? ` (${p.facts.share} + ${p.facts.held} + ${p.facts.profit} + ${p.facts.trend})`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Need</dt>
                <dd>
                  {p.need} ({String(con(s, "CabalGate.PASS_MARK"))} −{" "}
                  {p.factScore})
                </dd>
              </div>
              <div>
                <dt>Panel</dt>
                <dd>
                  {String(con(s, "CabalGate.PANEL_SIZE"))} seats, quorum{" "}
                  {String(con(s, "CabalGate.QUORUM"))}
                  {oracle.data
                    ? ` · ${oracle.data.attestation?.agreed || oracle.data.agreement?.agreed || "agreement pending"} agreed`
                    : ""}
                </dd>
              </div>
              {[
                ["Plea transaction", p.submittedLog, p.submittedAt],
                ["Verdict transaction", p.verdictLog, p.verdictAt],
              ].map(([label, log, time]: any) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {log ? (
                      <a
                        href={`${r.network.explorer}/tx/${log.transactionHash}`}
                      >
                        {clock(time)} · View transaction
                      </a>
                    ) : (
                      "No transaction yet"
                    )}
                  </dd>
                </div>
              ))}
              <div>
                <dt>Contract</dt>
                <dd>
                  <AddressView
                    address={r.addresses.CabalGate}
                    label="CabalGate"
                  />
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </section>
    </div>
  );
}
import { APP } from "./config";
export function ObjectionForm({ p }: { p: Plea }) {
  const { r, s, now } = useApp(),
    { address } = useAccount(),
    [text, setText] = useState("");
  const info = useRead(
      async () => {
        const [c, excluded, sellerExcluded] = await Promise.all([
          read(r, "Tribunal", "caseOf", [p.id]),
          address ? read(r, "Seasons", "excluded", [address]) : false,
          read(r, "Seasons", "excluded", [p.seller]),
        ]);
        return { c, excluded, sellerExcluded };
      },
      [p.id, address],
      !!s,
    ),
    c = info.data?.c,
    pending = c?.pending.filter((n: bigint) => n !== 0n).length || 0,
    count = Number(c?.count || 0) + pending,
    full = count >= Number(con(s, "Tribunal.MAX_OBJECTIONS")),
    own = address?.toLowerCase() === p.seller.toLowerCase(),
    until = Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW")),
    closed =
      ![2, 4, 5].includes(p.status) ||
      now > until ||
      !val(s, "CabalGate.cabalAlive") ||
      p.recorded ||
      c?.sustained;
  const cost =
      BigInt(con(s, "Tribunal.ORACLE_FEE")) + BigInt(con(s, "Tribunal.STAKE")),
    same = p.objections?.some(
      (o) =>
        o.objector.toLowerCase() === address?.toLowerCase() && o.ruling !== 4,
    ),
    reason = closed
      ? `Objections closed at ${clock(until)}.`
      : own
        ? "You can’t object to your own plea."
        : full
          ? `This case is full. A plea takes at most ${con(s, "Tribunal.MAX_OBJECTIONS")} objections, from different wallets.`
          : same
            ? "You already objected to this plea."
            : info.data?.excluded || info.data?.sellerExcluded
              ? "This wallet or seller is excluded from seasons."
              : !textCheck("objection", text).ok
                ? "Write your objection to send it; nothing is paid until it passes."
                : undefined;
  return (
    <article className="card plea stack">
      <div className="plea__head">
        <h3>Plea #{String(p.id)}</h3>
        <span className="meta">
          by{" "}
          <span className={!p.name ? "mono" : ""}>
            {p.name || short(p.seller)}
          </span>
        </span>
      </div>
      <Stamp p={p} />
      <p className="plea__text">“{p.text}”</p>
      <p className="small">
        Judges {p.score} · Need {p.need} ={" "}
        {String(con(s, "CabalGate.PASS_MARK"))} − fact {p.factScore} ·{" "}
        {p.status === 4
          ? `Sold ${tokenAmount(p.amount, s)} for ${tokenAmount(soldFor(p, s!), s, true)}`
          : `Sells ${tokenAmount(p.amount, s)}`}
      </p>
      {now <= until ? (
        <div>
          <Countdown until={until} label="Objections close in" />
        </div>
      ) : (
        <p>Objections closed at {clock(until)}.</p>
      )}
      <div>
        <span className="pill">
          {count} of {String(con(s, "Tribunal.MAX_OBJECTIONS"))} filed
          {count === 1 ? " · one slot left" : ""}
        </span>
      </div>
      {p.objections
        ?.filter((o) => o.ruling === 1)
        .map((o) => (
          <div className="panel panel--sunken" key={String(o.id)}>
            <p>
              Objection #{String(o.id)} pending by{" "}
              <span className="mono">{short(o.objector)}</span> · a new panel is
              re-scoring the plea
            </p>
            <p>“{o.text}”</p>
          </div>
        ))}
      <p>
        {p.standing?.[1]
          ? "No points"
          : `+${p.points || 0} points${p.standing?.[0] ? " held" : ""}`}
      </p>
      {own ? (
        <Notice title="You can’t object to your own plea.">
          <p>Anyone else may ask a second panel. The sale stands.</p>
        </Notice>
      ) : closed ? (
        <Notice title={`Objections closed at ${clock(until)}.`}>
          <p>
            {p.standing?.[1]
              ? "No points for this plea."
              : "The points may be recorded once no panel is pending."}
          </p>
        </Notice>
      ) : full ? (
        <>
          <Notice kind="warn" title="This case is full.">
            <p>
              A plea takes at most {String(con(s, "Tribunal.MAX_OBJECTIONS"))}{" "}
              objections, from different wallets.
            </p>
          </Notice>
          <button className="btn" aria-disabled="true">
            Object
          </button>
          <p className="small">
            Two objections are pending on plea #{String(p.id)}. Nothing to send.
          </p>
        </>
      ) : (
        <>
          <h4>Object to plea #{String(p.id)}</h4>
          <TextBox
            kind="objection"
            label="Your objection"
            value={text}
            onChange={setText}
          />
          <p className="field__hint">
            Say why the score is too high. On plea #{String(p.id)} the objection
            is sustained if the new score is{" "}
            {p.need - Number(con(s, "Tribunal.MARGIN")) - 1} or less, more than{" "}
            {String(con(s, "Tribunal.MARGIN"))} below the need {p.need}.{" "}
            <a href="#/objections">How a ruling works</a>
          </p>
          {!address && (
            <Notice title="Connect in the top bar to object.">
              <p>The cases and rulings read without a wallet.</p>
            </Notice>
          )}
          <ApprovedAction
            name="Tribunal"
            fn="object"
            args={[p.id, text]}
            label="Object"
            sub={tokenAmount(cost, s, true)}
            token={r.addresses.PairToken}
            spender={r.addresses.Tribunal}
            spend={cost}
            disabled={!!reason || info.loading || !info.data}
            reason={reason}
          />
          <p className="small">
            {tokenAmount(con(s, "Tribunal.ORACLE_FEE"), s, true)} oracle fee +{" "}
            {tokenAmount(con(s, "Tribunal.STAKE"), s, true)} stake, from your{" "}
            {s?.constants.pairSymbol} balance. Write your objection to send it;
            nothing is paid until it passes.
          </p>
        </>
      )}
    </article>
  );
}
export function Objections() {
  const { r, s, now } = useApp(),
    specific = new URLSearchParams(location.hash.split("?")[1]).get("plea"),
    requested = useRead(
      () => getPlea(r, BigInt(specific!), s?.logs),
      [specific],
      !!s &&
        !!specific &&
        /^\d+$/.test(specific) &&
        BigInt(specific) > 0n &&
        BigInt(specific) < val(s, "CabalGate.nextId"),
    );
  const open =
      s?.pleas
        .filter(
          (p) =>
            [2, 4, 5].includes(p.status) &&
            now <=
              Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW")),
        )
        .sort((a, b) => Number(a.verdictAt - b.verdictAt)) || [],
    selected =
      s?.pleas.find((p) => String(p.id) === specific) || requested.data,
    list = specific ? (selected ? [selected] : []) : open;
  const objections = (
    s?.v.objections ||
    s?.pleas.flatMap((p) => p.objections || []) ||
    []
  )
    .slice()
    .sort((a: any, b: any) => Number(b.id - a.id));
  const cases = useRead(
    () =>
      Promise.all(
        [...new Set<bigint>(objections.map((o: any) => o.pleaId))].map((id) =>
          getPlea(r, id, s?.logs),
        ),
      ),
    [objections.map((o: any) => o.id + ":" + o.ruling).join(",")],
    !!s && objections.length > 0,
  );
  return (
    <>
      <Title title="Objection!">
        For {span(Number(con(s, "Tribunal.OBJECTION_WINDOW")))} after an
        approval, anyone else may object. A fresh panel re-scores the plea; the
        points can only fall, and the sale stands.
      </Title>
      <div className="cluster">
        <span className="pill">
          {span(Number(con(s, "Tribunal.OBJECTION_WINDOW")))} after an approval
        </span>
        <span className="pill">
          {tokenAmount(con(s, "Tribunal.ORACLE_FEE"), s, true)} fee +{" "}
          {tokenAmount(con(s, "Tribunal.STAKE"), s, true)} stake
        </span>
        <span className="pill">
          At most {String(con(s, "Tribunal.MAX_OBJECTIONS"))} per plea
        </span>
      </div>
      <section className="section">
        <div className="section__head">
          <h2>Open now</h2>
          <p className="meta">
            {list.length} approved pleas · closing soonest first
          </p>
        </div>
        <div className="split">
          <div className="stack">
            {val(s, "CabalGate.diedAt") ? (
              <Empty
                icon="gavel"
                title="The court has risen"
                action={{ href: "#/buy", label: "Sell on the Buy page" }}
              >
                No plea can be approved any more, so there is nothing new to
                object to. Stakes on objections already filed still move when
                anyone calls settle.
              </Empty>
            ) : list.length ? (
              list.map((p) => <ObjectionForm p={p} key={String(p.id)} />)
            ) : (
              <Empty
                icon="megaphone-simple"
                title="No open cases"
                action={{ href: "#/wall", label: "See the Wall" }}
              >
                No approved plea is inside its objection window.
              </Empty>
            )}
          </div>
          <Panel title="How a ruling works">
            <p>
              <span className="stamp stamp--sm stamp--objection">
                SUSTAINED
              </span>{" "}
              A second panel gives a score more than{" "}
              {String(con(s, "Tribunal.MARGIN"))} below the need. No points; the
              stake comes back.
            </p>
            <p>
              <span className="stamp stamp--sm stamp--objection">
                OVERRULED
              </span>{" "}
              The lowest score counts for points. The stake goes to the season
              prize pot.
            </p>
            <p>
              <span className="stamp stamp--sm stamp--objection">VOID</span> The
              panel split or gave no answer within{" "}
              {span(Number(con(s, "Tribunal.PENDING_EXPIRY")))}. Nothing
              changes; the stake comes back.
            </p>
            <Costs
              rows={[
                [
                  "Oracle fee, spent",
                  tokenAmount(con(s, "Tribunal.ORACLE_FEE"), s, true),
                ],
                [
                  "Stake: back unless overruled",
                  tokenAmount(con(s, "Tribunal.STAKE"), s, true),
                ],
                [
                  "An objection, from your imdTEST",
                  tokenAmount(
                    BigInt(con(s, "Tribunal.ORACLE_FEE")) +
                      BigInt(con(s, "Tribunal.STAKE")),
                    s,
                    true,
                  ),
                ],
              ]}
            />
            <p>
              <Icon name="coins" /> The oracle fee is spent in every outcome.
            </p>
            <p>
              <Icon name="scales" /> Points can fall, never rise.
            </p>
            <p>
              <Icon name="gavel" /> The sale is never touched.
            </p>
            <p>
              <Icon name="hourglass" /> Anyone can settle a ruled stake.
            </p>
          </Panel>
        </div>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>Recent rulings</h2>
        </div>
        {objections.length ? (
          <div
            className="table-wrap"
            role="region"
            aria-label="Recent rulings on objections"
            tabIndex={0}
          >
            <table className="table table--tight">
              <caption className="sr-only">
                Recent rulings on objections, newest first
              </caption>
              <thead>
                <tr>
                  {[
                    "Objection",
                    "Ruling",
                    "Plea",
                    "Points that count",
                    "Stake",
                    "Objection text",
                  ].map((t) => (
                    <th scope="col" key={t}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {objections.map((o: any) => {
                  const p =
                    cases.data?.find((p) => p.id === o.pleaId) ||
                    s?.pleas.find((p) => p.id === o.pleaId);
                  return (
                    <tr key={String(o.id)}>
                      <th scope="row">
                        #{String(o.id)}
                        <p className="mono small">{short(o.objector)}</p>
                      </th>
                      <td>
                        <span className="stamp stamp--sm stamp--objection">
                          {
                            ["", "OBJECTION", "SUSTAINED", "OVERRULED", "VOID"][
                              o.ruling
                            ]
                          }
                        </span>
                        <p className="small">
                          {p ? objectionLine(o, p) : "Reading the plea…"}
                        </p>
                      </td>
                      <td>
                        <a href={`#/p/${o.pleaId}`}>#{String(o.pleaId)}</a>
                      </td>
                      <td>
                        {o.ruling === 2
                          ? `none · was ${p?.score || 0}`
                          : o.ruling === 4
                            ? "unchanged"
                            : p
                              ? `${p.points} points`
                              : "Reading…"}
                      </td>
                      <td>
                        <p>
                          {tokenAmount(con(s, "Tribunal.STAKE"), s, true)}{" "}
                          {o.ruling === 3
                            ? "to the season prize pot"
                            : o.ruling > 1
                              ? "back to the objector"
                              : "held"}
                        </p>
                        {o.ruling === 1 &&
                          now >
                            Number(o.filedAt) +
                              Number(con(s, "Tribunal.PENDING_EXPIRY")) && (
                            <TxButton
                              name="Tribunal"
                              fn="expire"
                              args={[o.id]}
                              label="Expire unanswered objection"
                            />
                          )}
                        {o.ruling > 1 && !o.settled && (
                          <TxButton
                            name="Tribunal"
                            fn="settle"
                            args={[o.id]}
                            label="Settle objection stake"
                          />
                        )}
                      </td>
                      <td>{o.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="scales" title="No rulings yet">
            The Tribunal has not ruled on an objection in this test run.
          </Empty>
        )}
      </section>
    </>
  );
}

function ObjectionLines({ p }: { p: Plea }) {
  return (
    <>
      {p.objections?.map((o) => (
        <p className="small" key={String(o.id)}>
          <span className="stamp stamp--sm stamp--objection">
            {["", "OBJECTION", "SUSTAINED", "OVERRULED", "VOID"][o.ruling]}
          </span>{" "}
          {objectionLine(o, p)}
          {o.text ? ` · “${o.text}”` : ""}
        </p>
      ))}
    </>
  );
}
function SaleSummary({
  p,
  state,
  appealId,
}: {
  p: Plea;
  state: string;
  appealId?: bigint;
}) {
  const { s, now } = useApp(),
    delivered = s!.logs.find(
      (l) => l.eventName === "Delivered" && l.args.id === p.id,
    ),
    { address } = useAccount(),
    end = Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN"));
  if (p.status === 4)
    return (
      <>
        <Costs
          rows={
            delivered
              ? [
                  ["Sold", tokenAmount(p.amount, s)],
                  [
                    "Sold by",
                    delivered.args.runner.toLowerCase() ===
                    address?.toLowerCase()
                      ? "you"
                      : short(delivered.args.runner),
                  ],
                  [
                    "Tip, to whoever sold it",
                    tokenAmount(delivered.args.tip, s, true),
                  ],
                  ...(delivered.args.fee > 0n
                    ? [
                        [
                          "Auto-sell fee, to the season prize pot",
                          tokenAmount(delivered.args.fee, s, true),
                        ] as [string, string],
                      ]
                    : []),
                  ["To the writer", tokenAmount(soldFor(p, s!), s, true)],
                  [
                    "Points",
                    p.standing?.[1] || p.excluded
                      ? "none"
                      : `+${p.points}${p.standing?.[0] ? " held" : ""}`,
                  ],
                ]
              : [
                  [
                    "Sold",
                    `${tokenAmount(p.amount, s)} for ${tokenAmount(soldFor(p, s!), s, true)}`,
                  ],
                  [
                    "Points",
                    p.standing?.[1] || p.excluded ? "none" : `+${p.points}`,
                  ],
                ]
          }
        />
        {p.isAppeal && (
          <p>
            #{String(p.originalId)} was denied. This appeal overturned that
            verdict: {p.score} vs need {p.need} at {clock(p.verdictAt)}.
          </p>
        )}
      </>
    );
  if (state === "LAPSED")
    return (
      <>
        <p>
          Approved at {clock(p.verdictAt)} but not sold within{" "}
          {span(Number(con(s, "CabalGate.EXECUTE_WINDOW")))}: the window closed
          at{" "}
          {clock(
            Number(p.verdictAt) + Number(con(s, "CabalGate.EXECUTE_WINDOW")),
          )}
          . The {p.points} points still count for season{" "}
          {Number(
            (p.verdictAt - BigInt(val(s, "CabalGate.startedAt"))) /
              BigInt(con(s, "Seasons.SEASON")),
          ) + 1}
          .
        </p>
        {now < end && (
          <div>
            <Countdown until={end} label="Next plea in" />
          </div>
        )}
        <p>
          The {span(Number(con(s, "CabalGate.COOLDOWN")), "adj")} cooldown runs
          from the verdict, until {clock(end)}.
        </p>
      </>
    );
  if (state === "NO VERDICT")
    return (
      <>
        <p>
          {p.failure?.status === 1
            ? "The request was refused."
            : p.failure?.answered
              ? `The panel split: ${p.failure.agreed} of ${p.failure.answered} agreed (${con(s, "CabalGate.QUORUM")} needed).`
              : `No answer within ${span(Number(con(s, "CabalGate.PENDING_EXPIRY")))}.`}
        </p>
        <p>
          Cleared at once by the Intake. No cooldown; the{" "}
          {tokenAmount(con(s, "CabalGate.ORACLE_FEE"), s, true)} oracle fee is
          not refunded. The seller may plead again at once.
        </p>
      </>
    );
  if (state === "UPHELD")
    return (
      <p>
        No further appeal. The{" "}
        {span(Number(con(s, "CabalGate.COOLDOWN")), "adj")} cooldown ran from
        this verdict, until {clock(end)}.
      </p>
    );
  if (appealId)
    return (
      <p>
        Appealed as <a href={`#/p/${appealId}`}>plea #{String(appealId)}</a>.
      </p>
    );
  if (now > end) return <p>The appeal window closed at {clock(end)}.</p>;
  return <p>The seller may appeal once, until {clock(end)}.</p>;
}
function priceFee(s: any, value: bigint) {
  const rate =
    10000n -
    BigInt(con(s, "PleaHook.IMD_FEE_BPS")) -
    BigInt(con(s, "PleaHook.PLEA_BURN_BPS"));
  return (
    (value * Q96 * 10000n) / BigInt(val(s, "PleaHook.latestPrice") || 1n) / rate
  );
}
