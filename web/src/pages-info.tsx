import {
  HomeDetails,
  LetterDetails,
  ProfileDetails,
  BuyWallPanel,
} from "./details";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  hexToString,
  isAddress,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
} from "viem";
import { APP, claimsAbi, registryAbi } from "./config";
import { useApp, useRead, useTx } from "./context";
import {
  amount,
  cashback,
  con,
  duration,
  normalizeClaims,
  read,
  short,
  tokenAmount,
  utc,
  val,
} from "./chain";
import {
  AddressView,
  Action,
  Costs,
  Empty,
  Icon,
  Meter,
  Notice,
  Panel,
  PleaCard,
  TextBox,
  Title,
  TradingGate,
  TxButton,
  textCheck,
  Countdown,
} from "./components";
import { WalletBalances } from "./pages-trade";
export function Home() {
  const { r, s, now } = useApp();
  const symbol = s?.constants.symbol || "PLEA";
  const latest = s?.pleas.find((p) => p.verdictAt > 0n) || s?.pleas[0];
  return (
    <>
      <div className="split hero">
        <div className="stack stack--lg">
          <div>
            <div className="page-title">
              <h1 className="hero-title">
                <span className="hero-line">Buying is open.</span>Selling needs{" "}
                <span className="nowrap">a plea.</span>
              </h1>
            </div>
            <p className="lead">
              {symbol} is a meme token on Uniswap v4. To sell, you write why,
              and the Cabal scores your case.
            </p>
          </div>
          <div className="btn-row">
            <a className="btn btn--primary" href="#/buy">
              Buy {symbol}
            </a>
            {!val(s, "CabalGate.diedAt") && (
              <a className="btn" href="#/plead">
                Plead to sell
              </a>
            )}
          </div>
          <TradingGate />
        </div>
        {latest ? (
          <PleaCard p={latest} detail />
        ) : (
          <Panel card title="Latest verdict">
            <Empty title="The court is quiet">
              No pleas yet. The first case will be heard when trading opens.
            </Empty>
            <a className="link-btn" href="#/wall">
              See the Wall <Icon name="arrow-right" />
            </a>
          </Panel>
        )}
      </div>
      <section className="section" aria-label="Live numbers">
        <div className="stats">
          {[
            [
              "Price · 1M " + symbol,
              val(s, "PleaHook.seeded")
                ? tokenAmount(
                    (val(s, "PleaHook.priceX96") * 10n ** 24n) / 2n ** 96n,
                    s,
                    true,
                  )
                : s
                  ? "Not open"
                  : "Reading…",
              "Live pool price",
            ],
            [
              "PLEA burned",
              tokenAmount(val(s, "PleaHook.totalBurned"), s),
              "Burn fees and inventory trims",
            ],
            [
              "Pleas",
              s ? String(val(s, "CabalGate.nextId") - 1n) : "—",
              "Since test run 9 launched",
            ],
            [
              "Season prize pot",
              tokenAmount(val(s, "Seasons.pot"), s, true),
              "Recorded points compete for the pot",
            ],
          ].map(([label, value, note]) => (
            <div className="stat" key={label}>
              <span className="stat__label">{label}</span>
              <span className="stat__value">{value}</span>
              <span className="stat__note">{note}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>Latest verdicts</h2>
          <a className="link-btn" href="#/wall">
            Every plea <Icon name="arrow-right" />
          </a>
        </div>
        {s?.pleas.length ? (
          <div className="wall-grid">
            {s.pleas.slice(0, 6).map((p) => (
              <PleaCard key={String(p.id)} p={p} />
            ))}
          </div>
        ) : (
          <Empty title="Before the first plea">
            Nobody has asked for the exit yet.
          </Empty>
        )}
      </section>
      <section className="section" id="how">
        <div className="section__head">
          <h2>How it works</h2>
          <p className="meta">Four steps, all on chain</p>
        </div>
        <div className="stack stack--xl">
          <ol className="steps steps--4">
            {[
              [
                "Buy",
                `Open to anyone once seeded. Every trade pays ${s ? (Number(con(s, "PleaHook.IMD_FEE_BPS")) + Number(con(s, "PleaHook.PLEA_BURN_BPS"))) / 100 : "—"}%, with ${s ? Number(con(s, "PleaHook.CASHBACK_BPS")) / 100 : "—"}% cashback.`,
              ],
              [
                "Plead",
                `Write why you want to sell. At most ${tokenAmount(con(s, "CabalGate.MAX_SELL"), s)}. Pay ${tokenAmount(con(s, "CabalGate.ORACLE_FEE"), s, true)} to ask the judges.`,
              ],
              [
                "The Cabal judges",
                `${con(s, "CabalGate.PANEL_SIZE") || "—"} judges score the plea; ${con(s, "CabalGate.QUORUM") || "—"} must agree. A score at or above your need is approved.`,
              ],
              [
                "Sell",
                `Approved: sell within ${duration(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 0))}, or choose auto-sell. Denied: one appeal within ${duration(Number(con(s, "CabalGate.COOLDOWN") || 0))}.`,
              ],
            ].map(([a, b]) => (
              <li className="step" key={a}>
                <h3>{a}</h3>
                <p>{b}</p>
              </li>
            ))}
          </ol>
          <div className="split">
            <Panel title="Your need">
              <p>
                Before you pay, the contract scores your share sold,
                buy-weighted holding time, profit or loss and the 24-hour trend.
                Need = {String(con(s, "CabalGate.PASS_MARK") || "—")} − fact
                score. A need above{" "}
                {String(con(s, "CabalGate.MAX_PLEA_SCORE") || "—")} cannot pass.
              </p>
              <p>
                Hourly checkpoints set the reference price. Your current facts
                are read directly on the Plead page.
              </p>
              <a className="btn" href="#/plead">
                Check your facts
              </a>
            </Panel>
            <Panel title="The dead-man">
              <p>
                The Cabal begins when trading opens. If no signed plea verdict
                arrives for {duration(Number(con(s, "CabalGate.DEADMAN") || 0))}
                , it dies for good. Pleas and objections close; PLEA trades
                freely forever.
              </p>
              <p>
                Seasons last {duration(Number(con(s, "CabalGate.SEASON") || 0))}{" "}
                in this Sepolia test. Points are held until objections end;
                press Record my points to add them.
              </p>
              <a className="link-btn" href="#/seasons">
                Seasons and prizes
              </a>
            </Panel>
          </div>
        </div>
      </section>
      <HomeDetails />
      <BuyWallPanel />
      <section className="section" id="contracts">
        <div className="section__head">
          <h2>Contracts</h2>
          <span className="meta">Sepolia · launch #2234</span>
        </div>
        <ul className="contract-list">
          {Object.entries(r.addresses).map(([n, a]) => (
            <li className="panel stack stack--sm" key={n}>
              <h3>{n}</h3>
              <AddressView address={a} label={n} />
            </li>
          ))}
          <li className="panel stack stack--sm">
            <h3>PoolManager</h3>
            <AddressView address={r.network.uniswapV4.poolManager} />
          </li>
          <li className="panel stack stack--sm">
            <h3>PoolSwapTest</h3>
            <AddressView address={APP.swapRouter} />
          </li>
        </ul>
      </section>
    </>
  );
}
export function Letters() {
  const { r, s } = useApp();
  const [text, setText] = useState("");
  const tx = useTx(text);
  const result = textCheck("letter", text);
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack stack--lg">
      <div className="split">
        <div className="stack">
          <Title title="Plead by letter">
            No site needed. Send your plea as a plain message to the Letterbox,
            from Sepolia Etherscan or your wallet.
          </Title>
          <p className="meta">
            Same judges, same score, same need. If approved, anyone may sell it
            for you within{" "}
            {duration(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 0))}, or you
            send SELL and keep the tip.
          </p>
          <TradingGate />
        </div>
        <Panel card title="The Letterbox">
          {r.addresses.Letterbox ? (
            <AddressView address={r.addresses.Letterbox} label="Letterbox" />
          ) : (
            <p>Reading the Letterbox address…</p>
          )}
          <div className="cluster">
            <span className="pill">Network: Sepolia</span>
            <span className="pill">Send 0 ETH</span>
          </div>
          <p className="small">
            Send from the wallet holding your PLEA. Nothing to approve: fees
            come out of your PLEA. ETH pays only gas.
          </p>
        </Panel>
      </div>
      <section className="section">
        <div className="section__head">
          <h2>Two ways to send it</h2>
          <p className="meta">Both are the same letter</p>
        </div>
        <ol className="steps">
          <li className="step">
            <h3>Etherscan’s Write Contract</h3>
            <p>
              Open the Letterbox, then Contract, Write Contract and Connect.
              Call <code>letter(text)</code> with your letter in plain words.
            </p>
            <a
              className="btn"
              href={`${r.network.explorer}/address/${r.addresses.Letterbox}#writeContract`}
              target="_blank"
              rel="noreferrer"
            >
              Open Write Contract
            </a>
          </li>
          <li className="step">
            <h3>Your wallet’s data field</h3>
            <p>
              Send 0 ETH to the Letterbox. Put the UTF-8 hex data from the
              checker below in the transaction’s data field. The sender is
              always the writer.
            </p>
            <Costs
              rows={[
                [
                  "To",
                  r.addresses.Letterbox
                    ? short(r.addresses.Letterbox)
                    : "Reading…",
                ],
                ["Amount", "0 ETH"],
                ["Data", "Your letter as UTF-8 hex"],
              ]}
            />
          </li>
        </ol>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>What a letter can say</h2>
          <p className="meta">The first word decides</p>
        </div>
        <ul className="cmds">
          {[
            [
              "any text",
              "A new plea for 20% of your PLEA, within the cap. It sells automatically if approved. Letters pay no auto-sell fee.",
            ],
            [
              "APPEAL <text>",
              "Appeal your latest denied plea inside its appeal window, for the same share of your balance. The wall share is paid in PLEA too.",
            ],
            [
              "SELL",
              "Deliver your own approved letter plea and keep the runner tip.",
            ],
            [
              "NAME <name>",
              "Set your display name: lowercase letters, digits and underscores. NAME alone clears it.",
            ],
          ].map(([a, b]) => (
            <li className="cmd" key={a}>
              <span className="cmd__word">{a}</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <div className="split">
          <Panel card title="Check your letter">
            <TextBox
              kind="letter"
              label="Your letter"
              value={text}
              onChange={setText}
            />
            <p className="small">
              A command word must be in capitals at the very start. Text after
              SELL is ignored. The byte counter and checks follow the contract
              exactly.
            </p>
            <p className="label">Raw transaction data · UTF-8</p>
            <code className="letter-data">
              {text ? stringToHex(text) : "Write a letter to see its raw data."}
            </code>
            <div className="btn-row">
              <button
                className="btn"
                disabled={!text || !result.ok}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(stringToHex(text));
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copied" : "Copy hex data"}
              </button>
            </div>
            <Action
              {...tx}
              label="Send letter"
              onRun={() => tx.send("Letterbox", "letter", [text])}
              disabled={
                !tx.ready ||
                !result.ok ||
                !val(s, "PleaHook.seeded") ||
                !val(s, "CabalGate.cabalAlive")
              }
              reason={
                !val(s, "PleaHook.seeded")
                  ? "Trading is not open yet."
                  : !val(s, "CabalGate.cabalAlive")
                    ? "The Cabal is dead. New pleas and appeals are closed."
                    : !result.ok
                      ? "Fix the text checks."
                      : undefined
              }
            />
          </Panel>
          <Panel title="After you send">
            <p>
              Watch the Wall or your Profile. The letter’s PLEA waits in escrow.
              A runner can deliver an approved sale within the sell window; you
              can also sell it yourself.
            </p>
            <p>
              Denied, no verdict or lapsed: settle returns the escrow and runner
              tip. The oracle fee is spent.
            </p>
            <a className="link-btn" href="#/profile">
              Your profile <Icon name="arrow-right" />
            </a>
          </Panel>
        </div>
      </section>
      <LetterDetails />
    </div>
  );
}
function VaultClaim({
  vault,
  claims,
  open,
}: {
  vault: Address;
  claims: any[] | undefined;
  open: boolean;
}) {
  const { r, s } = useApp();
  const entry = claims?.find(
    (c) => c.account.toLowerCase() === vault.toLowerCase(),
  );
  const status = useRead(
    () => read(r, "PleaDistributor", "isClaimed", [BigInt(entry.index)]),
    [entry?.index],
    !!entry && !!s,
  );
  const tx = useTx();
  return (
    <div className="stack stack--sm">
      {entry ? (
        <Action
          {...tx}
          label={`Claim ${tokenAmount(BigInt(entry.amount), s)} to the vault`}
          primary={false}
          onRun={() =>
            tx.send("PleaDistributor", "claim", [
              BigInt(entry.index),
              entry.account,
              BigInt(entry.amount),
              entry.proof,
            ])
          }
          disabled={!tx.ready || !open || status.data !== false}
          reason={
            status.data
              ? "This vault already claimed."
              : "The PLEA lands on the vault."
          }
        />
      ) : (
        <p className="small">
          {open && claims
            ? "This vault is not on the published list."
            : "The claim list is not open yet."}
        </p>
      )}
    </div>
  );
}
export function Claim() {
  const { r, s, toast } = useApp();
  const { address } = useAccount();
  const [input, setInput] = useState(address || "");
  const [target, setTarget] = useState<string>();
  const [claims, setClaims] = useState<any[]>();
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const root = val(s, "PleaDistributor.merkleRoot");
  const isOpen = root && root !== "0x" + "0".repeat(64);
  useEffect(() => {
    if (address && !input) setInput(address);
  }, [address]);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    fetch("./" + APP.claimsPath)
      .then((r) => {
        if (!r.ok)
          throw Error(
            "The published claims.json file is not available yet. Load the published list below.",
          );
        return r.json();
      })
      .then((x) => {
        if (active) setClaims(normalizeClaims(x));
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);
  const entry = claims?.find(
    (c) => c.account.toLowerCase() === target?.toLowerCase(),
  );
  const status = useRead(
    () => read(r, "PleaDistributor", "isClaimed", [BigInt(entry.index)]),
    [entry?.index, target],
    !!entry && !!s,
  );
  const tx = useTx(target);
  const delegated = useRead(
    () =>
      r.client.readContract({
        address: APP.delegateRegistry,
        abi: registryAbi,
        functionName: "getIncomingDelegations",
        args: [address!],
      }),
    [address],
    !!address && !!s,
  );
  return (
    <div className="stack stack--lg">
      <Title title="Claim PLEA">
        The swarm’s allocation and airdrop. Anyone can send a claim for any
        listed address; the PLEA always goes to that address.
      </Title>
      <div className="split">
        <div className="stack stack--lg">
          <Panel card title="Check an address">
            {s && !isOpen ? (
              <Empty title="The list is not open yet">
                The Merkle root is still zero. Claims will open when the
                published list is committed on chain.
              </Empty>
            ) : (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="claim-address">
                    Address on the list
                  </label>
                  <div className="addr-check">
                    <div className="input input--addr">
                      <input
                        className="input__control claim-input"
                        id="claim-address"
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value.trim());
                          setTarget(undefined);
                        }}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={!!input && !isAddress(input)}
                        aria-describedby="claim-hint"
                      />
                    </div>
                    <button
                      className="btn"
                      disabled={!isAddress(input) || loading || !claims}
                      onClick={() => setTarget(input)}
                    >
                      Check
                    </button>
                  </div>
                  <p className="field__hint" id="claim-hint">
                    Any address works. The PLEA goes to this address, whoever
                    sends the claim.
                  </p>
                  {input && !isAddress(input) && (
                    <p className="bad-text">
                      That is not an address. Paste a full 0x address.
                    </p>
                  )}
                </div>
                {loading && (
                  <p className="loading-label">Reading the claim list…</p>
                )}
                {loadError && (
                  <Notice title="Cannot read the list" kind="warn">
                    <p>{loadError}</p>
                  </Notice>
                )}
                {loadError && (
                  <label className="field__label">
                    Load published claims.json
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={async (e) => {
                        try {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const list = normalizeClaims(
                            JSON.parse(await f.text()),
                          );
                          if (!list.length) throw Error();
                          setClaims(list);
                          setLoadError("");
                          toast?.({
                            text: "Claim list loaded. Every claim is checked against the root before signing.",
                          });
                        } catch {
                          setLoadError(
                            "This file is not a valid claim list. Choose the published claims.json.",
                          );
                        }
                      }}
                    />
                  </label>
                )}
                {target &&
                  (entry ? (
                    <>
                      <Notice
                        title={
                          status.loading
                            ? "Checking chain…"
                            : status.data
                              ? "Already claimed"
                              : `${tokenAmount(BigInt(entry.amount), s)} claimable`
                        }
                        kind={status.data ? "info" : "ok"}
                      >
                        <p className="mono addr__text">{target}</p>
                      </Notice>
                      <Action
                        {...tx}
                        label={`Claim ${tokenAmount(BigInt(entry.amount), s)}`}
                        onRun={() =>
                          tx.send("PleaDistributor", "claim", [
                            BigInt(entry.index),
                            entry.account,
                            BigInt(entry.amount),
                            entry.proof,
                          ])
                        }
                        disabled={
                          !tx.ready ||
                          !!status.data ||
                          status.loading ||
                          status.data === undefined
                        }
                        reason={
                          status.data
                            ? "The allocation has already been claimed."
                            : "Gas only. PLEA lands on the listed account."
                        }
                      />
                    </>
                  ) : (
                    <Empty title="Not on the list">
                      This address has no allocation in the published list.
                    </Empty>
                  ))}
              </>
            )}
          </Panel>
          <Panel title="Delegated vaults">
            <p className="small">
              Read from delegate.xyz v2. Claim from this wallet; the PLEA lands
              on the vault, which never connects.
            </p>
            {!address ? (
              <p>Connect in the top bar to list your delegated vaults.</p>
            ) : delegated.loading ? (
              <p>Reading delegated vaults…</p>
            ) : delegated.error ? (
              <Notice kind="warn" title="Cannot read delegations">
                <p>
                  The Sepolia registry did not answer. You can still check and
                  claim any vault address above.
                </p>
              </Notice>
            ) : delegated.data?.length ? (
              <div className="stack">
                {Array.from(new Set(delegated.data.map((d) => d.from))).map(
                  (vault) => (
                    <div className="panel stack stack--sm" key={vault}>
                      <AddressView address={vault} label="vault" />
                      <VaultClaim
                        vault={vault}
                        claims={claims}
                        open={!!isOpen}
                      />
                      <button
                        className="btn"
                        disabled={!isOpen}
                        onClick={() => {
                          setInput(vault);
                          setTarget(vault);
                        }}
                      >
                        Check claim for this vault
                      </button>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p>No delegations found.</p>
            )}
            <AddressView
              address={APP.delegateRegistry}
              label="delegate.xyz registry"
            />
          </Panel>
        </div>
        <Panel title="About the list">
          <p>
            The root can be set once. Once set, no allocation can be added,
            changed or removed.
          </p>
          <Costs
            rows={[
              ["Root", isOpen ? short(root) : s ? "Not set" : "Reading…"],
              [
                "Claims on loaded list",
                claims ? String(claims.length) : "Not published yet",
              ],
              ["Token supply", tokenAmount(val(s, "PLEA.totalSupply"), s)],
            ]}
          />
          <p className="small">
            Each claim emits Claimed(index, account, amount). Its Sepolia
            Etherscan transaction is your receipt. Claimed PLEA has no buy
            record; the contract scores it from the trading start.
          </p>
          <AddressView
            address={r.addresses.PleaDistributor}
            label="PleaDistributor"
          />
        </Panel>
      </div>
    </div>
  );
}
export function Profile({ target }: { target?: string }) {
  const { r, s, now } = useApp();
  const { address } = useAccount();
  const wallet = target && isAddress(target) ? (target as Address) : address;
  const mine = !!wallet && wallet.toLowerCase() === address?.toLowerCase();
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const tx = useTx(name);
  const info = useRead(
    async () => {
      const [plea, pair, basis, current, seat, claimBalance, status] =
        await Promise.all([
          read(r, "PLEA", "balanceOf", [wallet]),
          read(r, "PairToken", "balanceOf", [wallet]),
          read(r, "PleaHook", "basisOf", [wallet]),
          read(r, "Letterbox", "nameOf", [wallet]),
          read(r, "Seasons", "holdsSeat", [wallet]),
          r.client.readContract({
            address: r.network.uniswapV4.poolManager,
            abi: claimsAbi,
            functionName: "balanceOf",
            args: [wallet!, BigInt(r.addresses.PairToken)],
          }),
          read(r, "Letterbox", "status", [wallet]),
        ]);
      return { plea, pair, basis, current, seat, claimBalance, status };
    },
    [wallet],
    !!wallet && !!s,
  );
  useEffect(() => {
    if (info.data && !dirty) setName(info.data.current);
  }, [info.data, dirty]);
  const owner = useRead(
    () => read(r, "Letterbox", "nameOwner", [keccak256(stringToHex(name))]),
    [name],
    !!s && textCheck("name", name).ok && !!name,
  );
  const taken =
    !!owner.data &&
    owner.data !== zeroAddress &&
    owner.data.toLowerCase() !== wallet?.toLowerCase();
  const pleas =
    s?.pleas.filter((p) => p.seller.toLowerCase() === wallet?.toLowerCase()) ||
    [];
  return (
    <div className="stack stack--lg">
      <Title
        title={info.data?.current || (wallet ? short(wallet) : "Your profile")}
      >
        Your wallet as PLEA sees it: holdings, your buy record, name, pleas and
        seasons.
      </Title>
      {wallet ? (
        <>
          <AddressView address={wallet} label="profile" />
          {info.data?.seat && (
            <div>
              <span className="badge badge--seat">
                SEAT ×{Number(con(s, "Seasons.SEAT_MULTIPLIER_BPS")) / 10000}
              </span>
            </div>
          )}
          <div className="stats stats--4">
            {[
              ["PLEA", tokenAmount(info.data?.plea, s)],
              [
                s?.constants.pairSymbol || "Fee token",
                tokenAmount(info.data?.pair, s, true),
              ],
              [
                "Cashback earned",
                !s?.historyError && s
                  ? tokenAmount(cashback(s.logs, wallet), s, true)
                  : "History incomplete",
              ],
              [
                "PoolManager claims",
                tokenAmount(info.data?.claimBalance, s, true),
              ],
            ].map(([label, v]) => (
              <div className="stat" key={label}>
                <span className="stat__label">{label}</span>
                <span className="stat__value">{v}</span>
              </div>
            ))}
          </div>
          {info.data?.status && (
            <Notice>
              <p>{info.data.status}</p>
            </Notice>
          )}
          <div className="split">
            <Panel title="Your buy record">
              <Costs
                rows={
                  info.data
                    ? [
                        [
                          "Cost basis",
                          info.data.basis[1] > 0n
                            ? tokenAmount(
                                (info.data.basis[0] * 10n ** 24n) /
                                  info.data.basis[1],
                                s,
                                true,
                              ) + " per 1M"
                            : "No buy record",
                        ],
                        [
                          "Held, buy-weighted",
                          info.data.basis[2] > 0n
                            ? duration(now - Number(info.data.basis[2]))
                            : "No buy record",
                        ],
                        [
                          "ERC-6909 claims",
                          tokenAmount(info.data.claimBalance, s, true),
                        ],
                      ]
                    : []
                }
              />
              <p className="small">
                Opening buys may return{" "}
                {s?.constants.pairSymbol || "paired-token"} claims on the
                PoolManager. These are separate from your ERC-20 balance.
              </p>
              <a className="btn" href="#/plead">
                Check your next plea
              </a>
            </Panel>
            {mine && (
              <Panel card title="Display name">
                <TextBox
                  kind="name"
                  label="Display name"
                  value={name}
                  onChange={(x) => {
                    setName(x);
                    setDirty(true);
                  }}
                  currentName={info.data?.current}
                />
                {taken && (
                  <p className="bad-text">
                    That name belongs to another wallet. Choose another name.
                  </p>
                )}
                <Action
                  {...tx}
                  label="Save name"
                  onRun={() => tx.send("Letterbox", "setName", [name])}
                  disabled={
                    !tx.ready ||
                    !textCheck("name", name).ok ||
                    name === info.data?.current ||
                    taken ||
                    owner.loading
                  }
                  reason={
                    name === info.data?.current
                      ? "This is your current name"
                      : taken
                        ? "Choose another name."
                        : undefined
                  }
                />
                <button
                  className="link-btn"
                  disabled={!info.data?.current || tx.busy}
                  onClick={() => {
                    setName("");
                    setDirty(true);
                  }}
                >
                  Clear name
                </button>
                <p className="small">
                  Names are unique. Reserved: cabal, admin, imd, plea, owner. An
                  empty name clears it when saved.
                </p>
              </Panel>
            )}
          </div>
          <ProfileDetails wallet={wallet} balance={info.data?.plea} />
          <section className="section">
            <div className="section__head">
              <h2>{mine ? "Your" : "Their"} pleas</h2>
              <a href={`#/wall?wallet=${wallet}`}>All pleas for this wallet</a>
            </div>
            {pleas.length ? (
              <div className="wall-grid">
                {pleas.map((p) => (
                  <PleaCard key={String(p.id)} p={p} />
                ))}
              </div>
            ) : (
              <Empty title="No pleas yet">
                When this wallet makes its case, it appears here.
              </Empty>
            )}
          </section>
        </>
      ) : (
        <Empty title="Your case file awaits">
          Connect in the top bar to see your profile and set your name.
        </Empty>
      )}
    </div>
  );
}
