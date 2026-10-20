import {
  useId,
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useAccount } from "wagmi";
import { encodeFunctionData, type Address } from "viem";
import { useApp, useRead, useTx } from "./context";
import {
  amount,
  con,
  duration,
  pleaState,
  read,
  short,
  tokenAmount,
  utc,
  type Plea,
  type Snapshot,
} from "./chain";
import { erc20Abi } from "./config";
declare global {
  interface Window {
    PleaText: any;
  }
}
export const Icon = ({ name }: { name: string }) => (
  <svg className="icon" aria-hidden="true">
    <use href={`#i-${name}`} />
  </svg>
);
export const Title = ({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) => (
  <div>
    <div className="page-title">
      <h1>{title}</h1>
    </div>
    {children && <p className="lead">{children}</p>}
  </div>
);
export const Panel = ({
  title,
  children,
  card = false,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  card?: boolean;
  className?: string;
}) => (
  <section className={`${card ? "card" : "panel"} stack ${className}`}>
    {title && <h2 className="card__title">{title}</h2>}
    {children}
  </section>
);
export const Notice = ({
  title,
  children,
  kind = "info",
}: {
  title?: string;
  children: ReactNode;
  kind?: string;
}) => (
  <div className={`notice notice--${kind}`}>
    <Icon name={kind === "bad" || kind === "warn" ? "warning" : "info"} />
    <div>
      {title && <p className="notice__title">{title}</p>}
      <div>{children}</div>
    </div>
  </div>
);
export const Empty = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className="empty">
    <span className="empty__icon">
      <Icon name="gavel" />
    </span>
    <p className="empty__title">{title}</p>
    <p>{children}</p>
  </div>
);
export const Costs = ({ rows }: { rows: [ReactNode, ReactNode][] }) => (
  <dl className="costs">
    {rows.map(([a, b], i) => (
      <div key={i}>
        <dt>{a}</dt>
        <dd>{b}</dd>
      </div>
    ))}
  </dl>
);
export function AddressView({
  address,
  label = "contract",
}: {
  address: string;
  label?: string;
}) {
  const { r, toast } = useApp();
  const [copied, setCopied] = useState(false);
  return (
    <span className="addr">
      <a
        className="addr__text mono"
        href={`${r.network.explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
      >
        {address}
      </a>
      <button
        className="copy-btn"
        aria-label={`Copy ${label} address`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            toast?.({ text: "Address copied." });
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast?.({
              kind: "bad",
              text: "Copy is unavailable. Select the address and copy it.",
            });
          }
        }}
      >
        <Icon name={copied ? "check" : "copy"} />
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </span>
  );
}
export function Countdown({
  until,
  label,
  urgent = false,
}: {
  until: number;
  label: string;
  urgent?: boolean;
}) {
  const { now } = useApp();
  return (
    <span
      className={`countdown ${urgent ? "countdown--urgent" : ""}`}
      role="timer"
      aria-label={`${label}: ${duration(until - now)} remaining, until ${utc(until)}`}
    >
      <span>{label}</span>
      <span className="countdown__time">{duration(until - now)}</span>
    </span>
  );
}
export function TradingGate() {
  const { s, now } = useApp();
  if (!s)
    return (
      <p className="loading-label">Reading trading status from Sepolia…</p>
    );
  if (s.v["PleaHook.seeded"]) return null;
  const start = Number(con(s, "PleaLaunch.START"));
  return (
    <div className="stack stack--sm">
      <Notice title="Trading is not open yet" kind="warn">
        <p>Anyone may seed from {utc(start)}.</p>
      </Notice>
      <Countdown
        until={start}
        label={now < start ? "Trading may open in" : "Seed is available"}
      />
      {now >= start && (
        <TxButton name="PleaLaunch" fn="seed" label="Seed trading" />
      )}
    </div>
  );
}
export function TextBox({
  kind = "plea",
  label,
  value,
  onChange,
  currentName,
}: {
  kind?: "plea" | "objection" | "letter" | "name";
  label: string;
  value: string;
  onChange: (s: string) => void;
  currentName?: string;
}) {
  const id = useId();
  const { s } = useApp();
  const result = textCheck(kind, value);
  const max =
    kind === "name"
      ? 20
      : Number(
          con(
            s,
            kind === "objection"
              ? "Tribunal.MAX_TEXT_BYTES"
              : "CabalGate.MAX_PLEA_BYTES",
          ) || 280,
        );
  const bytes =
    kind === "letter" ? result.bytes : window.PleaText.byteLength(value);
  const current = kind === "name" && value === currentName;
  return (
    <div className="field">
      <div className="field__top">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <span className="field__aside">
          {kind === "name" ? "3–20 of a–z, 0–9, _" : "One line, any language"}
        </span>
      </div>
      <div className={`textarea ${value && !result.ok ? "is-invalid" : ""}`}>
        {kind === "name" ? (
          <input
            id={id}
            className="input__control name-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!result.ok}
            aria-describedby={`${id}-checks`}
          />
        ) : (
          <textarea
            id={id}
            rows={4}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!value && !result.ok}
            aria-describedby={`${id}-checks`}
          />
        )}
        <div className="textarea__bar">
          <span className="counter">
            <span className="counter__meter" aria-hidden="true">
              <span
                style={{ width: `${Math.min(100, (bytes / max) * 100)}%` }}
              />
            </span>
            {bytes} / {max} bytes
          </span>
        </div>
      </div>
      <ul className="checks" id={`${id}-checks`}>
        {current ? (
          <li className="check">
            <Icon name="check" />
            <span>This is your current name</span>
          </li>
        ) : value ? (
          result.issues
            .filter((x: any) => x.message)
            .map((issue: any, i: number) => (
              <li
                className={`check ${issue.warning ? "" : "check--bad"}`}
                key={i}
              >
                <Icon name={issue.warning ? "info" : "x"} />
                <span>{issue.message}</span>
              </li>
            ))
        ) : (
          <li className="check">
            <Icon name="minus" />
            <span>
              {kind === "name"
                ? "An empty name clears your display name."
                : "Write your text to run the contract’s checks."}
            </span>
          </li>
        )}
        {value &&
          !current &&
          kind !== "name" &&
          [
            { codes: ["empty", "too-long"], text: `1–${max} UTF-8 bytes` },
            {
              codes: ["control", "utf8"],
              text: "One line, valid UTF-8, no control characters",
            },
            {
              codes: ["refused"],
              text: "No hidden or default-ignorable characters",
            },
            {
              codes: ["marker"],
              text: "No [PLEA or [OBJECTION marker prefixes",
            },
          ].map((check) => {
            const bad = result.issues.some((x: any) =>
              check.codes.includes(x.code),
            );
            return (
              <li
                key={check.text}
                className={`check ${bad ? "check--bad" : "check--ok"}`}
              >
                <Icon name={bad ? "x" : "check"} />
                <span>{check.text}</span>
              </li>
            );
          })}
      </ul>
      <p className="sr-only" role="status">
        {current
          ? "This is your current name"
          : result.ok
            ? "Text checks pass"
            : result.issues.find((x: any) => !x.warning)?.message || ""}
      </p>
      {kind === "letter" && result.reads && (
        <p className="chain-text">{result.reads}</p>
      )}
    </div>
  );
}
export const textCheck = (kind: string, text: string) =>
  window.PleaText[
    kind === "name"
      ? "checkName"
      : kind === "letter"
        ? "checkLetter"
        : kind === "objection"
          ? "checkObjection"
          : "checkText"
  ](text);
export function AmountInput({
  id,
  label,
  value,
  onChange,
  unit,
  hint,
  aside,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (s: string) => void;
  unit: string;
  hint?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field__top">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {aside && <span className="field__aside">{aside}</span>}
      </div>
      <div className={`input ${!onChange ? "input--readonly" : ""}`}>
        <input
          className="input__control"
          id={id}
          inputMode="decimal"
          value={value}
          readOnly={!onChange}
          onChange={(e) => onChange?.(e.target.value)}
          autoComplete="off"
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <span className="input__unit">{unit}</span>
      </div>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
export function Action({
  label,
  onRun,
  disabled = false,
  reason,
  busy = false,
  error,
  hash,
  done = false,
  confirmed,
  primary = true,
}: {
  label: string;
  onRun: () => void;
  disabled?: boolean;
  reason?: ReactNode;
  busy?: boolean;
  error?: string;
  hash?: string;
  done?: boolean;
  confirmed?: boolean;
  primary?: boolean;
}) {
  const id = useId();
  const { address, chainId } = useAccount();
  const { r } = useApp();
  const unavailable = !address
    ? "Connect in the top bar to " + label.toLowerCase() + "."
    : chainId !== r.chain.id
      ? "Switch to Sepolia in the top bar."
      : reason;
  return (
    <div className="stack stack--sm">
      <button
        type="button"
        className={`btn btn--block ${primary ? "btn--primary" : ""}`}
        disabled={
          disabled || busy || done || !address || chainId !== r.chain.id
        }
        aria-busy={busy}
        aria-describedby={unavailable || error ? `${id}-note` : undefined}
        onClick={onRun}
      >
        {busy
          ? "Waiting for wallet / confirmation…"
          : done
            ? "Confirmed"
            : label}
      </button>
      {(unavailable || error) && (
        <p
          id={`${id}-note`}
          className={`small ${error ? "bad-text" : "text-2"}`}
          role={error ? "alert" : undefined}
        >
          {error || unavailable}
        </p>
      )}
      {hash && (
        <p className="small">
          <a
            href={`${r.network.explorer}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {(confirmed ?? done)
              ? "Confirmed on Sepolia"
              : "View pending transaction"}
          </a>
        </p>
      )}
    </div>
  );
}
export function TxButton({
  name,
  fn,
  args = [],
  label,
  disabled,
  reason,
  primary = false,
}: {
  name: string;
  fn: string;
  args?: any[];
  label: string;
  disabled?: boolean;
  reason?: ReactNode;
  primary?: boolean;
}) {
  const tx = useTx(
    JSON.stringify([name, fn, args], (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
  return (
    <Action
      {...tx}
      label={label}
      onRun={() => tx.send(name, fn, args)}
      disabled={disabled || !tx.ready}
      reason={reason}
      primary={primary}
    />
  );
}
export function ApprovedAction({
  name,
  fn,
  args = [],
  label,
  token,
  spender,
  spend,
  disabled,
  reason,
  primary = true,
}: {
  name: string;
  fn: string;
  args?: any[];
  label: string;
  token: Address;
  spender: Address;
  spend: bigint;
  disabled?: boolean;
  reason?: ReactNode;
  primary?: boolean;
}) {
  const { r, s } = useApp();
  const { address } = useAccount();
  const tx = useTx(
    JSON.stringify([name, fn, args], (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
  const [revision, setRevision] = useState(0);
  const [lastWasApproval, setLastWasApproval] = useState(false);
  const allowance = useRead(
    () =>
      r.client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, spender],
      }),
    [address, token, spender, revision],
    !!address && !!s,
  );
  const needs = allowance.data !== undefined && allowance.data < spend;
  return (
    <Action
      {...tx}
      done={tx.done && !lastWasApproval}
      confirmed={tx.done}
      label={
        needs
          ? `Approve ${token.toLowerCase() === r.addresses.PLEA.toLowerCase() ? s?.constants.symbol : s?.constants.pairSymbol}`
          : label
      }
      primary={primary}
      disabled={
        disabled ||
        !tx.ready ||
        allowance.loading ||
        allowance.data === undefined
      }
      reason={
        reason ||
        allowance.error ||
        (needs
          ? "Approval only. Confirm this step, then submit the action."
          : undefined)
      }
      onRun={async () => {
        if (needs) {
          setLastWasApproval(true);
          const h = await tx.send("", "approve", [], {
            to: token,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [spender, spend],
            }),
          });
          if (h) setRevision((n) => n + 1);
        } else {
          setLastWasApproval(false);
          await tx.send(name, fn, args);
        }
      }}
    />
  );
}
const classFor: Record<string, string> = {
  APPROVED: "approved",
  OVERTURNED: "approved",
  DENIED: "denied",
  UPHELD: "denied",
  PENDING: "pending",
  "NO VERDICT": "noverdict",
  LAPSED: "lapsed",
  SOLD: "sold",
};
export function Stamp({
  p,
  large = false,
  staticTime = false,
}: {
  p: Plea;
  large?: boolean;
  staticTime?: boolean;
}) {
  const { s, now, landVerdict } = useApp();
  const state = pleaState(p, now, s!);
  const [landKey, setLandKey] = useState<string>();
  useEffect(() => {
    const id = String(p.id);
    if (!staticTime && landVerdict(id)) setLandKey(id);
  }, [p.id, s, landVerdict, staticTime]);
  return (
    <span
      className={`stamp stamp--${classFor[state]} ${large ? "stamp--lg" : ""} ${landKey === String(p.id) ? "stamp--land" : ""}`}
    >
      {state}
      <span className="stamp__sub">
        {state === "PENDING"
          ? staticTime
            ? `until ${utc(Number(p.submittedAt) + Number(con(s, "CabalGate.PENDING_EXPIRY"))).slice(11)}`
            : `${duration(Number(p.submittedAt) + Number(con(s, "CabalGate.PENDING_EXPIRY")) - now)} left`
          : state === "NO VERDICT"
            ? p.failure
              ? p.failure.status === 1
                ? "request refused"
                : `panel split ${p.failure.agreed}/${p.failure.answered}`
              : "no panel verdict"
            : `${p.score} vs need ${p.need}`}
      </span>
    </span>
  );
}
export function ObjectionStamps({ p }: { p: Plea }) {
  return (
    <>
      {p.objections?.map((o) => (
        <p className="cluster cluster--sm small" key={String(o.id)}>
          <span className="stamp stamp--sm stamp--objection">
            {["", "OBJECTION", "SUSTAINED", "OVERRULED", "VOID"][o.ruling]}
            {o.ruling === 1 ? ` #${o.id}` : ""}
          </span>
          <span>
            {o.ruling === 1
              ? "pending"
              : `#${o.id}: ${o.newScore} vs need ${p.need}`}
          </span>
        </p>
      ))}
    </>
  );
}
export function PleaCard({ p, detail = false }: { p: Plea; detail?: boolean }) {
  const { s, now } = useApp();
  const { address } = useAccount();
  const content = (
    <>
      <div className="wall-card__top">
        <Stamp p={p} large={detail} />
        <span className="wall-card__id">
          Plea #{String(p.id)} · sent {duration(now - Number(p.submittedAt))}{" "}
          ago
        </span>
      </div>
      <p
        className={detail ? "plea__text plea__text--detail" : "wall-card__text"}
      >
        “{p.text}”
      </p>
      <ObjectionStamps p={p} />
      <div className="wall-card__nums">
        <span>
          <b>{tokenAmount(p.amount, s)}</b>
        </span>
        <span>
          {[2, 4, 5].includes(p.status)
            ? p.standing?.[1] || p.excluded
              ? "no points"
              : `+${p.points} points ${p.recorded ? "recorded" : p.standing?.[0] ? "held" : "once recorded"}`
            : p.status === 1
              ? "no points yet"
              : "no points"}
        </span>
        {p.status === 4 && (
          <span>
            Sold for{" "}
            {tokenAmount(
              p.escrow?.[3] ||
                s?.logs.find(
                  (l) => l.eventName === "SellExecuted" && l.args.id === p.id,
                )?.args.imdOut,
              s,
              true,
            )}
          </span>
        )}
      </div>
      <div className="wall-card__who">
        <span className="strong">{p.name || short(p.seller)}</span>
        {p.seat && <span className="badge badge--seat">SEAT ×1.2</span>}
        {(p.flags & 1) > 0 && (
          <span className="badge badge--letter">BY LETTER</span>
        )}
        {(p.flags & 2) > 0 && (
          <span className="badge badge--auto">AUTO-SELL</span>
        )}
        {p.isAppeal && (
          <span className="badge">APPEAL OF #{String(p.originalId)}</span>
        )}
        {address?.toLowerCase() === p.seller.toLowerCase() && (
          <span className="badge badge--you">YOU</span>
        )}
      </div>
    </>
  );
  return detail ? (
    <article className="card plea stack">{content}</article>
  ) : (
    <a className="wall-card" href={`#/p/${p.id}`}>
      {content}
    </a>
  );
}
export function Meter({
  fact,
  need,
  score = 0,
}: {
  fact: number;
  need: number;
  score?: number;
}) {
  const { s } = useApp();
  return (
    <div
      className={`meter ${!score ? "meter--none" : ""}`}
      style={{ "--score": score, "--need": need } as CSSProperties}
    >
      <div className="meter__legend">
        <span>{score ? `Judges ${score}` : "No score yet"}</span>
        <span>
          Need <b>{need}</b> = {String(con(s, "CabalGate.PASS_MARK"))} − fact{" "}
          <b>{fact}</b>
        </span>
      </div>
      <div
        className="meter__bar"
        role="img"
        aria-label={`Score ${score}, need ${need} of ${con(s, "CabalGate.MAX_PLEA_SCORE")}`}
      >
        <span className="meter__fill" />
        <span className="meter__need" />
      </div>
      <div className="meter__scale" aria-hidden="true">
        <span>0</span>
        <span>{String(con(s, "CabalGate.MAX_PLEA_SCORE"))}</span>
      </div>
    </div>
  );
}
