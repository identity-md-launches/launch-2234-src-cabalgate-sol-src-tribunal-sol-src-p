import { LETTERBOX, Q96 } from "./models";
import { HowItWorks, ContractsPanel } from "./home-info";
import { HomeDetails, LetterDetails, BuyWallPanel } from "./details";
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
  feeInPleaText,
  signedPercent,
  clock,
  span,
  deadman,
  seasonState,
  potOf,
  smallAmount,
  verifyClaim,
  cashback,
  con,
  courtCounts,
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
  HeroPlea,
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
  const { r, s, now } = useApp(),
    symbol = s?.constants.symbol || "PLEA",
    dead = !!val(s, "CabalGate.diedAt"),
    season = seasonState(s, now),
    seeded = !!val(s, "PleaHook.seeded");
  const latest = s?.court.latestVerdict || s?.pleas[0],
    price = BigInt(val(s, "PleaHook.priceX96") || 0n),
    previous = BigInt(val(s, "PleaHook.price24hAgo") || 0n),
    hourly = BigInt(val(s, "PleaHook.latestPrice") || 0n),
    supply = BigInt(val(s, "PLEA.totalSupply") || 0n),
    total = BigInt(con(s, "PLEA.TOTAL_SUPPLY") || 0n);
  const court = courtCounts(s, now);
  const count = Number(val(s, "CabalGate.nextId") || 1n) - 1,
    trend = !previous
      ? "no 24h price yet, counts as flat"
      : `24h ${signedPercent((Number(hourly) * 100) / Number(previous) - 100)}${dead ? "" : `, counts as ${hourly > (previous * 102n) / 100n ? "up" : hourly * 100n >= previous * 98n ? "flat" : "down"}`}`;
  return (
    <>
      <div className={latest ? "split hero" : "hero"}>
        <div className="stack stack--lg">
          <div>
            <div className="page-title">
              <h1 className="hero-title">
                <span className="hero-line">Buying is open.</span> Selling{" "}
                {dead ? (
                  "is open forever."
                ) : (
                  <>
                    needs <span className="nowrap">a plea.</span>
                  </>
                )}
              </h1>
            </div>
            <p className="lead">
              {symbol} is a meme token on Uniswap v4.{" "}
              {dead
                ? "The Cabal is dead, so buying and selling are open to everyone, forever."
                : `To sell, you write why, and the Cabal, ${con(s, "CabalGate.PANEL_SIZE")} judges on an IMD oracle panel, scores it from 0 to ${con(s, "CabalGate.MAX_PLEA_SCORE")}.`}
            </p>
          </div>
          <div className="btn-row">
            <a className="btn btn--primary" href="#/buy">
              {dead ? "Buy or sell PLEA" : `Buy ${symbol}`}
            </a>
            <a className="btn" href={dead ? "#/wall" : "#/plead"}>
              {dead ? "See the Wall" : "Plead to sell"}
            </a>
          </div>
          <TradingGate />
        </div>
        {latest && <HeroPlea p={latest} />}
      </div>
      <section className="section" aria-label="Live numbers">
        <div className="stats">
          {[
            [
              "Price · 1M PLEA",
              seeded
                ? tokenAmount((price * 10n ** 24n) / 2n ** 96n, s, true)
                : "Not open yet",
              seeded
                ? trend
                : `Opens from ${clock(Number(con(s, "PleaLaunch.START")))}`,
            ],
            [
              "Market cap",
              tokenAmount((supply * price) / 2n ** 96n, s, true, 0),
              `Supply ${tokenAmount(supply, s)}`,
            ],
            [
              "PLEA burned",
              amount(total - supply),
              `Of ${amount(total)} at launch`,
            ],
            [
              "Pleas",
              String(count),
              dead
                ? "Final count: no new pleas"
                : court
                  ? `${court.approved} approved, ${court.denied} denied, ${court.noVerdict} no verdict, ${court.pending} pending`
                  : "Court totals are unavailable until history finishes loading.",
            ],
            [
              "Season prize pot",
              tokenAmount(potOf(s), s, true),
              season
                ? `${season.displayed < BigInt(con(s, "Seasons.BONUS_SEASONS")) ? `+ ${tokenAmount(con(s, "Seasons.BONUS_PER_SEASON"), s)}; ` : ""}${dead ? (season.current.closed ? `Season ${season.displayed + 1n} was the last.` : `close season ${season.displayed + 1n} from ${clock(Number(season.current.bounds[2]) + Number(con(s, "Seasons.CLOSE_GRACE")))}`) : `season ${season.displayed + 1n} ends in ${duration(Number(season.current.bounds[2]) - now)}`}${season.awaiting !== undefined && season.awaiting < season.displayed ? `; plus what season ${season.displayed} rolls over at its close` : ""}`
                : "The first season begins when trading opens",
            ],
            [
              "Cabal",
              seeded ? (
                <span className="status-item">
                  <span
                    className={`live-dot ${dead ? "live-dot--dead" : ""}`}
                    aria-hidden="true"
                  />
                  {dead ? "Dead" : "Alive"}
                </span>
              ) : (
                "Not started"
              ),
              !seeded
                ? "Begins when trading opens"
                : dead
                  ? `No verdict for ${span(Number(con(s, "CabalGate.DEADMAN")))}: trades freely forever`
                  : `Dies in ${deadman(Number(val(s, "CabalGate.lastVerdictAt")) + Number(con(s, "CabalGate.DEADMAN")) - now)} without a verdict`,
            ],
          ].map(([label, value, note], i) => (
            <div className="stat" key={i}>
              <span className="stat__label">{label}</span>
              <span className="stat__value">
                {typeof value === "string" &&
                value.endsWith(` ${s?.constants.pairSymbol}`) ? (
                  <>
                    <span className="nowrap">
                      {value.slice(0, -(s!.constants.pairSymbol.length + 1))}
                    </span>{" "}
                    <span className="nowrap small">
                      {s!.constants.pairSymbol}
                    </span>
                  </>
                ) : (
                  <span className="nowrap">{value}</span>
                )}
              </span>
              <span className="stat__note">{note}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section__head">
          <h2>Latest verdicts</h2>
          <p className="meta">
            Newest plea first, read from the chain; times are when each plea was
            sent
          </p>
        </div>
        {s?.pleas.length ? (
          <>
            <div className="wall-grid">
              {s.pleas.slice(0, 6).map((p) => (
                <PleaCard key={String(p.id)} p={p} />
              ))}
            </div>
            <a className="btn form-actions-top" href="#/wall">
              See the whole Wall <Icon name="arrow-right" />
            </a>
          </>
        ) : (
          <Empty
            icon="scales"
            title="No pleas yet"
            action={
              seeded && !dead
                ? { href: "#/plead", label: "Write the first plea" }
                : undefined
            }
          >
            {seeded
              ? "Every verdict lands here, newest first. The court is in session; the judges are filing their nails."
              : "The first case will be heard when trading opens."}
          </Empty>
        )}
      </section>
      <HowItWorks />
      <HomeDetails />
      <ContractsPanel />
    </>
  );
}

export function Letters() {
  const { r, s, toast } = useApp();
  const { address } = useAccount();
  const [text, setText] = useState("");
  const tx = useTx(text);
  const result = textCheck("letter", text);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(false);
  }, [text]);
  if (val(s, "CabalGate.diedAt"))
    return (
      <>
        <Title title="Plead by letter" />
        <Empty
          icon="envelope-simple"
          title="The Letterbox is closed"
          action={{ href: "#/buy", label: "Sell on the Buy page" }}
        >
          The Cabal is dead. Pleas and appeals are closed; PLEA trades freely
          forever.
        </Empty>
      </>
    );
  return (
    <>
      <div className="split">
        <div className="stack">
          <Title title="Plead by letter">
            No site needed. Send your plea as a plain message to the Letterbox,
            from Sepolia Etherscan or your wallet.
          </Title>
          <p className="meta">
            Same judges, same score, same need as a plea from the site. If the
            Cabal approves, anyone may sell it for you within{" "}
            {span(Number(con(s, "CabalGate.EXECUTE_WINDOW") || 420))}, or you
            send SELL and keep the {tokenAmount(LETTERBOX.TIP, s, true)} tip.
          </p>
          <TradingGate />
        </div>
        <Panel card level={2} title="The Letterbox">
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
            come out of your PLEA:{" "}
            {tokenAmount(
              BigInt(con(s, "CabalGate.ORACLE_FEE") || 0n) + LETTERBOX.TIP,
              s,
              true,
            )}
            ,{" "}
            {feeInPleaText(
              s,
              BigInt(con(s, "CabalGate.ORACLE_FEE") || 0n) + LETTERBOX.TIP,
            )}
            . ETH pays only gas.
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
            <Costs
              rows={[
                ["Tab", "Contract › Write Contract"],
                ["Function", "letter(text)"],
                ["text", "your letter, in plain words"],
              ]}
            />
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
            <p>
              For example, NAME mira_eth is{" "}
              <code className="addr__text">{stringToHex("NAME mira_eth")}</code>
              .
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
              `A new plea for 20% of your PLEA (at most ${tokenAmount(con(s, "CabalGate.MAX_SELL"), s)}). If approved, anyone may sell it for you within ${span(Number(con(s, "CabalGate.EXECUTE_WINDOW")))} and earns the ${tokenAmount(LETTERBOX.TIP, s, true)} tip. On the Wall it carries the BY LETTER badge.`,
            ],
            [
              "APPEAL <text>",
              `Appeals your latest denied plea within its ${span(Number(con(s, "CabalGate.COOLDOWN")))}, for the same share of your PLEA. It costs ${tokenAmount(BigInt(con(s, "CabalGate.ORACLE_FEE")) + BigInt(con(s, "CabalGate.APPEAL_POOL_SHARE")) + LETTERBOX.TIP, s, true)} in PLEA: ${tokenAmount(con(s, "CabalGate.APPEAL_POOL_SHARE"), s, true)} more, to the buy wall.`,
            ],
            [
              "SELL",
              `Sells your approved letter plea yourself, within its ${span(Number(con(s, "CabalGate.EXECUTE_WINDOW")))} and if nobody has yet, and the ${tokenAmount(LETTERBOX.TIP, s, true)} tip comes back to you.`,
            ],
            [
              "NAME <name>",
              "Sets your display name: 3 to 20 characters, only lower-case a–z, digits 0–9 and _. NAME alone clears it.",
            ],
          ].map(([a, b]) => (
            <li className="cmd" key={a}>
              <span className="cmd__word">{a}</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>
      <Notice title="Commands are matched in capitals, at the very start.">
        <p>
          “SELL me some mercy” is read as SELL, not as a plea. To plead, start
          with another word.
        </p>
      </Notice>
      <section className="section">
        <div className="section__head">
          <h2>Try your letter</h2>
        </div>
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
                    toast?.({ kind: "info", text: "Hex data copied." });
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    setCopied(false);
                    toast?.({
                      kind: "bad",
                      text: "Copy did not work here: select the text and copy it.",
                    });
                  }
                }}
              >
                {copied ? "Copied" : "Copy hex data"}
              </button>
            </div>
            <Action
              connectText="Connect in the top bar to send a letter."
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
      <Notice kind="warn" title="Never tell the judges how to score.">
        <p>
          Demands like “give me 45” count as manipulation and score 0. Write an
          honest plea instead.
        </p>
      </Notice>
    </>
  );
}
function VaultClaim({
  vault,
  claims,
  open,
  loading,
  loadError,
}: {
  vault: Address;
  claims: any[] | undefined;
  open: boolean;
  loading: boolean;
  loadError: string;
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
      <Costs
        rows={[
          ["Vault", <AddressView address={vault} label="vault" shortDisplay />],
          ["Claimable", entry ? tokenAmount(BigInt(entry.amount), s) : "—"],
        ]}
      />
      {entry && status.data ? (
        <>
          <Notice title={`Already claimed for the vault ${short(vault)}.`}>
            <p>The allocation was paid to the vault.</p>
          </Notice>
          <ClaimReceipt index={entry.index} />
        </>
      ) : entry ? (
        <Action
          connectText="Connect in the top bar to send a claim. Any wallet will do: it only pays the gas."
          {...tx}
          label={`Claim ${tokenAmount(BigInt(entry.amount), s)} to the vault`}
          sub="gas only"
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
          {!open
            ? "The claim list is not open yet."
            : loading
              ? "Reading the claim list…"
              : loadError
                ? "Can’t check this vault: the claim list did not load. Try again above."
                : claims
                  ? "This vault is not on the published list."
                  : "Reading the claim list…"}
        </p>
      )}
      <p className="small">
        Sent from this hot wallet; the PLEA lands on the vault, which never
        connects.
      </p>
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
  const [reload, setReload] = useState(0);
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
        if (active) {
          const entries = normalizeClaims(x).filter((c) =>
            verifyClaim(c, root),
          );
          if (!entries.length)
            throw Error(
              "The file has no allocation with a valid proof for the on-chain root.",
            );
          setClaims(entries);
          setLoadError("");
        }
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
  }, [isOpen, reload]);
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
    <>
      <Title title="Claim your PLEA">
        12% of PLEA (
        {tokenAmount(
          (BigInt(con(s, "PLEA.TOTAL_SUPPLY") || 0n) * 12n) / 100n,
          s,
        )}
        ) went to a claim list: the IMD swarm’s 10% and a 2% airdrop. Anyone can
        send a claim for any address, and the PLEA always goes to the address on
        the list.
      </Title>
      <div className="split">
        <div className="stack stack--lg">
          <Panel card level={2} title="Check an address">
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
                    <div
                      className={`input input--addr ${input && !isAddress(input) ? "is-invalid" : ""}`}
                    >
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
                        aria-describedby={
                          input && !isAddress(input)
                            ? "claim-address-error"
                            : "claim-hint"
                        }
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
                    <p
                      className="field__hint bad-text"
                      id="claim-address-error"
                    >
                      That is not an address. Paste one that starts with 0x and
                      has 40 more characters, 0–9 and a–f in either case.
                    </p>
                  )}
                </div>
                {loading && (
                  <p className="loading-label">Reading the claim list…</p>
                )}
                {loadError && (
                  <div className="error-box" role="alert">
                    <p className="error-box__title">Can’t check the list</p>
                    <p className="small">{loadError}</p>
                    <div className="btn-row">
                      <button
                        className="btn btn--sm"
                        onClick={() => {
                          setLoadError("");
                          setReload((n) => n + 1);
                        }}
                      >
                        <Icon name="arrow-clockwise" />
                        Try again
                      </button>
                    </div>
                  </div>
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
                          ).filter((c) => verifyClaim(c, root));
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
                              : `${tokenAmount(BigInt(entry.amount), s)} claimable (claim #${entry.index})`
                        }
                        kind={status.data ? "info" : "ok"}
                      >
                        <AddressView address={target} label="recipient" />
                        {status.data && <ClaimReceipt index={entry.index} />}
                      </Notice>
                      <Action
                        connectText="Connect in the top bar to send a claim. Any wallet will do: it only pays the gas."
                        {...tx}
                        label={`Claim ${tokenAmount(BigInt(entry.amount), s)}`}
                        sub="gas only"
                        block
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
          <Panel level={2} title="Delegated vaults" flush meta="delegate.xyz">
            <p className="small">
              Read from delegate.xyz v2. Claim from this wallet; the PLEA lands
              on the vault, which never connects.
            </p>
            {!address ? (
              <p>Connect in the top bar to list your delegated vaults.</p>
            ) : delegated.loading ? (
              <div className="stack" aria-busy="true">
                <p className="loading-label">
                  <Icon name="hourglass" />
                  Reading the delegate.xyz registry for {short(address)}…
                </p>
                <div
                  className="skeleton__line skeleton__line--mid"
                  aria-hidden="true"
                />
              </div>
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
                    <div className="stack stack--sm" key={vault}>
                      <VaultClaim
                        vault={vault}
                        claims={claims}
                        open={!!isOpen}
                        loading={loading}
                        loadError={loadError}
                      />
                    </div>
                  ),
                )}
              </div>
            ) : (
              <Empty
                icon="wallet"
                title="No delegated vaults"
                action={{
                  href: "https://delegate.xyz",
                  label: "Open delegate.xyz",
                }}
              >
                No vault has delegated to this wallet on Sepolia.
              </Empty>
            )}
            <p className="label">Read from the delegate.xyz registry</p>
            <AddressView
              address={APP.delegateRegistry}
              label="delegate.xyz registry"
            />
          </Panel>
        </div>
        <Panel
          level={2}
          title="About the list"
          flush
          meta={isOpen ? "Final" : "Not set"}
        >
          <RootDate />
          <p>
            The root can be set once. Once set, no allocation can be added,
            changed or removed.
          </p>
          <Costs
            rows={[
              ["Root", isOpen ? short(root) : s ? "Not set" : "Reading…"],
              [
                "Claims on the list",
                claims ? String(claims.length) : "Not published yet",
              ],
              [
                "Claimed so far",
                String(
                  s?.logs.filter((l) => l.eventName === "Claimed").length || 0,
                ),
              ],
              [
                "Still open",
                claims
                  ? String(
                      Math.max(
                        0,
                        claims.length -
                          (s?.logs.filter((l) => l.eventName === "Claimed")
                            .length || 0),
                      ),
                    )
                  : "List not published yet",
              ],
              [
                "IMD swarm (10%)",
                tokenAmount(
                  (BigInt(con(s, "PLEA.TOTAL_SUPPLY") || 0n) * 10n) / 100n,
                  s,
                ),
              ],
              [
                "Airdrop (2%)",
                tokenAmount(
                  (BigInt(con(s, "PLEA.TOTAL_SUPPLY") || 0n) * 2n) / 100n,
                  s,
                ),
              ],
              [
                "In all (12%)",
                tokenAmount(
                  (BigInt(con(s, "PLEA.TOTAL_SUPPLY") || 0n) * 12n) / 100n,
                  s,
                ),
              ],
            ]}
          />
          <h3>The receipt</h3>
          <p className="small">
            Each claim emits a receipt on Sepolia. Its Sepolia Etherscan
            transaction is your receipt. Claimed PLEA has no buy record; the
            contract scores it from the trading start.
          </p>
          <h3>Pleading with claimed PLEA</h3>
          <p className="small">
            No buy record: it counts as held since trading opened
            {val(s, "CabalGate.startedAt")
              ? ` (${clock(val(s, "CabalGate.startedAt"))})`
              : ""}
            , profit 10. The regular share limits and need still apply.
          </p>
          <AddressView
            address={r.addresses.PleaDistributor}
            label="PleaDistributor"
          />
        </Panel>
      </div>
    </>
  );
}

function ClaimReceipt({ index }: { index: string }) {
  const { r, s } = useApp(),
    log = s?.logs.find(
      (l) =>
        l.eventName === "Claimed" && BigInt(l.args.index) === BigInt(index),
    ),
    date = useRead(
      () => r.client.getBlock({ blockNumber: log!.blockNumber }),
      [log?.transactionHash],
      !!log,
    );
  return log ? (
    <p className="small">
      Claimed {date.data ? clock(date.data.timestamp) : "on Sepolia"}.{" "}
      <a href={`${r.network.explorer}/tx/${log.transactionHash}`}>
        View the receipt
      </a>
    </p>
  ) : null;
}
function RootDate() {
  const { r, s } = useApp(),
    log = s?.logs.find((l) => l.eventName === "RootSet"),
    date = useRead(
      () => r.client.getBlock({ blockNumber: log!.blockNumber }),
      [log?.transactionHash],
      !!log,
    );
  return date.data ? (
    <p className="small">
      The final list was set at {clock(date.data.timestamp)}.
    </p>
  ) : null;
}
