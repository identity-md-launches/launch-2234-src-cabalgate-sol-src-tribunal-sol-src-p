import {
  useId,
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useAccount } from "wagmi";
import { encodeFunctionData, getAddress, type Address } from "viem";
import { useApp, useRead, useTx } from "./context";
import {
  amount,
  clock,
  words,
  span,
  ago,
  objectionLine,
  soldFor,
  con,
  val,
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
  level = 3,
}: {
  title?: string;
  children: ReactNode;
  card?: boolean;
  className?: string;
  level?: 2 | 3 | 4;
}) => (
  <section className={`${card ? "card" : "panel"} stack ${className}`}>
    {title &&
      (level === 2 ? (
        <h2 className="card__title">{title}</h2>
      ) : level === 4 ? (
        <h4 className="card__title">{title}</h4>
      ) : (
        <h3 className="card__title">{title}</h3>
      ))}
    {children}
  </section>
);
export const Notice = ({
  title,
  children,
  kind = "info",
  icon,
}: {
  title?: string;
  children: ReactNode;
  kind?: string;
  icon?: string;
}) => (
  <div className={`notice notice--${kind}`}>
    <Icon
      name={icon || (kind === "bad" || kind === "warn" ? "warning" : "info")}
    />
    <div>
      {title && <p className="notice__title">{title}</p>}
      <div>{children}</div>
    </div>
  </div>
);
export const Empty = ({
  title,
  children,
  icon = "scales",
  action,
}: {
  title: string;
  children: ReactNode;
  icon?: string;
  action?: { href: string; label: string };
}) => (
  <div className="empty">
    <svg className="icon empty__icon" aria-hidden="true">
      <use href={`#i-${icon}`} />
    </svg>
    <p className="empty__title">{title}</p>
    <p>{children}</p>
    {action && (
      <a className="btn btn--sm" href={action.href}>
        {action.label}
      </a>
    )}
  </div>
);
export const Costs = ({
  rows,
  parts = [],
}: {
  rows: [ReactNode, ReactNode][];
  parts?: number[];
}) => (
  <dl className="costs">
    {rows.map(([a, b], i) => (
      <div key={i} className={parts.includes(i) ? "is-part" : undefined}>
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
  address = getAddress(address);
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
            toast?.({ kind: "info", text: `${label} address copied.` });
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
  block = false,
  wait = false,
}: {
  until: number;
  label: string;
  urgent?: boolean;
  block?: boolean;
  wait?: boolean;
}) {
  const { now } = useApp();
  return (
    <span
      className={`countdown ${urgent ? "countdown--urgent" : ""} ${block ? "countdown--block" : ""} ${wait ? "countdown--wait" : ""}`}
      role="timer"
      aria-label={`${label} ${words(until - now)}, by ${clock(until)}`}
    >
      <span className="cluster cluster--sm">
        <Icon name={wait ? "hourglass" : "timer"} />
        {label}
      </span>
      <span className="countdown__time">{duration(until - now)}</span>
      {block && (
        <span className="countdown__bar" aria-hidden="true">
          <span
            style={{
              width: `${Math.max(0, Math.min(100, ((until - now) / (urgent ? 420 : 1200)) * 100))}%`,
            }}
          />
        </span>
      )}
    </span>
  );
}
export function TradingGate({ onSeed }: { onSeed?: () => void } = {}) {
  const { s, now } = useApp();
  const { address } = useAccount();
  const tx = useTx("seed");
  if (!s)
    return (
      <p className="loading-label">
        <Icon name="hourglass" />
        Reading trading status from Sepolia…
      </p>
    );
  if (s.v["PleaHook.seeded"]) return null;
  const start = Number(con(s, "PleaLaunch.START")),
    owner = address?.toLowerCase() === s.v["PLEA.owner"]?.toLowerCase(),
    buy = location.hash.split("?")[0] === "#/buy";
  return (
    <div className="stack stack--sm">
      <Notice title="Trading is not open yet" kind="warn">
        <p>
          {now < start
            ? `Trading may open from ${utc(start)}.`
            : `The opening time has passed. Trading opens when the pool is seeded.`}
        </p>
      </Notice>
      {now < start && (
        <div>
          <Countdown until={start} label="Trading may open in" />
        </div>
      )}
      {owner &&
        (buy ? (
          <>
            <p className="small">
              Seeding opens trading for everyone. It creates the pool at a{" "}
              {tokenAmount(con(s, "PleaHook.MARKET_CAP_IMD"), s, true)} market
              cap and starts the Cabal’s{" "}
              {span(Number(con(s, "CabalGate.DEADMAN")), "adj")} clock and the{" "}
              {span(Number(con(s, "PleaHook.LAUNCH_WINDOW")), "adj")} launch
              window. Make your opening{" "}
              {tokenAmount(con(s, "PleaHook.PAYOUT_RESERVE"), s, true)} buy here
              at once: its own shares join the pool, and every later buy then
              pays cashback normally.
            </p>
            <Action
              {...tx}
              label="Seed trading"
              primary={false}
              block
              onRun={async () => {
                if (await tx.send("PleaLaunch", "seed")) onSeed?.();
              }}
            />
          </>
        ) : (
          <a className="btn btn--sm" href="#/buy">
            Seed on the Buy page <Icon name="arrow-right" />
          </a>
        ))}
    </div>
  );
}
export function TextBox({
  kind = "plea",
  label,
  value,
  onChange,
  currentName,
  extraError,
  fieldId,
}: {
  kind?: "plea" | "objection" | "letter" | "name";
  label: string;
  value: string;
  onChange: (s: string) => void;
  currentName?: string;
  extraError?: string;
  fieldId?: string;
}) {
  const automaticId = useId(),
    id = fieldId || automaticId,
    { s } = useApp(),
    [touched, setTouched] = useState(false),
    result = textCheck(kind, value),
    bytes = window.PleaText.byteLength(value),
    max =
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
  const current = kind === "name" && !!currentName && value === currentName,
    bad = (!result.ok || !!extraError) && (touched || !!value),
    idle = !touched && !value;
  const issues = result.issues.filter(
      (i: any) => !i.warning && i.code !== "clear",
    ),
    key = current
      ? "current"
      : extraError
        ? "taken"
        : result.ok
          ? value
            ? "ok"
            : "empty"
          : issues.map((i: any) => i.code).join(","),
    last = useRef(key),
    [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (touched && last.current !== key)
      setAnnouncement(
        current
          ? "This is your current name."
          : extraError
            ? extraError
            : result.ok
              ? value
                ? "Text passes the checks."
                : ""
              : `${issues.length} problems: ${issues[0]?.message || ""}`,
      );
    last.current = key;
  }, [key, touched]);
  const has = (code: string) =>
      result.issues.some((i: any) => i.code === code && !i.warning),
    lengthBad = has("empty") || has("too-long");
  const rows =
    kind === "name"
      ? current
        ? [{ text: "This is your current name.", ok: true }]
        : !value && !currentName
          ? [{ text: "Type a name: 3–20 of a–z, 0–9, _.", idle: true }]
          : !value
            ? [{ text: "An empty name clears your display name.", ok: true }]
            : extraError
              ? [{ text: extraError, ok: false }]
              : result.ok
                ? [
                    {
                      text: "Fits the rules. Names are unique: the chain says if it is taken.",
                      ok: true,
                    },
                  ]
                : issues.map((i: any) => ({ text: i.message, ok: false }))
      : kind === "letter" &&
          ["name", "clear-name", "sell"].includes(result.kind)
        ? [{ text: result.reads || "SELL needs no text.", ok: result.ok }]
        : [
            {
              text: idle
                ? `1 to ${max} bytes`
                : lengthBad
                  ? bytes
                    ? `1 to ${max} bytes: ${bytes} now, cut ${bytes - max}`
                    : `1 to ${max} bytes: write something`
                  : `1 to ${max} bytes (${bytes} used)`,
              ok: !lengthBad,
              idle,
            },
            {
              text: "One line, no control characters",
              ok: !has("control"),
              idle,
            },
            {
              text: "No hidden characters (zero-width, direction marks, variation selectors)",
              ok: !has("refused") && !has("utf8"),
              idle,
            },
            {
              text: "No “[plea” or “[objection” markers, in any case",
              ok: !has("marker"),
              idle,
            },
            ...result.issues
              .filter((i: any) => !["empty", "too-long"].includes(i.code))
              .map((i: any) => ({
                text: i.message,
                ok: false,
                warning: i.warning,
              })),
          ];
  return (
    <div className="field">
      <div className="field__top">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <span className="field__aside">
          {kind === "name"
            ? "3–20 of a–z, 0–9, _"
            : `One line, up to ${max} bytes`}
        </span>
      </div>
      <div className={`textarea ${bad ? "is-invalid" : ""}`}>
        {kind === "name" ? (
          <input
            id={id}
            className="input__control name-input"
            value={value}
            onChange={(e) => {
              setTouched(true);
              onChange(e.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={bad}
            aria-describedby={`${id}-checks`}
          />
        ) : (
          <textarea
            id={id}
            rows={4}
            value={value}
            onChange={(e) => {
              setTouched(true);
              onChange(e.target.value);
            }}
            aria-invalid={bad}
            aria-describedby={`${id}-checks`}
          />
        )}
        <div className="textarea__bar">
          <span className={`counter ${bytes > max ? "counter--over" : ""}`}>
            <span className="counter__meter" aria-hidden="true">
              <span
                style={{ width: `${Math.min(100, (bytes / max) * 100)}%` }}
              />
            </span>
            {bytes} / {max} {kind === "name" ? "characters" : "bytes"}
          </span>
          {kind !== "name" && (
            <span className="small">≈ 280 Latin · 140 Cyrillic · 93 CJK</span>
          )}
        </div>
      </div>
      <ul className="checks" id={`${id}-checks`}>
        {rows.map((row: any, i: number) => (
          <li
            className={`check ${row.idle ? "check--idle" : row.warning ? "check--warn" : row.ok ? "check--ok" : "check--bad"}`}
            key={i}
          >
            <Icon
              name={
                row.idle
                  ? "minus"
                  : row.warning
                    ? "warning"
                    : row.ok
                      ? "check"
                      : "x"
              }
            />
            <span>{row.text}</span>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {kind === "letter" && value && result.reads && (
        <Notice title="Reads as:">
          <p>
            {result.reads.replace(
              /\bIMD\b/g,
              s?.constants.pairSymbol || "imdTEST",
            )}
          </p>
        </Notice>
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
  invalid = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (s: string) => void;
  unit: string;
  hint?: ReactNode;
  aside?: ReactNode;
  invalid?: boolean;
}) {
  return (
    <div className="field">
      <div className="field__top">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {aside && <span className="field__aside">{aside}</span>}
      </div>
      <div
        className={`input ${!onChange ? "input--readonly" : ""} ${invalid ? "is-invalid" : ""}`}
      >
        <input
          className="input__control"
          id={id}
          inputMode="decimal"
          aria-invalid={invalid || undefined}
          value={value}
          readOnly={!onChange}
          onChange={(e) => onChange?.(e.target.value)}
          autoComplete="off"
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <span className="input__unit">{unit}</span>
      </div>
      {hint && (
        <p
          className={`field__hint ${invalid ? "bad-text" : ""}`}
          id={`${id}-hint`}
        >
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
  variant,
  sub,
  connectText,
  walletLabel = "Confirm in your wallet…",
  pendingLabel = "Waiting for Sepolia…",
  block = false,
  small = false,
  describedBy,
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
  variant?: "ink";
  sub?: ReactNode;
  connectText?: string;
  walletLabel?: string;
  pendingLabel?: string;
  block?: boolean;
  small?: boolean;
  describedBy?: string;
}) {
  const id = useId();
  const { address, chainId } = useAccount();
  const { r } = useApp();
  const unavailable = !address
    ? connectText ||
      "Connect in the top bar to " +
        (/buy/i.test(label)
          ? "buy"
          : /plea|appeal/i.test(label)
            ? "plead"
            : /object/i.test(label)
              ? "object"
              : /claim/i.test(label)
                ? "send a claim. Any wallet will do: it only pays the gas"
                : /letter/i.test(label)
                  ? "send a letter"
                  : /record/i.test(label)
                    ? "record points"
                    : /close/i.test(label)
                      ? "close the season"
                      : label.toLowerCase()) +
        "."
    : chainId !== r.chain.id
      ? "Switch to Sepolia in the top bar."
      : reason ||
        (disabled && !busy && !done && !describedBy
          ? "Waiting for the required chain state."
          : undefined);
  return (
    <div className="stack stack--sm">
      <button
        type="button"
        className={`btn ${block ? "btn--block" : ""} ${small ? "btn--sm" : ""} ${variant ? "btn--" + variant : primary ? "btn--primary" : ""}`}
        aria-disabled={
          disabled || busy || done || !address || chainId !== r.chain.id
        }
        aria-busy={busy}
        aria-describedby={
          describedBy || (unavailable || error ? `${id}-note` : undefined)
        }
        onClick={() => {
          if (!(disabled || busy || done || !address || chainId !== r.chain.id))
            onRun();
        }}
      >
        {busy ? (
          hash ? (
            pendingLabel
          ) : (
            walletLabel
          )
        ) : done ? (
          "Confirmed"
        ) : (
          <>
            {label}
            {sub && <span className="btn__sub">{sub}</span>}
          </>
        )}
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
  resetKey,
  small = false,
}: {
  name: string;
  fn: string;
  args?: any[];
  label: string;
  disabled?: boolean;
  reason?: ReactNode;
  primary?: boolean;
  resetKey?: string;
  small?: boolean;
}) {
  const tx = useTx(
    resetKey ||
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
      small={small}
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
  variant,
  sub,
  prepare,
  errors,
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
  variant?: "ink";
  sub?: ReactNode;
  prepare?: () => Promise<any[] | undefined>;
  errors?: import("./errors").ErrorMap;
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
      variant={variant}
      sub={needs ? undefined : sub}
      block
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
          await tx.send(name, fn, args, undefined, {
            errors,
            prepare: prepare
              ? async () => {
                  const fresh = await prepare();
                  return {
                    to: r.addresses[name],
                    data: encodeFunctionData({
                      abi: r.abis[name],
                      functionName: fn,
                      args: fresh || args,
                    }),
                  };
                }
              : undefined,
          });
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
                : !p.failure.answered
                  ? "no answer"
                  : `panel split ${p.failure.agreed}/${p.failure.answered}`
              : "no answer"
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
          <span>{objectionLine(o, p)}</span>
        </p>
      ))}
    </>
  );
}
export function PleaCard({
  p,
  detail = false,
  missedSeason = false,
}: {
  p: Plea;
  detail?: boolean;
  missedSeason?: boolean;
}) {
  const { s, now } = useApp(),
    { address } = useAccount(),
    prefix = useId(),
    state = pleaState(p, now, s!),
    earns = [2, 4, 5].includes(p.status) && !p.excluded && !p.standing?.[1];
  const pts = earns
      ? missedSeason
        ? "not recorded before the season closed"
        : `+${p.points || 0} points${p.standing?.[0] ? " held" : ""}`
      : "no points",
    window = Number(con(s, "CabalGate.EXECUTE_WINDOW")),
    appeal = s?.logs.find(
      (l) => l.eventName === "PleaSubmitted" && l.args.originalId === p.id,
    )?.args.id;
  const nums = (
    <>
      {state === "PENDING" ? (
        <>
          <span>{tokenAmount(p.amount, s)}</span>
          <span>need {p.need}</span>
          <span>
            expires{" "}
            {clock(
              Number(p.submittedAt) +
                Number(con(s, "CabalGate.PENDING_EXPIRY")),
            )}
          </span>
        </>
      ) : state === "NO VERDICT" ? (
        <>
          <span>no points</span>
          <span>no cooldown</span>
        </>
      ) : p.status === 3 ? (
        <>
          <span>no points</span>
          <span>
            {p.isAppeal ? (
              "no further appeal"
            ) : appeal ? (
              <span>appealed in #{String(appeal)}</span>
            ) : p.appealed ? (
              "appealed"
            ) : (
              `appeal until ${clock(Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN")))}`
            )}
          </span>
        </>
      ) : (
        <>
          <span>{pts}</span>
          {state === "APPROVED" ||
          (state === "OVERTURNED" && p.status === 2) ? (
            <span>sell by {clock(Number(p.verdictAt) + window)}</span>
          ) : state === "LAPSED" ? (
            <span>not sold in {window / 60} min</span>
          ) : p.status === 4 ? (
            <span>sold for {tokenAmount(soldFor(p, s!), s, true)}</span>
          ) : null}
        </>
      )}
    </>
  );
  const content = (
    <>
      <div className="wall-card__top">
        <span id={`${prefix}-stamp`}>
          <Stamp p={p} large={detail} />
        </span>
        <span className="wall-card__id" id={`${prefix}-id`}>
          <span className="sr-only">Plea </span>#{String(p.id)}{" "}
          <span id={`${prefix}-age`}>· {ago(now - Number(p.submittedAt))}</span>
        </span>
      </div>
      <p
        className={detail ? "plea__text plea__text--detail" : "wall-card__text"}
        id={`${prefix}-text`}
      >
        “{p.text}”
      </p>
      {detail && (
        <>
          <FactCells parts={p.facts} total={p.factScore} />
          <Meter
            fact={p.factScore}
            need={p.need}
            score={p.score}
            verdict={state}
          />
        </>
      )}
      <div id={`${prefix}-objections`}>
        <ObjectionStamps p={p} />
      </div>
      <div className="wall-card__nums" id={`${prefix}-nums`}>
        {nums}
      </div>
      <div className="wall-card__who" id={`${prefix}-who`}>
        <span className={`${p.name ? "" : "mono "}strong`}>
          {p.name || short(p.seller)}
        </span>
        {p.seat && <span className="badge badge--seat">SEAT ×1.2</span>}
        {!!(p.flags & 1) && (
          <span className="badge badge--letter">
            <Icon name="envelope-simple" />
            BY LETTER
          </span>
        )}
        {!!(p.flags & 2) && !(p.flags & 1) && (
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
    <article className="card plea stack">
      {content}
      <p className="plea__summary">
        {p.status === 4
          ? `Sold ${tokenAmount(p.amount, s)} for ${tokenAmount(soldFor(p, s!), s, true)}`
          : `Sells ${tokenAmount(p.amount, s)}`}{" "}
        · {pts}
      </p>
    </article>
  ) : (
    <article className="wall-card linked-card">
      <a
        className="linked-card__link"
        href={`#/p/${p.id}`}
        aria-labelledby={`${prefix}-id ${prefix}-stamp`}
        aria-describedby={`${prefix}-age ${prefix}-text ${prefix}-objections ${prefix}-nums ${prefix}-who`}
      />
      {content}
    </article>
  );
}
export function HeroPlea({ p }: { p: Plea }) {
  const { s, now } = useApp(),
    { address } = useAccount(),
    state = pleaState(p, now, s!),
    mine = address?.toLowerCase() === p.seller.toLowerCase(),
    sell = Number(p.verdictAt) + Number(con(s, "CabalGate.EXECUTE_WINDOW")),
    objection =
      Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW"));
  return (
    <article className="card plea stack">
      <p className="label">{p.verdictAt ? "Latest verdict" : "Latest plea"}</p>
      <div className="plea__head">
        <h2 className="plea__id">Plea #{String(p.id)}</h2>
        <span className="meta">
          by{" "}
          <span className={!p.name ? "mono" : ""}>
            {p.name || short(p.seller)}
          </span>
        </span>
        {p.seat && (
          <span className="badge badge--seat">
            <Icon name="armchair" />
            SEAT ×1.2
          </span>
        )}
        {mine && <span className="badge badge--you">YOU</span>}
        <span className="plea__time">
          {p.verdictAt ? state.toLowerCase() : "sent"}{" "}
          {ago(now - Number(p.verdictAt || p.submittedAt))}
        </span>
      </div>
      <div className="hero-stamp">
        <Stamp p={p} large />
      </div>
      <p className="plea__text">“{p.text}”</p>
      {p.facts && <FactCells parts={p.facts} total={p.factScore} />}
      <Meter fact={p.factScore} need={p.need} score={p.score} verdict={state} />
      <p className="plea__summary">
        {p.status === 4
          ? `Sold ${tokenAmount(p.amount, s)} for ${tokenAmount(soldFor(p, s!), s, true)}`
          : `Sells ${tokenAmount(p.amount, s)}`}{" "}
        ·{" "}
        {p.excluded || p.standing?.[1]
          ? "no points"
          : `+${p.points || 0} points${p.standing?.[0] ? " held" : ""}${p.seat ? ` (${p.score} × 1.2)` : ""}`}
      </p>
      <div className="plea__actions">
        {p.status === 2 && now <= sell && (
          <Countdown
            until={sell}
            label={mine ? "Sell within" : "Seller’s window"}
            urgent={mine}
          />
        )}{" "}
        {p.standing?.[0] && now <= objection && (
          <Countdown until={objection} label="Objections close in" />
        )}
        {state === "PENDING" && (
          <Countdown
            until={
              Number(p.submittedAt) + Number(con(s, "CabalGate.PENDING_EXPIRY"))
            }
            label="Waiting for the Cabal"
            wait
          />
        )}
      </div>
      <a className="link-btn" href={`#/p/${p.id}`}>
        Open plea #{String(p.id)} <Icon name="arrow-right" />
      </a>
    </article>
  );
}
export function Meter({
  fact,
  need,
  score = 0,
  verdict,
  label,
}: {
  fact: number;
  need: number;
  score?: number;
  verdict?: string;
  label?: string;
}) {
  const { s } = useApp(),
    max = Number(con(s, "CabalGate.MAX_PLEA_SCORE") || 45),
    pass = Number(con(s, "CabalGate.PASS_MARK") || 71);
  if (need > max)
    return (
      <p className="small">
        Need {need} = {pass} − fact {fact}, above the {max} a plea can score.
      </p>
    );
  const judged = !!verdict && !["PENDING", "NO VERDICT"].includes(verdict),
    denied = verdict === "DENIED" || verdict === "UPHELD",
    difference = denied ? `${need - score} short` : `passes by ${score - need}`;
  return (
    <div
      className={`meter ${!judged ? "meter--none" : denied ? "meter--denied" : ""}`}
      style={
        {
          "--score": Math.max(0, Math.min(max, score)),
          "--need": Math.max(0, Math.min(max, need)),
        } as CSSProperties
      }
    >
      <div className="meter__legend">
        <span>
          {judged
            ? `Judges ${score}`
            : verdict === "PENDING"
              ? "Waiting for the judges"
              : "No score yet"}
        </span>
        <span>
          Need <b>{need}</b> = {pass} − fact <b>{fact}</b>
        </span>
        {judged && (
          <span className={denied ? "bad-text" : "ok-text"}>{difference}</span>
        )}
      </div>
      <div
        className="meter__bar"
        role="img"
        aria-label={
          label ||
          (judged
            ? `Score ${score} of ${max}, need ${need}: ${difference}`
            : `No score yet. Your need is ${need} of ${max}.`)
        }
      >
        <span className="meter__fill" />
        <span className="meter__need" />
      </div>
      <div className="meter__scale" aria-hidden="true">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
export function FactCells({
  parts,
  total,
}: {
  parts?: {
    share: number;
    held: number;
    profit: number;
    trend: number;
    total: number;
    uncovered: bigint;
    weighted: number;
  };
  total: number;
}) {
  if (!parts)
    return <p className="small">Fact score {total}, read from the chain.</p>;
  const rows =
    parts.total === total && !parts.uncovered
      ? [
          ["Share sold", parts.share],
          ["Held", parts.held],
          ["Profit or loss", parts.profit],
          ["24h trend", parts.trend],
        ]
      : [
          ["Share sold", parts.share],
          ["Held, profit and trend", total - parts.share],
        ];
  return (
    <>
      <div className="facts">
        {rows.map(([label, points]) => (
          <div className="fact" key={label}>
            <span className="fact__label">{label}</span>
            <b className="fact__value">+{points}</b>
          </div>
        ))}
      </div>
      {parts.uncovered > 0n && (
        <p className="small">
          {amount(parts.uncovered)} PLEA have no buy record: they count as held
          since trading opened, profit 10. Holding and profit use the
          PLEA-weighted mean.
        </p>
      )}
    </>
  );
}
