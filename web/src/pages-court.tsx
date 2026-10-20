import { appealPreview } from "./appeal";
import { PleaTimeline } from "./details";
import { oracleRequest } from "./oracle";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useApp, useRead, useTx } from "./context";
import {
  amount,
  con,
  duration,
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
import { parseAmount, WalletBalances } from "./pages-trade";
export function Wall() {
  const { r, s, error, refresh, now } = useApp();
  const { address } = useAccount();
  const [filter, setFilter] = useState("All");
  const [byLetter, setByLetter] = useState(false);
  const [mine, setMine] = useState(false);
  const [objected, setObjected] = useState(false);
  const [older, setOlder] = useState<Plea[]>([]);
  const [busy, setBusy] = useState(false);
  const [olderError, setOlderError] = useState("");
  const walletFilter = new URLSearchParams(location.hash.split("?")[1]).get(
    "wallet",
  );
  const all = [...(s?.pleas || []), ...older].filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
  );
  const shown = all.filter(
    (p) =>
      (filter === "All" || pleaState(p, now, s!) === filter) &&
      (byLetter ? (p.flags & 1) > 0 : true) &&
      (mine ? p.seller.toLowerCase() === address?.toLowerCase() : true) &&
      (objected ? !!p.objections?.length : true) &&
      (!walletFilter || p.seller.toLowerCase() === walletFilter.toLowerCase()),
  );
  async function loadMore() {
    setBusy(true);
    setOlderError("");
    try {
      const last = all.at(-1)?.id;
      if (!last || last <= 1n) return;
      const next = await Promise.all(
        Array.from({ length: Math.min(24, Number(last - 1n)) }, (_, i) =>
          getPlea(r, last - 1n - BigInt(i), s?.logs),
        ),
      );
      setOlder((a) => [...a, ...next]);
    } catch {
      setOlderError("Older pleas could not be read. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack stack--lg">
      <Title title="The Wall">
        Every plea, every verdict. Times are when each plea was sent.
      </Title>
      {val(s, "CabalGate.diedAt") > 0n && (
        <p className="lead">
          The Cabal is dead. The case file stays open to read.
        </p>
      )}
      <div className="chips" role="group" aria-label="Filter pleas">
        {[
          "All",
          "APPROVED",
          "DENIED",
          "PENDING",
          "SOLD",
          "NO VERDICT",
          "LAPSED",
        ].map((f) => (
          <button
            className="chip"
            key={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "All" ? f : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <details>
        <summary className="link-btn">More filters</summary>
        <div className="cluster form-actions-top">
          <label className="cluster">
            <input
              className="box"
              type="checkbox"
              checked={byLetter}
              onChange={(e) => setByLetter(e.target.checked)}
            />
            By letter
          </label>
          <label className="cluster">
            <input
              className="box"
              type="checkbox"
              checked={objected}
              onChange={(e) => setObjected(e.target.checked)}
            />
            Objected
          </label>
          <label className="cluster">
            <input
              className="box"
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
            />
            Mine
          </label>
        </div>
      </details>
      {!address && mine && <p>Connect in the top bar to filter your pleas.</p>}
      <p className="meta" role="status">
        {shown.length} pleas loaded
        {walletFilter ? ` for ${short(walletFilter)}` : ""}
        {byLetter ? " · by letter" : ""}
      </p>
      {error ? (
        <div className="error-box">
          <p className="error-box__title">Cannot read the Wall</p>
          <p>{error}</p>
          <button className="btn" onClick={refresh}>
            Try again
          </button>
        </div>
      ) : !s ? (
        <div className="wall-grid" aria-busy="true">
          {[1, 2, 3].map((x) => (
            <div className="card skeleton" key={x}>
              <p>Reading pleas…</p>
              <span className="skeleton__block" />
              <span className="skeleton__line" />
            </div>
          ))}
        </div>
      ) : shown.length ? (
        <div className="wall-grid">
          {shown.map((p) => (
            <PleaCard p={p} key={String(p.id)} />
          ))}
        </div>
      ) : (
        <Empty title={filter === "All" ? "No pleas yet" : "No matching pleas"}>
          {filter === "All"
            ? "The first plea will be on the record when trading opens."
            : "Try another filter. The record has no matching pleas in the loaded pages."}
        </Empty>
      )}
      {olderError && (
        <p className="bad-text" role="alert">
          {olderError}
        </p>
      )}
      {all.at(-1)?.id! > 1n ? (
        <button className="btn" disabled={busy} onClick={loadMore}>
          {busy ? "Reading older pleas…" : "Load older pleas"}
        </button>
      ) : (
        <p className="meta">
          {s ? "The whole record, from the first plea." : ""}
        </p>
      )}
      {!val(s, "CabalGate.diedAt") && (
        <div>
          <a className="btn" href="#/plead">
            Write a plea <Icon name="arrow-right" />
          </a>
        </div>
      )}
    </div>
  );
}
export function Appeal({ p }: { p: Plea }) {
  const { r, s, now } = useApp();
  const { address } = useAccount();
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
      <AmountInput
        id={`appeal-${p.id}`}
        label="Appeal amount"
        value={
          auto
            ? formatUnits(
                preview.data?.amount || p.amount,
                s?.constants.decimals || 18,
              )
            : input
        }
        onChange={auto ? undefined : setInput}
        unit={s?.constants.symbol || "PLEA"}
        hint="Automatic appeals use the contract’s original-share clamp and fee floor; their amount is read-only. Turn auto-sell off to choose a manual amount."
      />
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
        />
        <span className="toggle-card__title" id="appeal-auto-title">
          Sell automatically if approved
        </span>
      </label>
      <Costs
        rows={[
          ["Oracle fee", tokenAmount(con(s, "CabalGate.ORACLE_FEE"), s, true)],
          [
            "To the buy wall",
            tokenAmount(con(s, "CabalGate.APPEAL_POOL_SHARE"), s, true),
          ],
          [
            "Automatic total, paid in PLEA",
            tokenAmount(s?.v.appealFees?.[0], s, true),
          ],
          ["Manual total", tokenAmount(fee, s, true)],
        ]}
      />
      {auto ? (
        <Action
          {...tx}
          label="Submit appeal"
          onRun={() => tx.send("Letterbox", "appealAuto", [p.id, text])}
          disabled={
            !tx.ready ||
            closed ||
            !textCheck("plea", text).ok ||
            need === undefined ||
            need > Number(con(s, "CabalGate.MAX_PLEA_SCORE"))
          }
          reason={
            closed
              ? "This appeal window is closed."
              : need && need > Number(con(s, "CabalGate.MAX_PLEA_SCORE"))
                ? "This plea cannot pass. Try a smaller amount or wait for your facts to improve."
                : undefined
          }
        />
      ) : (
        <ApprovedAction
          name="CabalGate"
          fn="appeal"
          args={[p.id, raw, text]}
          label="Submit appeal"
          token={r.addresses.PairToken}
          spender={r.addresses.CabalGate}
          spend={fee}
          disabled={
            closed ||
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
            closed
              ? "This appeal window is closed."
              : raw > p.amount
                ? "An appeal cannot increase the original amount."
                : undefined
          }
        />
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
    !!s && number > 0n,
  );
  let p = s?.pleas.find((p) => p.id === number) || query.data;
  const [minInput, setMinInput] = useState("");
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
        <Title title={`Plea #${id}`} />
        {query.loading ? (
          <p>Reading the case…</p>
        ) : (
          <Empty title="Plea not found">
            {query.error || "Check the plea number in this link."}
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
  const price = val(s, "PleaHook.latestPrice") || 0n;
  const net =
    (((p.amount * price) / 2n ** 96n) *
      BigInt(
        10000 -
          Number(con(s, "PleaHook.IMD_FEE_BPS")) -
          Number(con(s, "PleaHook.PLEA_BURN_BPS")),
      )) /
    10000n;
  const minOut = minInput
    ? parseAmount(minInput, s.constants.pairDecimals)
    : (net * 99n) / 100n;
  const canSell = p.status === 2 && now < sellUntil;
  const auto = (p.flags & 2) > 0;
  const held = !p.excluded && (p.standing?.[0] || now <= objectionUntil);
  const settled = p.escrow && !p.escrow[1];
  return (
    <div className="stack stack--lg">
      <nav aria-label="Breadcrumb" className="meta">
        <a href="#/wall">Wall</a> / Plea #{id}
      </nav>
      <Title title={`Plea #${id}`}>
        {state === "PENDING"
          ? "Waiting for the Cabal."
          : state === "NO VERDICT"
            ? "No verdict returned. There is no cooldown and the oracle fee is spent."
            : `${state}. ${p.score} vs need ${p.need}.`}
        {approved && !p.recorded
          ? " Points wait for objections to end; nothing records them by itself."
          : ""}
      </Title>
      <div className="split split--even status">
        <div className="stack status__plea">
          <PleaCard p={p} detail />
          <PleaTimeline p={p} />
          <Panel title="The score">
            <Meter fact={p.factScore} need={p.need} score={p.score} />
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
                <p className="small">
                  {oracle.data.panelSize || "Panel"} judges ·{" "}
                  {oracle.data.attestation?.agreed ??
                    oracle.data.agreement?.agreed ??
                    "Agreement pending"}{" "}
                  agreed · {oracle.data.status}
                </p>
                <a
                  className="link-btn"
                  href={`${APP.oracleApi}/oracle/requests/${oracle.data.id}`}
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
                  label="Panel deadline"
                />
                <p>
                  Nothing to sell until the Cabal approves. The site checks for
                  a verdict automatically.
                </p>
              </>
            ) : canSell ? (
              <>
                <Countdown
                  until={sellUntil}
                  label="Sell within"
                  urgent={!!mine}
                />
                {auto ? (
                  <>
                    <p>
                      PLEA is escrowed in the Letterbox. Anyone can deliver; the
                      sale goes to the writer. The runner earns the tip.
                    </p>
                    <Action
                      {...tx}
                      label={mine ? "Sell yourself" : "Deliver approved sale"}
                      onRun={() => tx.send("Letterbox", "deliver", [p!.id])}
                      disabled={!tx.ready}
                    />
                  </>
                ) : mine ? (
                  <>
                    <AmountInput
                      id="sale-min"
                      label="Minimum you receive"
                      unit={s.constants.pairSymbol}
                      value={
                        minInput ||
                        formatUnits(minOut, s.constants.pairDecimals)
                      }
                      onChange={setMinInput}
                      hint="Defaults to 99% of the hourly snapshot estimate after fees. This is an on-chain minimum; the sale reverts if it cannot meet it."
                    />
                    <ApprovedAction
                      name="CabalGate"
                      fn="executeSell"
                      args={[minOut]}
                      label="Sell now"
                      token={r.addresses.PLEA}
                      spender={r.addresses.CabalGate}
                      spend={p.amount}
                      disabled={minOut <= 0n}
                    />
                  </>
                ) : (
                  <p>
                    Only the seller can execute this manual plea. Connect in the
                    top bar if it is yours.
                  </p>
                )}
              </>
            ) : (
              <p>
                {state === "SOLD"
                  ? `Sold. ${tokenAmount(p.escrow?.[3] || s.logs.find((l) => l.eventName === "SellExecuted" && l.args.id === p!.id)?.args.imdOut, s, true)} paid to the seller.`
                  : state === "LAPSED"
                    ? "The sell window closed. The approval can still earn season points."
                    : state === "DENIED" || state === "UPHELD"
                      ? "The Cabal denied this plea. The seller may have one appeal."
                      : "No sale is available for this plea."}
              </p>
            )}
            {p.status === 1 && state === "NO VERDICT" && (
              <TxButton
                label="Expire unanswered plea"
                name="CabalGate"
                fn="expire"
                args={[p.id]}
              />
            )}{" "}
            {p.status === 2 && state === "LAPSED" && (
              <TxButton
                label="Mark plea lapsed"
                name="CabalGate"
                fn="expire"
                args={[p.id]}
              />
            )}{" "}
            {auto && p.escrow?.[1] && !canSell && p.status !== 1 && (
              <TxButton
                label="Return escrow and tip"
                name="Letterbox"
                fn="settle"
                args={[p.id]}
              />
            )}
          </Panel>
          {approved && (
            <Panel title="Your points">
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
          {(state === "DENIED" || state === "UPHELD") && mine && (
            <Appeal p={p} />
          )}
          <Panel title="Objections">
            <p>The sale stands. Objections can only reduce season points.</p>
            <a className="btn" href={`#/objections?plea=${p.id}`}>
              Open the case
            </a>
          </Panel>
        </div>
      </div>
    </div>
  );
}
import { APP } from "./config";
export function ObjectionForm({ p }: { p: Plea }) {
  const { r, s, now } = useApp();
  const { address } = useAccount();
  const [text, setText] = useState("");
  const caseInfo = useRead(
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
  );
  const c = caseInfo.data?.c;
  const pending = c ? c.pending.filter((id: bigint) => id !== 0n).length : 0;
  const full =
    c && c.count + pending >= Number(con(s, "Tribunal.MAX_OBJECTIONS"));
  const own = address?.toLowerCase() === p.seller.toLowerCase();
  const same = p.objections?.some(
    (o) =>
      o.objector.toLowerCase() === address?.toLowerCase() && o.ruling !== 4,
  );
  const until =
    Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW"));
  const closed =
    !val(s, "CabalGate.cabalAlive") ||
    now > until ||
    p.recorded ||
    c?.sustained;
  const cost =
    (con(s, "Tribunal.ORACLE_FEE") || 0n) + (con(s, "Tribunal.STAKE") || 0n);
  const reason = closed
    ? "This case is closed."
    : own
      ? "You cannot object to your own plea."
      : same
        ? "You have already objected to this plea."
        : full
          ? "Both objection slots are occupied."
          : caseInfo.data?.excluded || caseInfo.data?.sellerExcluded
            ? "This wallet or seller is excluded from seasons."
            : !textCheck("objection", text).ok
              ? "Write a valid objection before paying."
              : undefined;
  return (
    <Panel card title={`Object to plea #${p.id}`}>
      <PleaCard p={p} />
      <Countdown until={until} label="Objections close in" />
      <TextBox
        kind="objection"
        label="Your objection"
        value={text}
        onChange={setText}
      />
      <p className="small">
        Say what the first panel missed in the text. Sustained only if the new
        score is more than {String(con(s, "Tribunal.MARGIN"))} below need{" "}
        {p.need}. The sale is never touched.
      </p>
      <Costs
        rows={[
          ["Oracle fee", tokenAmount(con(s, "Tribunal.ORACLE_FEE"), s, true)],
          ["Stake", tokenAmount(con(s, "Tribunal.STAKE"), s, true)],
          ["Total", tokenAmount(cost, s, true)],
        ]}
      />
      <ApprovedAction
        name="Tribunal"
        fn="object"
        args={[p.id, text]}
        label="Object"
        token={r.addresses.PairToken}
        spender={r.addresses.Tribunal}
        spend={cost}
        disabled={!!reason || caseInfo.loading || !caseInfo.data}
        reason={reason}
      />
    </Panel>
  );
}
export function Objections() {
  const { s, now, r } = useApp();
  const specific = new URLSearchParams(location.hash.split("?")[1]).get("plea");
  const requested = useRead(
    () => getPlea(r, BigInt(specific!), s?.logs),
    [specific],
    !!s && !!specific && /^\d+$/.test(specific),
  );
  const open =
    s?.pleas.filter(
      (p) =>
        [2, 4, 5].includes(p.status) &&
        now <=
          Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW")),
    ) || [];
  const selected =
    s?.pleas.find((p) => String(p.id) === specific) || requested.data;
  const list = specific ? (selected ? [selected] : []) : open;
  const objections = s?.pleas.flatMap((p) => p.objections || []) || [];
  return (
    <div className="stack stack--lg">
      <Title title="Objection!">
        Think the score was too generous? A fresh panel re-scores the plea. Its
        points can only fall; the sale stands.
      </Title>
      <section className="section">
        <div className="section__head">
          <h2>Open now</h2>
          <p className="meta">
            Up to {String(con(s, "Tribunal.MAX_OBJECTIONS") || "—")} objections
            per plea
          </p>
        </div>
        {s && !val(s, "CabalGate.cabalAlive") ? (
          <Empty
            title={
              val(s, "PleaHook.seeded")
                ? "The Cabal is dead"
                : "The court has not opened"
            }
          >
            New objections are closed.
          </Empty>
        ) : list.length ? (
          <div className="auto-grid">
            {list.map((p) => (
              <ObjectionForm p={p} key={String(p.id)} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing open">
            No approved plea is inside its objection window.
          </Empty>
        )}
      </section>
      <section className="section">
        <div className="section__head">
          <h2>Recent rulings</h2>
        </div>
        {objections.length ? (
          <div className="auto-grid">
            {objections
              .sort((a, b) => Number(b.id - a.id))
              .map((o) => (
                <Panel title={`Objection #${o.id}`} key={String(o.id)}>
                  <div>
                    <span className="stamp stamp--sm stamp--objection">
                      {
                        ["", "OBJECTION", "SUSTAINED", "OVERRULED", "VOID"][
                          o.ruling
                        ]
                      }
                    </span>
                  </div>
                  <p className="plea__text">“{o.text}”</p>
                  <p>
                    By {short(o.objector)} · plea #{String(o.pleaId)} ·{" "}
                    {o.ruling === 1 ? "pending" : `new score ${o.newScore}`}
                  </p>
                  {o.ruling === 1 &&
                    now >=
                      Number(o.filedAt) +
                        Number(con(s, "Tribunal.PENDING_EXPIRY")) && (
                      <TxButton
                        label="Expire unanswered objection"
                        name="Tribunal"
                        fn="expire"
                        args={[o.id]}
                      />
                    )}{" "}
                  {o.ruling > 1 && !o.settled && (
                    <TxButton
                      label="Settle objection stake"
                      name="Tribunal"
                      fn="settle"
                      args={[o.id]}
                    />
                  )}
                  <a className="link-btn" href={`#/p/${o.pleaId}`}>
                    Open plea #{String(o.pleaId)}
                  </a>
                </Panel>
              ))}
          </div>
        ) : (
          <Empty title="No rulings yet">
            The Tribunal has not ruled on an objection in this test run.
          </Empty>
        )}
      </section>
      <Panel title="How a ruling works">
        <p>
          Other eligible wallets have{" "}
          {duration(Number(con(s, "Tribunal.OBJECTION_WINDOW") || 0))} after
          approval to object. A sustained objection removes the plea’s season
          points and returns the stake. An overruled objection sends the stake
          to the season prize pot. No verdict returns the stake; the oracle fee
          is spent.
        </p>
      </Panel>
    </div>
  );
}
export function Seasons() {
  const { s, r, now } = useApp();
  const { address } = useAccount();
  const live = val(s, "Seasons.currentSeason");
  const season = live?.[1] as bigint | undefined;
  const bounds = val(s, "bounds") || s?.v.bounds;
  const pot = val(s, "Seasons.pot") as bigint | undefined;
  const top = (s?.v.top || []).filter(
    (e: any) => e.wallet !== "0x" + "0".repeat(40),
  );
  const standing = useRead(
    async () => {
      const [best, seat] = await Promise.all([
        read(r, "Seasons", "bestOf", [season, address]),
        read(r, "Seasons", "holdsSeat", [address]),
      ]);
      return { best, seat };
    },
    [address, season?.toString()],
    !!address && !!s,
  );
  const rowDetails = useRead(
    async () =>
      Promise.all(
        top.map(async (e: any) => ({
          ...e,
          name: await read(r, "Letterbox", "nameOf", [e.wallet]),
          best: await read(r, "Seasons", "bestOf", [season, e.wallet]),
          seat: await read(r, "Seasons", "holdsSeat", [e.wallet]),
          excluded: await read(r, "Seasons", "excluded", [e.wallet]),
        })),
      ),
    [
      top.map((e: any) => `${e.wallet}:${e.points}`).join(","),
      season?.toString(),
    ],
    !!s && top.length > 0,
  );
  const next = val(s, "Seasons.nextToClose");
  const grace = Number(con(s, "Seasons.CLOSE_GRACE") || 0);
  const closeAt = s?.v.bounds ? Number(s.v.bounds[2]) + grace : 0;
  const canClose =
    !s?.historyError && !!s?.v.bounds?.[0] && s.v.bounds[3] && now >= closeAt;
  const eligible =
    s?.pleas.filter(
      (p) => [2, 4, 5].includes(p.status) && !p.recorded && !p.excluded,
    ) || [];
  const bonus =
    season !== undefined &&
    season < BigInt(con(s, "Seasons.BONUS_SEASONS") || 0)
      ? con(s, "Seasons.BONUS_PER_SEASON")
      : 0n;
  return (
    <div className="stack stack--lg">
      <Title title="Seasons">
        Your best three approved pleas compete for the season prize pot. A seat
        earns ×{Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS") || 0) / 10000}{" "}
        points, rounded down.
      </Title>
      <div className="stats stats--4">
        {[
          ["Season", season !== undefined ? String(season + 1n) : "—"],
          ["Season prize pot", tokenAmount(pot, s, true)],
          ["PLEA bonus", tokenAmount(bonus, s)],
          [
            "Season length",
            s ? duration(Number(con(s, "Seasons.SEASON"))) : "—",
          ],
        ].map(([a, b]) => (
          <div className="stat" key={a}>
            <span className="stat__label">{a}</span>
            <span className="stat__value">{b}</span>
          </div>
        ))}
      </div>
      {live?.[0] ? (
        <Countdown until={Number(live[2])} label="Season ends in" />
      ) : (
        <Notice>
          <p>
            {val(s, "CabalGate.diedAt")
              ? "The Cabal is dead. No new season runs after its death. Close remaining seasons after their grace period."
              : "The first season begins when trading opens."}
          </p>
        </Notice>
      )}
      <div className="split">
        <Panel title="Your standing">
          {!address ? (
            <p>
              Connect in the top bar to see your standing. The leaderboard reads
              without a wallet.
            </p>
          ) : standing.data ? (
            <>
              <p className="stat__value">
                {standing.data.best.reduce(
                  (n: number, x: number) => n + Number(x),
                  0,
                )}{" "}
                points
              </p>
              <p>Best three: {standing.data.best.join(" · ")}</p>
              {standing.data.seat && (
                <p>
                  <span className="badge badge--seat">
                    SEAT ×
                    {Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) / 10000}
                  </span>
                </p>
              )}
              <p className="small">
                Points are calculated with Seasons.pointsFor and holdsSeat at
                record time. Only the best three pleas count. At least{" "}
                {String(con(s, "Seasons.MIN_POINTS"))} points are needed for a
                prize.
              </p>
            </>
          ) : (
            <p>Reading your standing…</p>
          )}
        </Panel>
        <Panel title="Points waiting to record">
          {eligible.length ? (
            eligible.map((p) => (
              <div className="stack stack--sm" key={String(p.id)}>
                <a href={`#/p/${p.id}`}>
                  Plea #{String(p.id)} · +{p.points} points{" "}
                  {p.standing?.[0] ? "held" : "once recorded"}
                </a>
                <TxButton
                  label="Record my points"
                  name="Seasons"
                  fn="record"
                  args={[p.id]}
                  disabled={p.standing?.[0] || p.standing?.[1]}
                  reason={
                    p.standing?.[0]
                      ? "Points are held while objections are open or a panel is pending."
                      : p.standing?.[1]
                        ? "An objection was sustained. No points."
                        : undefined
                  }
                />
              </div>
            ))
          ) : (
            <p>
              No unrecorded approvals in the latest cases. Nothing records
              points by itself; use a plea’s status page when its hold ends.
            </p>
          )}
        </Panel>
      </div>
      <section className="section">
        <div className="section__head">
          <h2>Leaderboard</h2>
          <p className="meta">
            Top {String(con(s, "Seasons.TOP") || "—")} ·{" "}
            {String(con(s, "Seasons.MIN_POINTS") || "—")} points to earn a prize
          </p>
        </div>
        {!top.length ? (
          <Empty title="A clean docket">
            No recorded pleas in this season yet.
          </Empty>
        ) : (
          <div className="panel panel--flush">
            <ol className="lb" aria-label="Season leaderboard">
              {(rowDetails.data || top).map((e: any, i: number) => {
                const share = s?.v.shares[i] || 0n;
                const qualifies =
                  e.excluded === false &&
                  Number(e.points) >= Number(con(s, "Seasons.MIN_POINTS"));
                return (
                  <li
                    key={e.wallet}
                    className={`lb__row ${address?.toLowerCase() === e.wallet.toLowerCase() ? "lb__row--you" : ""} ${!qualifies ? "lb__row--out" : ""}`}
                  >
                    <span className="lb__rank">
                      <span className="sr-only">Rank </span>
                      {i + 1}
                    </span>
                    <span className="lb__who">
                      <a href={`#/profile/${e.wallet}`}>
                        {e.name || short(e.wallet)}
                      </a>
                      {e.seat && (
                        <span className="badge badge--seat">SEAT ×1.2</span>
                      )}
                    </span>
                    <span className="lb__best">
                      <span className="lb__label">Best three </span>
                      {e.best?.join(" · ") || "Reading…"}
                    </span>
                    <span className="lb__pts">
                      <span className="lb__label">Points </span>
                      {e.points}
                    </span>
                    <span className="lb__prize">
                      <span className="lb__label">Prize now </span>
                      {e.excluded === undefined ? (
                        "Reading eligibility…"
                      ) : qualifies ? (
                        <>
                          {tokenAmount(
                            (pot! * BigInt(share)) / 10000n,
                            s,
                            true,
                          )}{" "}
                          + {tokenAmount((bonus * BigInt(share)) / 10000n, s)} (
                          {Number(share) / 100}%)
                        </>
                      ) : e.excluded ? (
                        "Excluded from prizes"
                      ) : (
                        "No prize below the point line"
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        <div className="split form-actions-top">
          <Panel title="Closing the season">
            <p>
              The close records eligible plea IDs, pays qualifying wallets using
              Seasons.shareBps, rolls unpaid paired tokens forward and burns the
              unpaid PLEA bonus. Each payout rounds down.
            </p>
            <TxButton
              label={`Close season ${next !== undefined ? String(next + 1n) : "—"}`}
              name="Seasons"
              fn="closeSeason"
              args={[
                s?.logs
                  .filter((l) => l.eventName === "PleaSubmitted")
                  .map((l) => l.args.id) || [],
              ]}
              disabled={!canClose}
              reason={
                canClose
                  ? "Anyone may close this season."
                  : closeAt
                    ? `Available from ${utc(closeAt)}, after ${duration(grace)} grace.`
                    : "No season has begun."
              }
            />
          </Panel>
          <Panel title="Bonus and leftovers">
            <p>
              The first {String(con(s, "Seasons.BONUS_SEASONS") || "—")} seasons
              offer {tokenAmount(con(s, "Seasons.BONUS_PER_SEASON"), s)} each.
              Rank shares come from the contract, and unearned bonus shares are
              burned.
            </p>
            <TxButton
              label="Send leftovers to buy wall"
              name="Seasons"
              fn="flushToWall"
              disabled={!val(s, "Seasons.finished")}
              reason="Available after the Cabal is dead and every season is closed."
            />
          </Panel>
        </div>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>Past seasons</h2>
        </div>
        {s?.logs.filter((l) => l.eventName === "SeasonClosedOut").length ? (
          s.logs
            .filter((l) => l.eventName === "SeasonClosedOut")
            .map((l) => (
              <Panel
                key={l.transactionHash + String(l.logIndex)}
                title={`Season ${Number(l.args.season) + 1}`}
              >
                <Costs
                  rows={[
                    ["Season prize pot", tokenAmount(l.args.pot, s, true)],
                    ["Paid", tokenAmount(l.args.paid, s, true)],
                  ]}
                />
                <a href={`${r.network.explorer}/tx/${l.transactionHash}`}>
                  View closing transaction
                </a>
              </Panel>
            ))
        ) : (
          <p className="text-2">No seasons have closed in this test run.</p>
        )}
      </section>
    </div>
  );
}
