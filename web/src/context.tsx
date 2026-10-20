import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAccount } from "wagmi";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  decodeEventLog,
  type TransactionReceipt,
  type Address,
  type Hex,
} from "viem";
import type { Runtime } from "./config";
import { discover } from "./config";
import {
  readStatic,
  readSnapshot,
  scanLogs,
  tokenAmount,
  clock,
  type Snapshot,
} from "./chain";
import { explainError, explainReadError, type ErrorMap } from "./errors";
type AppContext = {
  r: Runtime;
  s?: Snapshot;
  error: string;
  refresh: () => Promise<void>;
  verified: boolean;
  now: number;
  toast?: (x: Toast) => void;
  landVerdict: (id: string) => boolean;
  receipts: { key: string; hash: string; text: string }[];
  snapshot: () => Snapshot | undefined;
  saveReceipt: (receipt: { key: string; hash: string; text: string }) => void;
};
const C = createContext<AppContext>(null!);
export type Toast = {
  text: string;
  body?: string;
  icon?: string;
  kind?: "bad" | "ok" | "pending" | "sold" | "info";
  hash?: string;
  href?: string;
  link?: string;
};
export function DataProvider({
  r,
  children,
}: {
  r: Runtime;
  children: ReactNode;
}) {
  const [s, setS] = useState<Snapshot>();
  const [receipts, setReceipts] = useState<
    { key: string; hash: string; text: string }[]
  >([]);
  const saveReceipt = useCallback(
    (receipt: { key: string; hash: string; text: string }) =>
      setReceipts((old) => [
        ...old.filter((x) => x.key !== receipt.key),
        receipt,
      ]),
    [],
  );
  useEffect(() => {
    const clear = () => setReceipts([]);
    window.addEventListener("hashchange", clear);
    return () => window.removeEventListener("hashchange", clear);
  }, []);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [toasts, setToasts] = useState<(Toast & { id: number })[]>([]);
  const toastId = useRef(0);
  const pushToast = useCallback(
    (t: Toast) =>
      setToasts((old) => [...old.slice(-2), { ...t, id: ++toastId.current }]),
    [],
  );
  const { address } = useAccount();
  const wallet = useRef(address);
  wallet.current = address;
  const refreshWaiters = useRef<(() => void)[]>([]);
  const queued = useRef(false),
    failures = useRef(0),
    lastSnapshot = useRef(0);
  const previous = useRef<Snapshot | undefined>(undefined);
  const constants = useRef<Record<string, any> | undefined>(undefined);
  const busy = useRef(false);
  const clockBase = useRef<{ chain: number; local: number } | undefined>(
    undefined,
  );
  const liveVerdicts = useRef(new Set<string>());
  const watchedWindows = useRef(new Set<string>()),
    notifiedWindows = useRef(new Set<string>());
  useEffect(() => {
    if (!s || !address) return;
    for (const p of s.pleas) {
      if (p.seller.toLowerCase() !== address.toLowerCase()) continue;
      const end =
          Number(p.verdictAt) + Number(s.constants["CabalGate.EXECUTE_WINDOW"]),
        id = String(p.id);
      if (p.status === 2 && now <= end) watchedWindows.current.add(id);
      if (
        [2, 5].includes(p.status) &&
        now > end &&
        watchedWindows.current.has(id) &&
        !notifiedWindows.current.has(id)
      ) {
        notifiedWindows.current.add(id);
        pushToast({
          kind: "info",
          icon: "clock",
          text: `The window closed at ${clock(end)}.`,
          body: `Plea #${id} lapsed unsold; its points still count.`,
          href: `#/p/${id}`,
          link: `Open plea #${id}`,
        });
      }
    }
  }, [now, s, address, pushToast]);
  const landed = useRef(new Set<string>());
  const landVerdict = useCallback((id: string) => {
    if (!liveVerdicts.current.has(id) || landed.current.has(id)) return false;
    landed.current.add(id);
    return true;
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) {
      queued.current = true;
      return new Promise<void>((resolve) =>
        refreshWaiters.current.push(resolve),
      );
    }
    busy.current = true;
    try {
      if (!constants.current) {
        await discover(r);
        constants.current = await readStatic(r);
        setVerified(true);
      }
      const next = await readSnapshot(r, constants.current, previous.current);
      if (previous.current) {
        for (const p of next.pleas) {
          const old = previous.current.pleas.find((x) => x.id === p.id);
          if (old?.verdictAt === 0n && p.verdictAt > 0n)
            liveVerdicts.current.add(String(p.id));
        }
        for (const event of next.logs.slice(previous.current.logs.length))
          if (event.eventName === "Verdict")
            liveVerdicts.current.add(String(event.args.id));
      }
      if (previous.current && wallet.current)
        for (const event of next.logs.slice(previous.current.logs.length)) {
          const p = next.pleas.find((p) => p.id === event.args.id);
          if (
            event.eventName === "Verdict" &&
            p?.seller.toLowerCase() === wallet.current.toLowerCase()
          )
            pushToast({
              kind: event.args.approved ? "ok" : "bad",
              text: `${event.args.approved ? "Approved" : "Denied"}, ${p.score} vs need ${p.need}.`,
              body: event.args.approved
                ? `Sell within ${Number(constants.current["CabalGate.EXECUTE_WINDOW"]) / 60} minutes, by ${clock(Number(p.verdictAt) + Number(constants.current["CabalGate.EXECUTE_WINDOW"]))}.`
                : `One appeal until ${clock(Number(p.verdictAt) + Number(constants.current["CabalGate.COOLDOWN"]))}.`,
              href: `#/p/${p.id}`,
              link: `Open plea #${p.id}`,
            });
          if (event.eventName === "Ruled") {
            const o = next.pleas
              .flatMap((p) => p.objections || [])
              .find((o) => o.id === event.args.id);
            if (o?.objector?.toLowerCase() === wallet.current.toLowerCase())
              pushToast({
                kind: "info",
                icon: "gavel",
                text: `Objection #${o.id} ${o.ruling === 2 ? "sustained" : "overruled"}, ${o.newScore} vs need ${next.pleas.find((p) => p.id === o.pleaId)?.need}.`,
              });
          }
          if (
            event.eventName === "Delivered" &&
            event.args.writer?.toLowerCase() === wallet.current.toLowerCase()
          )
            pushToast({
              kind: "sold",
              text: `Sold for you: ${tokenAmount(event.args.imdOut, next, true)}.`,
              hash: event.transactionHash,
            });
        }
      clockBase.current = { chain: next.timestamp, local: Date.now() };
      setNow(next.timestamp);
      lastSnapshot.current = Date.now();
      failures.current = 0;
      previous.current = next;
      setS(next);
      setError("");
    } catch (e) {
      failures.current++;
      if (!previous.current || failures.current >= 2)
        setError(explainReadError(e));
    } finally {
      busy.current = false;
      if (queued.current) {
        queued.current = false;
        const waiting = refreshWaiters.current.splice(0);
        void refresh().finally(() => waiting.forEach((resolve) => resolve()));
      }
    }
  }, [r]);
  useEffect(() => {
    refresh();
    let stopped = false,
      timerPoll: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden && !busy.current) {
        try {
          const block = await r.client.getBlock();
          if (
            !previous.current ||
            (block.number > previous.current.block &&
              ((await scanLogs(r, previous.current.block + 1n, block.number))
                .length > 0 ||
                Date.now() - lastSnapshot.current >= 60000))
          )
            await refresh();
          failures.current = 0;
        } catch (e) {
          failures.current++;
          if (failures.current >= 2) setError(explainReadError(e));
        }
      }
      if (!stopped)
        timerPoll = setTimeout(
          poll,
          failures.current
            ? Math.min(60000, 15000 * 2 ** (failures.current - 1))
            : 12000,
        );
    };
    timerPoll = setTimeout(poll, 12000);
    const timer = setInterval(
      () =>
        setNow(
          clockBase.current
            ? clockBase.current.chain +
                Math.floor((Date.now() - clockBase.current.local) / 1000)
            : Math.floor(Date.now() / 1000),
        ),
      1000,
    );
    return () => {
      stopped = true;
      clearTimeout(timerPoll);
      clearInterval(timer);
    };
  }, [refresh]);
  return (
    <C.Provider
      value={{
        r,
        s,
        error,
        refresh,
        verified,
        now,
        toast: pushToast,
        landVerdict,
        receipts,
        snapshot: () => previous.current,
        saveReceipt,
      }}
    >
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.kind || "ok"}`}
            role={toast.kind === "bad" ? "alert" : "status"}
          >
            <svg className="icon" aria-hidden="true">
              <use
                href={`#i-${toast.icon || { bad: "warning-circle", pending: "hourglass", sold: "coins", info: "info", ok: "check-circle" }[toast.kind || "ok"]}`}
              />
            </svg>
            <div>
              <p className="toast__title">{toast.text}</p>
              {toast.body && <p>{toast.body}</p>}
              {toast.href && <a href={toast.href}>{toast.link}</a>}
              {toast.hash && (
                <a
                  href={`${r.network.explorer}/tx/${toast.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              )}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Dismiss"
              onClick={() =>
                setToasts((old) => old.filter((t) => t.id !== toast.id))
              }
            >
              <svg className="icon" aria-hidden="true">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </C.Provider>
  );
}
export const useApp = () => useContext(C);
export function useRead<T = any>(
  fn: () => Promise<T>,
  deps: any[],
  enabled = true,
) {
  const { s } = useApp();
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(deps, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
    oldKey = useRef("");
  const saved = useRef<T | undefined>(undefined),
    failed = useRef(0);
  useEffect(() => {
    let active = true;
    if (oldKey.current !== key || !enabled) {
      oldKey.current = key;
      saved.current = undefined;
      setData(undefined);
      setError("");
      failed.current = 0;
    }
    if (enabled) {
      setLoading(saved.current === undefined);
      fn()
        .then((d) => {
          if (active) {
            saved.current = d;
            setData(d);
            setError("");
            failed.current = 0;
          }
        })
        .catch((e) => {
          if (active && (++failed.current >= 2 || saved.current === undefined))
            setError(explainReadError(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else setLoading(false);
    return () => {
      active = false;
    };
  }, [...deps, enabled, s]);
  return { data, error, loading };
}
export function useTx(resetKey?: string) {
  const { r, s, verified, refresh, toast, saveReceipt, snapshot } = useApp();
  const { address, chainId, connector } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hex>();
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  const activeKey = `${address || ""}:${chainId || ""}:${resetKey || ""}`;
  const lastKey = useRef(activeKey);
  const reset = () => {
    if (lock.current) return;
    setDone(false);
    setHash(undefined);
    setError("");
  };
  useEffect(() => {
    if (!busy && lastKey.current !== activeKey) {
      lastKey.current = activeKey;
      reset();
    }
  }, [activeKey, busy]);

  const send = async (
    name: string,
    fn: string,
    args: any[] = [],
    raw?: { to: Address; data: Hex; value?: bigint },
    options?: {
      prepare?: () => Promise<{
        to: Address;
        data: Hex;
        value?: bigint;
      } | void>;
      toast?: (receipt: TransactionReceipt) => Toast;
      errors?: ErrorMap;
    },
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setDone(false);
    setError("");
    setHash(undefined);
    try {
      if (!connector || !address)
        throw Error("Connect in the top bar to send this transaction.");
      if (!verified || chainId !== r.chain.id)
        throw Error("Switch to Sepolia in the top bar before sending.");
      const provider = await connector.getProvider();
      const wallet = createWalletClient({
        account: address,
        chain: r.chain,
        transport: custom(provider as any),
      });
      const prepared = await options?.prepare?.();
      const req = prepared ||
        raw || {
          to: r.addresses[name],
          data: encodeFunctionData({
            abi: r.abis[name],
            functionName: fn,
            args,
          }),
          value: 0n,
        };
      await r.client.call({ ...req, account: address });
      const estimate = await r.client.estimateGas({ ...req, account: address });
      const h = await wallet.sendTransaction({
        ...req,
        account: address,
        chain: r.chain,
        gas: (estimate * 130n + 99n) / 100n,
      });
      setHash(h);
      const receipt = await r.client.waitForTransactionReceipt({
        hash: h,
        confirmations: 1,
        timeout: 180000,
      });
      if (receipt.status !== "success")
        throw Error("The transaction reverted.");
      await refresh();
      setDone(true);
      if (fn !== "approve") {
        const message = {
          ...receiptToast(r, snapshot?.() || s!, receipt, fn),
          ...options?.toast?.(receipt),
          hash: h,
        };
        toast?.(message);
        saveReceipt({
          key: resetKey || name + ":" + fn,
          hash: h,
          text: message.text,
        });
      }
      return h;
    } catch (e) {
      const text = explainError(e, Object.values(r.abis), options?.errors);
      setError(text);
      toast?.({ text, kind: "bad" });
      return undefined;
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  return {
    send,
    reset,
    busy,
    error,
    hash,
    done,
    ready:
      !!address && !!connector && !!s && chainId === r.chain.id && verified,
  };
}

export function receiptEvents(r: Runtime, receipt: TransactionReceipt) {
  return receipt.logs.flatMap((log) => {
    for (const abi of Object.values(r.abis))
      try {
        return [
          {
            ...decodeEventLog({ abi, data: log.data, topics: log.topics }),
            transactionHash: receipt.transactionHash,
          },
        ];
      } catch {}
    return [];
  }) as any[];
}
function receiptToast(
  r: Runtime,
  s: Snapshot,
  receipt: TransactionReceipt,
  fn: string,
): Toast {
  const events = receiptEvents(r, receipt),
    find = (n: string) => events.find((e) => e.eventName === n)?.args;
  const p = find("PleaSubmitted"),
    object = find("Objected"),
    sale = find("SellExecuted"),
    delivered = find("Delivered"),
    recorded = find("Recorded"),
    claim = find("Claimed"),
    closed = find("SeasonClosedOut");
  if (fn === "seed")
    return { kind: "ok", text: "Trading is open. Make your opening buy now." };
  if (p)
    return {
      kind: "pending",
      text: p.originalId
        ? `Appeal #${p.id} of plea #${p.originalId} sent. The Cabal is deliberating.`
        : `Plea #${p.id} sent. The Cabal is deliberating.`,
      body: "Usually 3 to 6 minutes.",
      href: `#/p/${p.id}`,
      link: `Open plea #${p.id}`,
    };
  if (object)
    return {
      kind: "pending",
      text: `Objection #${object.id} filed. A new panel is reading plea #${object.pleaId}.`,
      href: `#/p/${object.pleaId}`,
      link: `Open plea #${object.pleaId}`,
    };
  if (sale)
    return {
      kind: "sold",
      text: `Sold ${tokenAmount(sale.amountIn, s)} for ${tokenAmount(delivered?.imdOut || sale.imdOut, s, true)}.`,
    };
  if (closed) {
    const prizes = events.filter((e) => e.eventName === "PrizePaid"),
      bonuses = events.filter((e) => e.eventName === "BonusPaid"),
      burned = find("BonusBurned")?.amount || 0n;
    return {
      text: `Season ${Number(closed.season) + 1} closed.`,
      body: `${prizes.length} wallets paid ${tokenAmount(closed.paid, s, true)} + ${tokenAmount(
        bonuses.reduce((n, e) => n + BigInt(e.args.amount), 0n),
        s,
      )}. ${tokenAmount(BigInt(closed.pot) - BigInt(closed.paid), s, true)} rolls over to season ${Number(closed.season) + 2}; ${tokenAmount(burned, s)} burned.`,
    };
  }
  if (recorded) {
    const best = s.logs
        .filter(
          (l) =>
            l.eventName === "Recorded" &&
            l.args.season === recorded.season &&
            l.args.wallet.toLowerCase() === recorded.wallet.toLowerCase(),
        )
        .map((l) => Number(l.args.points))
        .sort((a, b) => b - a)
        .slice(0, 3),
      top = s.v.seasons[String(recorded.season)]?.top || [],
      rank = top.findIndex(
        (e: any) => e.wallet.toLowerCase() === recorded.wallet.toLowerCase(),
      );
    return {
      text: `+${recorded.points} points recorded.`,
      body: `Season ${Number(recorded.season) + 1}: ${best.reduce((a, b) => a + b, 0)} points (${best.join(" + ")})${rank >= 0 ? `, rank ${rank + 1}` : ""}.`,
    };
  }
  if (claim)
    return {
      text: `Claimed ${tokenAmount(claim.amount, s)} for ${claim.account}.`,
    };
  const nameSet = find("NameSet");
  if (nameSet)
    return {
      text: nameSet.name
        ? `Name saved: ${nameSet.name}.`
        : "Display name cleared.",
    };
  if (fn === "setName") return { text: "Display name saved." };
  if (fn === "flushToWall") return { text: "Leftovers sent to the buy wall." };
  if (fn === "settle")
    return { text: "Escrow or stake settled. Check the updated balance." };
  return { text: "Transaction confirmed." };
}
