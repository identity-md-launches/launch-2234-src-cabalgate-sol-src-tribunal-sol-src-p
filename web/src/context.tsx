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
import { discover, resetHealth } from "./config";
import {
  readStatic,
  getPlea,
  read,
  blockTime,
  short,
  span,
  val,
  con,
  soldFor,
  feeInPleaText,
  readSnapshot,
  scanLogs,
  tokenAmount,
  clock,
  type Snapshot,
} from "./chain";
import {
  explainError,
  explainReadError,
  DisplayError,
  type ErrorMessage,
  type ErrorMap,
} from "./errors";
type AppContext = {
  r: Runtime;
  s?: Snapshot;
  error: string;
  refresh: () => Promise<boolean>;
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
  role?: "status" | "alert";
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
      setToasts((old) => {
        if (t.hash && old.some((x) => x.hash === t.hash && x.text === t.text))
          return old;
        return [...old.slice(-2), { ...t, id: ++toastId.current }];
      }),
    [],
  );
  const { address } = useAccount();
  const wallet = useRef(address);
  wallet.current = address;
  const refreshWaiters = useRef<((ok: boolean) => void)[]>([]);
  const queued = useRef(false),
    failures = useRef(0),
    lastSnapshot = useRef(0),
    observedHead = useRef<bigint | undefined>(undefined);
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
          text: `The window closed at ${clock(end, true)}.`,
          body: `Plea #${id} lapsed: nothing was sold.${p.excluded || p.standing?.[1] ? "" : ` Your +${p.points} points still count.`} Next plea at ${clock(Number(p.verdictAt) + Number(con(s, "CabalGate.COOLDOWN")))}.`,
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
      return new Promise<boolean>((resolve) =>
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
          const eventId = ["Verdict", "Delivered"].includes(event.eventName)
            ? event.args.id
            : undefined;
          const p = eventId
            ? next.pleas.find((p) => p.id === eventId) ||
              (await getPlea(r, eventId, next.logs))
            : undefined;
          if (
            event.eventName === "Verdict" &&
            !next.logs
              .slice(previous.current.logs.length)
              .some(
                (l) =>
                  l.eventName === "Delivered" && l.args.id === event.args.id,
              ) &&
            p?.seller.toLowerCase() === wallet.current.toLowerCase()
          )
            pushToast({
              kind: event.args.approved ? "ok" : "bad",
              text: event.args.approved
                ? `Approved, ${p.score} vs need ${p.need}.`
                : `Denied, ${p.score} vs need ${p.need}: ${p.need - p.score} short.`,
              icon: event.args.approved ? "check-circle" : "x-circle",
              role: "status",
              body: event.args.approved
                ? `Sell within ${Number(constants.current["CabalGate.EXECUTE_WINDOW"]) / 60} minutes, by ${clock(Number(p.verdictAt) + Number(constants.current["CabalGate.EXECUTE_WINDOW"]))}.`
                : !p.isAppeal &&
                    !p.appealed &&
                    val(next, "CabalGate.cabalAlive") &&
                    next.timestamp <=
                      Number(p.verdictAt) +
                        Number(con(next, "CabalGate.COOLDOWN"))
                  ? p.flags & 1
                    ? `Send APPEAL <text> to the Letterbox: ${feeInPleaText(next, BigInt(con(next, "CabalGate.ORACLE_FEE")) + BigInt(con(next, "CabalGate.APPEAL_POOL_SHARE")) + 250000000000000000n)}. Call settle to return escrow and tip if you do not appeal.`
                    : `One appeal until ${clock(Number(p.verdictAt) + Number(con(next, "CabalGate.COOLDOWN")))}.`
                  : undefined,
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
            p?.seller.toLowerCase() === wallet.current.toLowerCase()
          )
            pushToast(await deliveredToast(r, next, p!, event));
        }
      clockBase.current = { chain: next.timestamp, local: Date.now() };
      setNow(next.timestamp);
      lastSnapshot.current = Date.now();
      observedHead.current = next.head;
      failures.current = 0;
      previous.current = next;
      setS(next);
      setError("");
      return true;
    } catch (e) {
      failures.current++;
      if (!previous.current || failures.current >= 2)
        setError(explainReadError(e));
      return false;
    } finally {
      busy.current = false;
      if (queued.current) {
        queued.current = false;
        const waiting = refreshWaiters.current.splice(0);
        void refresh().then((ok) => waiting.forEach((resolve) => resolve(ok)));
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
          const scan =
            observedHead.current === undefined
              ? undefined
              : await scanLogs(r, observedHead.current + 1n, block.number);
          if (scan?.error) throw scan.error;
          observedHead.current = block.number;
          if (
            !previous.current ||
            failures.current ||
            previous.current.historyError ||
            scan?.logs.length ||
            Date.now() - lastSnapshot.current >= 60000
          )
            await refresh();
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
    const recover = () => {
      if (!document.hidden) {
        resetHealth();
        void refresh();
      }
    };
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
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
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
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
            role={toast.role || (toast.kind === "bad" ? "alert" : "status")}
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
                  {toast.link || "View transaction"}
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
  const [error, setError] = useState<ErrorMessage>();
  const [hash, setHash] = useState<Hex>();
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  const activeKey = `${address || ""}:${chainId || ""}:${resetKey || ""}`;
  const lastKey = useRef(activeKey);
  const reset = () => {
    if (lock.current) return;
    setDone(false);
    setHash(undefined);
    setError(undefined);
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
    setError(undefined);
    setHash(undefined);
    let sentHash: Hex | undefined;
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
      sentHash = h;
      setHash(h);
      const receipt = await r.client.waitForTransactionReceipt({
        hash: h,
        confirmations: 1,
        timeout: 180000,
      });
      if (receipt.status !== "success") {
        await r.client.call({
          ...req,
          account: address,
          blockNumber: receipt.blockNumber,
        });
        throw new DisplayError({
          title: "Mined but reverted.",
          body: "Nothing was traded; only the gas was spent. Try again.",
        });
      }
      await refresh();
      setDone(true);
      if (fn !== "approve") {
        const message = {
          ...(await receiptToast(r, snapshot?.() || s!, receipt, fn, address)),
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
      toast?.({
        text: text.title,
        body: text.body,
        kind: "bad",
        hash: sentHash,
      });
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
async function receiptToast(
  r: Runtime,
  s: Snapshot,
  receipt: TransactionReceipt,
  fn: string,
  wallet?: string,
): Promise<Toast> {
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
  const escrow = find("Escrowed");
  if (p && escrow && Number(escrow.flags) & 1)
    return {
      kind: "pending",
      text: `Letter received as plea #${p.id}. The Cabal is reading your mail.`,
      body: `${tokenAmount(con(s, "CabalGate.ORACLE_FEE") + 250000000000000000n, s, true)} in fees, about ${tokenAmount(escrow.feePlea, s, false, 0, "up")}, paid from your PLEA. Usually 3 to 6 minutes.`,
      href: `#/p/${p.id}`,
      link: `Open plea #${p.id}`,
    };
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
  if (delivered)
    return deliveredToast(r, s, await getPlea(r, delivered.id, s.logs), {
      args: delivered,
      blockNumber: receipt.blockNumber,
      transactionHash: receipt.transactionHash,
    });
  if (sale) {
    const p = await getPlea(r, sale.id, s.logs),
      time = await blockTime(r, receipt.blockNumber);
    return {
      kind: "sold",
      text: `Sold ${tokenAmount(sale.amountIn, s)} for ${tokenAmount(sale.imdOut, s, true)}.`,
      body: `${p.excluded || p.standing?.[1] ? "" : `Record your +${p.points} points after ${clock(Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW")))}. `}Next plea at ${clock(time + Number(con(s, "CabalGate.COOLDOWN")))}.`,
    };
  }
  if (closed) {
    const prizes = events.filter((e) => e.eventName === "PrizePaid"),
      bonuses = events.filter((e) => e.eventName === "BonusPaid"),
      burned = find("BonusBurned")?.amount || 0n;
    return {
      text: `Season ${Number(closed.season) + 1} closed.`,
      body: `${prizes.length} wallets paid ${tokenAmount(closed.paid, s, true)} + ${tokenAmount(
        bonuses.reduce((n, e) => n + BigInt(e.args.amount), 0n),
        s,
      )}. ${tokenAmount(BigInt(closed.pot) - BigInt(closed.paid), s, true)} ${val(s, "CabalGate.diedAt") && BigInt(closed.season) === BigInt(s.v.displayedSeason) ? "is left for the buy wall" : `rolls over to season ${Number(closed.season) + 2}`}; ${tokenAmount(burned, s)} burned.`,
    };
  }
  if (recorded) {
    const best = (
        await read(r, "Seasons", "bestOf", [recorded.season, recorded.wallet])
      )
        .filter(Number)
        .sort((a: number, b: number) => b - a),
      top = await read(r, "Seasons", "topOf", [recorded.season]),
      rank = top.findIndex(
        (e: any) => e.wallet.toLowerCase() === recorded.wallet.toLowerCase(),
      ),
      points =
        events.find(
          (e) =>
            e.eventName === "SeatMultiplier" &&
            e.args.pleaId === recorded.pleaId,
        )?.args.pleaPoints ?? recorded.score;
    return {
      text: `+${points} points recorded.`,
      body: `Season ${Number(recorded.season) + 1}: ${best.reduce((a: number, b: number) => a + b, 0)} points (${best.join(" + ")})${rank >= 0 ? `, rank ${rank + 1}` : ""}.`,
    };
  }
  if (claim) {
    const vault = claim.account.toLowerCase() !== wallet?.toLowerCase();
    return {
      text: `Claimed ${tokenAmount(claim.amount, s)} for ${vault ? "the vault " : ""}${short(claim.account)}.`,
      body: vault
        ? "The PLEA is on the vault; this wallet paid only the gas."
        : `Claim #${claim.index} is done. Selling it will take a plea.`,
      link: "View the receipt",
    };
  }
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

async function deliveredToast(
  r: Runtime,
  s: Snapshot,
  p: import("./chain").Plea,
  event: any,
): Promise<Toast> {
  const time = await blockTime(r, event.blockNumber);
  return {
    kind: "sold",
    text: `Approved, ${p.score} vs need ${p.need}, and sold for you: ${tokenAmount(p.amount, s)} for ${tokenAmount(soldFor(p, s), s, true)}.`,
    body: `A runner (${short(event.args.runner)}) sold it within the ${span(Number(con(s, "CabalGate.EXECUTE_WINDOW")))} and earned the ${tokenAmount(event.args.tip, s, true)} tip.${p.excluded || p.standing?.[1] ? "" : ` Record your +${p.points} points after ${clock(Number(p.verdictAt) + Number(con(s, "Tribunal.OBJECTION_WINDOW")))}.`} Next plea after ${clock(time + Number(con(s, "CabalGate.COOLDOWN")))}.`,
    hash: event.transactionHash,
  };
}
