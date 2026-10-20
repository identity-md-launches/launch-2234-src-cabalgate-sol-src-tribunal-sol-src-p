import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { short, read } from "./chain";
import { useApp, useRead } from "./context";
import { explainError } from "./errors";
const OPEN = [
  {
    id: "metaMask",
    name: "MetaMask",
    href: (u: string) =>
      `https://link.metamask.io/dapp/${u.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (u: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(u)}`,
  },
  {
    // RabbyHub/rabby-mobile: hooks/universalLink.ts parses _cmd=open-dapp and dapp.
    id: "rabby",
    name: "Rabby",
    href: (u: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(u)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (u: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}`,
  },
];
export function Wallet() {
  const { r, s, toast } = useApp();
  const { address, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const info = useRead(
    async () => {
      const [name, seat] = await Promise.all([
        read(r, "Letterbox", "nameOf", [address]),
        read(r, "Seasons", "holdsSeat", [address]),
      ]);
      return { name, seat };
    },
    [address],
    !!address && !!s,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as any).ethereum;
  useEffect(() => {
    if (address) {
      dialog.current?.close();
    }
  }, [address]);
  async function switchChain() {
    setSwitching(true);
    setError("");
    try {
      const p = (await connector?.getProvider()) as any;
      if (!p) throw Error("No wallet provider");
      try {
        await p.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: r.manifest.walletAddChain.chainId }],
        });
      } catch (e: any) {
        if (
          e.code === 4902 ||
          /unknown|unrecognized|not added|not configured/i.test(e.message)
        ) {
          await p.request({
            method: "wallet_addEthereumChain",
            params: [r.manifest.walletAddChain],
          });
          await p.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: r.manifest.walletAddChain.chainId }],
          });
        } else throw e;
      }
    } catch (e) {
      const text = explainError(e);
      setError(text);
      toast?.({ kind: "bad", text });
    } finally {
      setSwitching(false);
    }
  }
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = connectors.filter(
    (c) =>
      !(c.id === "injected" && named) && (!mobile || c.type !== "injected"),
  );
  return (
    <>
      {address && chainId === r.chain.id ? (
        <a className="wallet-btn" href="#/profile">
          {info.data?.seat && <span className="seat-dot" aria-hidden="true" />}
          {info.data?.name || short(address)}
          <span className="sr-only">
            : your profile{info.data?.seat ? " (holds an IMD seat)" : ""}
          </span>
        </a>
      ) : (
        <button
          ref={trigger}
          className={`wallet-btn ${!address || chainId !== r.chain.id ? "wallet-btn--connect" : ""}`}
          onClick={() =>
            address && chainId !== r.chain.id
              ? switchChain()
              : dialog.current?.showModal()
          }
          disabled={switching}
        >
          <span className="wallet-btn__name">
            {switching
              ? "Switching…"
              : address
                ? chainId !== r.chain.id
                  ? "Switch to Sepolia"
                  : short(address)
                : "Connect"}
          </span>
        </button>
      )}
      <dialog
        ref={dialog}
        className="wallet-sheet"
        aria-labelledby="wallet-sheet-title"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        onClose={() => trigger.current?.focus()}
      >
        <div className="stack">
          <div className="cluster cluster--between">
            <h2 id="wallet-sheet-title">
              {address ? "Your wallet" : "Connect a wallet"}
            </h2>
            <button
              className="icon-btn"
              aria-label="Close wallet menu"
              onClick={() => dialog.current?.close()}
            >
              <svg className="icon" aria-hidden="true">
                <use href="#i-x" />
              </svg>
            </button>
          </div>
          {address ? (
            <>
              <p className="mono addr__text">{address}</p>
              <a
                className="btn"
                href={`#/profile/${address}`}
                onClick={() => dialog.current?.close()}
              >
                Your profile
              </a>
              <button
                className="btn"
                onClick={() => {
                  disconnect();
                  dialog.current?.close();
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              {mobile &&
                OPEN.map((w) => (
                  <a
                    className="wallet-row"
                    key={w.id}
                    href={w.href(location.href)}
                  >
                    <img
                      src={`./wallets/${w.id}.svg`}
                      alt=""
                      width="28"
                      height="28"
                    />
                    Open in {w.name}
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  className="wallet-row"
                  key={c.uid}
                  disabled={isPending}
                  onClick={async () => {
                    setError("");
                    try {
                      await connectAsync({ connector: c });
                    } catch (e) {
                      setError(explainError(e));
                    }
                  }}
                >
                  <img
                    src={c.icon || "./wallets/metaMask.svg"}
                    width="28"
                    height="28"
                    alt=""
                  />
                  {c.id === "injected" ? "Browser wallet" : c.name}
                  {isPending && (variables?.connector as any)?.uid === c.uid
                    ? " · opening…"
                    : ""}
                </button>
              ))}
            </>
          )}
          {error && (
            <p className="bad-text" role="alert">
              {error}
            </p>
          )}
          <p className="small text-2">
            Sepolia test tokens have no value. Connecting never sends a
            transaction.
          </p>
        </div>
      </dialog>
    </>
  );
}
