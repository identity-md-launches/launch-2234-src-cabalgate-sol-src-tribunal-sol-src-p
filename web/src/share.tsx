import { useLayoutEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useApp, useRead } from "./context";
import {
  amount,
  read,
  con,
  getPlea,
  short,
  tokenAmount,
  pleaState,
  objectionLine,
  clock,
  soldFor,
  seasonState,
  type Plea,
} from "./chain";
import { Empty, Icon, Panel, Stamp, Title } from "./components";
export function ShareCard({ p }: { p?: Plea }) {
  const { s, r, now } = useApp();
  const extra = useRead(
    async () => {
      if (!p || !p.verdictAt) return undefined;
      const season =
          (p.verdictAt - BigInt(s!.v["CabalGate.startedAt"])) /
          BigInt(con(s, "Seasons.SEASON")),
        top = await read(r, "Seasons", "topOf", [season]),
        original = p.isAppeal
          ? await read(r, "CabalGate", "getPlea", [p.originalId])
          : undefined;
      return {
        season,
        rank: top.findIndex(
          (e: any) => e.wallet.toLowerCase() === p.seller.toLowerCase(),
        ),
        original,
      };
    },
    [p?.id.toString()],
    !!p && !!s && !!p.verdictAt,
  );
  const earnsPoints =
    !!p && [2, 4, 5].includes(p.status) && !p.excluded && !p.standing?.[1];
  const frame = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  useLayoutEffect(() => {
    if (!p) return;
    let alive = true;
    const check = () => {
      if (!alive || !frame.current) return;
      const card = frame.current.querySelector(".share-card")!,
        text = frame.current.querySelector(".share-card__text")!,
        top = frame.current.querySelector(".share-card__top")!,
        foot = frame.current.querySelector(".share-card__foot")!;
      const gap = parseFloat(getComputedStyle(card).rowGap);
      const available =
        foot.getBoundingClientRect().top -
        top.getBoundingClientRect().bottom -
        2 * gap;
      if (text.getBoundingClientRect().height > available + 0.5)
        setFit((v) => Math.min(v + 1, 3));
    };
    const observer = new ResizeObserver(check);
    observer.observe(frame.current!);
    document.fonts.ready.then(check);
    check();
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [p?.text, fit]);
  const objection =
    p?.objections?.find((o) => o.ruling === 2) ||
    p?.objections?.find((o) => o.ruling === 1) ||
    p?.objections?.at(-1);
  const sold = p?.status === 4;
  const latestObjection =
    p?.objections?.find((o) => o.ruling === 2) ||
    p?.objections?.find((o) => o.ruling === 1) ||
    p?.objections?.at(-1);
  const state =
    latestObjection && [1, 2, 3].includes(latestObjection.ruling)
      ? (
          { 1: "OBJECTION", 2: "SUSTAINED", 3: "OVERRULED" } as Record<
            number,
            string
          >
        )[latestObjection.ruling]
      : p && s
        ? pleaState(p, now, s)
        : "";
  const cardUrl = location.host + location.pathname + (p ? `#/p/${p.id}` : "");
  const dead = !!s?.v["CabalGate.diedAt"];
  return (
    <div
      className="share-frame"
      ref={frame}
      role="img"
      aria-label={
        p
          ? `Plea ${p.id}, ${state}, ${p.score} vs need ${p.need}, ${p.points || 0} points. ${cardUrl}`
          : "PLEA: buying is open, selling needs a plea."
      }
    >
      <article
        className={`share-card ${["NO VERDICT", "OVERTURNED"].includes(state) ? "share-card--wide-stamp" : ""}`}
        aria-label={p ? `Share card for plea ${p.id}` : "PLEA link card"}
      >
        <div className="share-card__top">
          <span className="logo">PLEA</span>
          {p && (
            <span className="share-card__who">
              <span className={!p.name ? "mono" : ""}>
                {p.name || short(p.seller)}
              </span>
              {!!(p.flags & 1) && (
                <span className="badge badge--letter">
                  <Icon name="envelope-simple" />
                  BY LETTER
                </span>
              )}
              {p.isAppeal && (
                <span className="badge">APPEAL OF #{String(p.originalId)}</span>
              )}
              {p.seat && <span className="badge badge--seat">SEAT ×1.2</span>}
            </span>
          )}
          <span className={p ? "share-card__id" : ""}>
            {p ? `Plea #${p.id}` : "The Cabal is in session."}
          </span>
        </div>
        {p ? (
          <>
            <p
              className={`share-card__text ${window.PleaText.byteLength(p.text) > 160 || fit > 0 ? "is-long" : ""} ${fit === 2 ? "is-dense" : fit >= 3 ? "is-dense-more" : ""}`}
            >
              “{p.text}”
            </p>
            <div className="share-card__stamp share-card__stamp--pair">
              <Stamp p={p} staticTime />
              {objection ? (
                <span className="share-card__objection">
                  <span className="stamp stamp--sm stamp--objection">
                    {objection.ruling === 1
                      ? `OBJECTION #${objection.id}`
                      : ["", "", "SUSTAINED", "OVERRULED", "VOID"][
                          objection.ruling
                        ]}
                  </span>
                  <span>{objectionLine(objection, p)}</span>
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="share-card__stamp share-card__stamp--pair">
              <span className="stamp stamp--approved">APPROVED</span>
              <span className="stamp stamp--denied">DENIED</span>
            </div>
            <h2 className="share-card__title">
              Buying is open.
              <br />
              Selling needs
              <br />a plea.
            </h2>
          </>
        )}
        <div className="share-card__foot">
          <div className="share-card__nums">
            {p ? (
              <>
                {state === "PENDING" ? (
                  <>
                    <div>
                      <b>{p.need}</b>
                      <span>need</span>
                    </div>
                    <div>
                      <b>{amount(p.amount)}</b>
                      <span>
                        PLEA ·{" "}
                        {p.balance
                          ? `${Number((p.amount * 10000n) / p.balance) / 100}% of the bag`
                          : "waiting for the judges"}
                      </span>
                    </div>
                  </>
                ) : state === "NO VERDICT" ? (
                  <>
                    <div>
                      <b>
                        {p.failure?.agreed || 0} of {p.failure?.answered || 0}
                      </b>
                      <span>
                        judges agreed · {String(con(s, "CabalGate.QUORUM"))}{" "}
                        needed
                      </span>
                    </div>
                    <div>
                      <b>No cooldown</b>
                      <span>no points</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <b>{p.score}</b>
                      <span>score</span>
                    </div>
                    <div>
                      <b>{p.need}</b>
                      <span>need</span>
                    </div>
                    <div>
                      <b>{earnsPoints ? `+${p.points || 0}` : "No"}</b>
                      <span>
                        {earnsPoints
                          ? `points${p.standing?.[0] ? " held" : ""}`
                          : "points"}
                      </span>
                    </div>
                    {earnsPoints && extra.data && extra.data.rank >= 0 && (
                      <div>
                        <b>#{extra.data.rank + 1}</b>
                        <span>season {String(extra.data.season + 1n)}</span>
                      </div>
                    )}
                    {sold && (
                      <div>
                        <b>{amount(soldFor(p, s!), 18, 2)}</b>
                        <span>{s?.constants.pairSymbol} to the writer</span>
                      </div>
                    )}
                    {state === "DENIED" && (
                      <div>
                        <b>
                          {p.appealed
                            ? "Appealed"
                            : now <=
                                  Number(p.verdictAt) +
                                    Number(con(s, "CabalGate.COOLDOWN")) &&
                                !dead
                              ? "Open"
                              : "Closed"}
                        </b>
                        <span>
                          {p.appealed
                            ? `in #${s?.logs.find((l) => l.eventName === "PleaSubmitted" && l.args.originalId === p.id)?.args.id || "…"}`
                            : `appeal until ${clock(Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN")))}`}
                        </span>
                      </div>
                    )}
                    {state === "UPHELD" && (
                      <div>
                        <b>Final</b>
                        <span>
                          no further appeal · first score{" "}
                          {extra.data?.original?.score ?? "reading"}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div>
                  <b>{String(con(s, "CabalGate.PANEL_SIZE"))}</b>
                  <span>judges</span>
                </div>
                <div>
                  <b>0–{String(con(s, "CabalGate.MAX_PLEA_SCORE"))}</b>
                  <span>score</span>
                </div>
                <div>
                  <b>{Number(con(s, "CabalGate.EXECUTE_WINDOW")) / 60} min</b>
                  <span>to sell</span>
                </div>
              </>
            )}
          </div>
          <div className="share-card__url">
            <span>{cardUrl}</span>
          </div>
        </div>
      </article>
    </div>
  );
}
export function Share({
  id,
  embedded = false,
}: {
  id?: string;
  embedded?: boolean;
}) {
  const { s, r, toast, now } = useApp();
  const { address } = useAccount();
  const found = s?.pleas.find((p) => String(p.id) === id);
  const query = useRead(
    () => getPlea(r, BigInt(id!), s?.logs),
    [id],
    !!s &&
      !!id &&
      /^\d+$/.test(id) &&
      BigInt(id) > 0n &&
      BigInt(id) < s.v["CabalGate.nextId"] &&
      !found,
  );
  const p = found || query.data;
  const node = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const url = location.href.split("#")[0] + (p ? `#/p/${p.id}` : "#/");
  const latestObjection =
    p?.objections?.find((o) => o.ruling === 2) ||
    p?.objections?.find((o) => o.ruling === 1) ||
    p?.objections?.at(-1);
  const state =
    latestObjection && [1, 2, 3].includes(latestObjection.ruling)
      ? (
          { 1: "OBJECTION", 2: "SUSTAINED", 3: "OVERRULED" } as Record<
            number,
            string
          >
        )[latestObjection.ruling]
      : p && s
        ? pleaState(p, now, s)
        : "";
  const subject = p
    ? address?.toLowerCase() === p.seller.toLowerCase()
      ? "my plea"
      : `plea #${p.id} by ${p.name || short(p.seller)}`
    : "PLEA";
  const ending = s?.v["CabalGate.diedAt"]
    ? "The Cabal is dead; PLEA trades freely:"
    : "Plead your case:";
  const statusText = p
    ? state === "PENDING"
      ? `PENDING: the Cabal is judging ${subject}; need ${p.need}.`
      : state === "NO VERDICT"
        ? `NO VERDICT on ${subject}; ${p.failure?.answered ? `${p.failure.agreed} of ${p.failure.answered} agreed (${con(s, "CabalGate.QUORUM")} needed)` : "no answer"}. No cooldown.`
        : `${state}: ${subject}, ${latestObjection && [2, 3].includes(latestObjection.ruling) ? latestObjection.newScore : p.score} vs need ${p.need}.${p.status === 4 ? ` Sold for ${tokenAmount(soldFor(p, s!), s, true)}.` : state === "UPHELD" ? " No further appeal." : state === "SUSTAINED" ? " No points; the sale stands." : state === "DENIED" && !p.appealed ? ` Appeal until ${clock(Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN")))}.` : ""}`
    : "Buying is open. Selling needs a plea.";
  let quote =
    p?.text
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.slice(0, 2)
      .join("")
      .trim() ||
    p?.text ||
    "";
  const budget = 280 - 23 - statusText.length - ending.length - 7;
  if (quote.length > budget)
    quote =
      (quote.match(/[^.!?]+[.!?]/)?.[0] || quote)
        .slice(0, Math.max(0, budget - 1))
        .trim() + "…";
  const text = `${statusText}${quote ? ` “${quote}”` : ""} ${ending}`;
  async function image(kind: "download" | "copy") {
    setBusy(kind);
    setError("");
    try {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (!node.current) throw Error("Card unavailable");
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(node.current, {
        width: 1200,
        height: 675,
        pixelRatio: 1,
        cacheBust: false,
        style: { position: "static", left: "0", top: "0", width: "1200px" },
        skipAutoScale: true,
      });
      if (!blob) throw Error("No image");
      if (kind === "copy") {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
          throw Error(
            "Image clipboard is not supported here. Use Download image instead.",
          );
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        toast?.({
          kind: "info",
          text: "Image copied.",
          body: "Paste it into your post on X. The verdict is on your clipboard now.",
        });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = p ? `plea-${p.id}.png` : "plea.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast?.({
          kind: "info",
          text: `Saved ${a.download}.`,
          body: "1200 × 675. Attach it to your post on X.",
        });
      }
    } catch {
      const text =
        kind === "copy"
          ? "This browser can’t copy images."
          : "The image could not be drawn.";
      const body =
        kind === "copy"
          ? "Use Download image, then attach the file to your post."
          : "Try drawing it again after the fonts load.";
      setError(text + " " + body);
      toast?.({ kind: "bad", text, body });
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="stack stack--lg share-workbench">
      {!embedded && (
        <Title title={p ? `Share plea #${p.id}` : "Share PLEA"}>
          A 1200 × 675 PNG, drawn here in your browser from the share-card
          component. Attach it to your post.
        </Title>
      )}
      {id && !p && query.loading ? (
        <p>Reading this plea…</p>
      ) : id &&
        !p &&
        (query.error ||
          (!!s &&
            (!/^\d+$/.test(id) ||
              BigInt(id || "0") <= 0n ||
              BigInt(id || "0") >= s.v["CabalGate.nextId"]))) ? (
        <Empty
          title={`No plea #${id} yet`}
          action={{ href: "#/wall", label: "See the Wall" }}
        >
          Check the plea number.{" "}
          {s?.v["PleaHook.seeded"]
            ? `${Number(s.v["CabalGate.nextId"]) - 1} pleas so far.`
            : "The first plea comes after trading opens."}
        </Empty>
      ) : (
        <>
          <ShareCard key={String(p?.id || "default")} p={p} />
          <div className="share-export" aria-hidden="true" ref={node}>
            <ShareCard key={String(p?.id || "default")} p={p} />
          </div>
          <div className="btn-row">
            <a
              className="btn btn--sm"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="x-logo" />
              Share on X
              <span className="sr-only">
                {p ? ` of plea #${p.id}` : " of the default card"}
              </span>
            </a>
            <button
              className="btn btn--sm"
              disabled={!!busy}
              onClick={() => image("download")}
            >
              <Icon name="arrow-down" />
              {busy === "download" ? "Drawing image…" : "Download image"}
              <span className="sr-only">
                {p ? ` of plea #${p.id}` : " of the default card"}
              </span>
            </button>
            <button
              className="btn btn--sm"
              disabled={!!busy}
              onClick={() => image("copy")}
            >
              <Icon name="copy" />
              {busy === "copy" ? "Copying image…" : "Copy image"}
              <span className="sr-only">
                {p ? ` of plea #${p.id}` : " of the default card"}
              </span>
            </button>
          </div>
          {error && (
            <p className="bad-text" role="alert">
              {error}
            </p>
          )}
          <Panel title="Post text (Share on X fills it in)">
            <p className="chain-text">{text}</p>
            <p className="mono addr__text">{url}</p>
            <p className="small">
              Attach the image: the link alone shows the default card.
            </p>
          </Panel>
        </>
      )}
      {!embedded && s?.pleas.length ? (
        <Panel title="Share another plea">
          <div className="cluster">
            {s.pleas.map((p) => (
              <a
                className="btn btn--sm"
                key={String(p.id)}
                href={`#/share/${p.id}`}
              >
                Plea #{String(p.id)}
              </a>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
