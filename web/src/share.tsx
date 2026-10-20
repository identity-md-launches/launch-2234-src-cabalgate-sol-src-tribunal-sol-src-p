import { useLayoutEffect, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { useApp, useRead } from "./context";
import { amount, con, getPlea, short, tokenAmount, type Plea } from "./chain";
import { Empty, Icon, Panel, Stamp, Title } from "./components";
export function ShareCard({ p }: { p?: Plea }) {
  const { s, r } = useApp();
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
  const dead = !!s?.v["CabalGate.diedAt"];
  return (
    <div className="share-frame" ref={frame}>
      <article
        className={`share-card ${p ? "share-card--wide-stamp" : ""}`}
        aria-label={p ? `Share card for plea ${p.id}` : "PLEA link card"}
      >
        <div className="share-card__top">
          <span className="logo">PLEA</span>
          {p && (
            <span className="share-card__who">
              {p.name || short(p.seller)}
              {p.seat && <span className="badge badge--seat">SEAT ×1.2</span>}
            </span>
          )}
          <span className="share-card__id">
            {p ? `#${p.id}` : "Sepolia · run 9"}
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
                  <span>
                    {objection.ruling === 1
                      ? "pending"
                      : `#${objection.id}: ${objection.newScore} vs need ${p.need}`}
                  </span>
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <h2 className="share-card__title">
            Buying is open.
            <br />
            Selling needs a plea.
          </h2>
        )}
        <div className="share-card__foot">
          <div className="share-card__nums">
            {p ? (
              <>
                <div>
                  <b>{amount(p.amount, s?.constants.decimals)}</b>
                  <span>
                    {s?.constants.symbol || "PLEA"}{" "}
                    {sold ? "sold" : "asks to sell"}
                  </span>
                </div>
                <div>
                  <b>
                    {earnsPoints
                      ? p.points || 0
                      : p.status === 1
                        ? `Need ${p.need}`
                        : "0"}
                  </b>
                  <span>
                    {earnsPoints
                      ? `points ${p.recorded ? "recorded" : p.standing?.[0] ? "held" : "once recorded"}`
                      : p.status === 1
                        ? "waiting for a score"
                        : "no points"}
                  </span>
                </div>
              </>
            ) : (
              <div>
                <b>Make your case.</b>
                <span>Test tokens, no value.</span>
              </div>
            )}
          </div>
          <div className="share-card__url">
            <span>Sepolia · test tokens</span>
            <br />
            <span>
              {dead ? "The Cabal is dead. Trade freely." : "The Cabal decides."}
            </span>
          </div>
        </div>
      </article>
    </div>
  );
}
export function Share({ id }: { id?: string }) {
  const { s, r, toast } = useApp();
  const found = s?.pleas.find((p) => String(p.id) === id);
  const query = useRead(
    () => getPlea(r, BigInt(id!), s?.logs),
    [id],
    !!s && !!id && /^\d+$/.test(id) && !found,
  );
  const p = found || query.data;
  const node = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const url = location.href.split("#")[0] + (p ? `#/p/${p.id}` : "#/");
  const text = p
    ? `PLEA #${p.id}: “${p.text}” ${s?.v["CabalGate.diedAt"] ? "The Cabal is dead. PLEA trades freely." : "Make your case. The Cabal decides."}`
    : "Buying is open. Selling needs a plea.";
  async function image(kind: "download" | "copy") {
    setBusy(kind);
    setError("");
    try {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      if (!node.current) throw Error("Card unavailable");
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
        toast?.({ text: "Image copied. Paste it into your post." });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `plea-${p?.id || "link"}-${p?.status || "card"}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast?.({ text: "Image downloaded. Attach it to your post." });
      }
    } catch (e: any) {
      setError(
        e.message ||
          "The image could not be drawn. Try Download image in a supported browser.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="stack stack--lg share-workbench">
      <Title title={p ? `Share plea #${p.id}` : "Share PLEA"}>
        A 1200 × 675 PNG, drawn here in your browser from the share-card
        component. Attach it to your post.
      </Title>
      {id && !p && query.loading ? (
        <p>Reading this plea…</p>
      ) : id && !p && query.error ? (
        <Empty title="Plea not found">Check the plea number.</Empty>
      ) : (
        <>
          <ShareCard key={String(p?.id || "default")} p={p} />
          <div className="share-export" aria-hidden="true" ref={node}>
            <ShareCard key={String(p?.id || "default")} p={p} />
          </div>
          <div className="btn-row">
            <a
              className="btn btn--primary"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="share-network" />
              Share on X
            </a>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => image("download")}
            >
              <Icon name="download-simple" />
              {busy === "download" ? "Drawing image…" : "Download image"}
            </button>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => image("copy")}
            >
              <Icon name="copy" />
              {busy === "copy" ? "Copying image…" : "Copy image"}
            </button>
          </div>
          {error && (
            <p className="bad-text" role="alert">
              {error}
            </p>
          )}
          <Panel title="The post">
            <p>{text}</p>
            <p className="mono addr__text">{url}</p>
            <p className="small">
              X intent opens the text and link. Attach the downloaded PNG
              yourself; a static site cannot upload media into X.
            </p>
          </Panel>
        </>
      )}
      {s?.pleas.length ? (
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
