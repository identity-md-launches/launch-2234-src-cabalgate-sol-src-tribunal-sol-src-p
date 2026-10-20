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
  type Address,
  type Hex,
} from "viem";
import type { Runtime } from "./config";
import { discover } from "./config";
import { readStatic, readSnapshot, type Snapshot } from "./chain";
import { explainError } from "./errors";
type AppContext = {
  r: Runtime;
  s?: Snapshot;
  error: string;
  refresh: () => Promise<void>;
  verified: boolean;
  now: number;
  toast?: (x: Toast) => void;
  landVerdict: (id: string) => boolean;
};
const C = createContext<AppContext>(null!);
type Toast = { text: string; kind?: "bad" | "ok" | "pending"; hash?: string };
export function DataProvider({
  r,
  children,
}: {
  r: Runtime;
  children: ReactNode;
}) {
  const [s, setS] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [toast, setToast] = useState<Toast>();
  const previous = useRef<Snapshot | undefined>(undefined);
  const constants = useRef<Record<string, any> | undefined>(undefined);
  const busy = useRef(false);
  const liveVerdicts = useRef(new Set<string>());
  const landed = useRef(new Set<string>());
  const landVerdict = useCallback((id: string) => {
    if (!liveVerdicts.current.has(id) || landed.current.has(id)) return false;
    landed.current.add(id);
    return true;
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
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
      previous.current = next;
      setS(next);
      setError("");
    } catch (e) {
      setError(explainError(e));
    } finally {
      busy.current = false;
    }
  }, [r]);
  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (!document.hidden) refresh();
    }, 15000);
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => {
      clearInterval(interval);
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
        toast: setToast,
        landVerdict,
      }}
    >
      {children}
      <div className="toasts" aria-live="polite">
        {toast && (
          <div
            className={`toast toast--${toast.kind || "ok"}`}
            role={toast.kind === "bad" ? "alert" : "status"}
          >
            <svg className="icon" aria-hidden="true">
              <use
                href={`#i-${toast.kind === "bad" ? "warning-circle" : "check-circle"}`}
              />
            </svg>
            <div>
              <p className="toast__title">{toast.text}</p>
              {toast.hash && (
                <a
                  href={`${r.network.explorer}/tx/${toast.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction on Sepolia
                </a>
              )}
            </div>
            <button
              className="icon-btn"
              aria-label="Dismiss"
              onClick={() => setToast(undefined)}
            >
              ×
            </button>
          </div>
        )}
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
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError("");
    if (enabled) {
      setLoading(true);
      fn()
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e) => {
          if (active) setError(explainError(e));
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
  const { r, s, error: readError, verified, refresh, toast } = useApp();
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
      const req = raw || {
        to: r.addresses[name],
        data: encodeFunctionData({ abi: r.abis[name], functionName: fn, args }),
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
      toast?.({ text: `${fn || "Transaction"} confirmed.`, hash: h });
      return h;
    } catch (e) {
      const text = explainError(e, Object.values(r.abis));
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
      !!address &&
      !!connector &&
      !!s &&
      !readError &&
      chainId === r.chain.id &&
      verified,
  };
}
