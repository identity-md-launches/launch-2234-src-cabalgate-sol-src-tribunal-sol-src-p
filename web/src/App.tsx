import { PageLoading } from "./page-loading";
import { PageBoundary } from "./page-boundary";
import { resetHealth } from "./config";
import { Profile } from "./profile";
import { Seasons } from "./seasons";
import { useEffect, useState, useRef } from "react";
import { useApp } from "./context";
import {
  con,
  duration,
  tokenAmount,
  utc,
  val,
  seasonState,
  potOf,
  span,
  deadman,
  clock,
} from "./chain";
import { Icon, Notice, Title, Empty } from "./components";
import { Wallet } from "./wallet";
import { Buy, Plead } from "./pages-trade";
import { Home, Letters, Claim } from "./pages-info";
import { Wall, PleaPage, Objections } from "./pages-court";
import { Share } from "./share";
const PAGES = [
  "Buy",
  "Plead",
  "Wall",
  "Seasons",
  "Letters",
  "Objections",
  "Claim",
];
export default function App() {
  const { r, s, error, refresh, now, receipts } = useApp();
  const [hash, setHash] = useState(location.hash || "#/");
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme || "light",
  );
  const path = hash.replace(/^#\/?/, "").split("?")[0].split("/");
  const page = path[0].toLowerCase();
  const dead = s && val(s, "CabalGate.diedAt") > 0n;
  useEffect(() => {
    const handle = () => {
      setHash(location.hash || "#/");
      setMenu(false);
      document.getElementById("main")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handle);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const restore =
          document.getElementById("drawer")?.contains(document.activeElement) ||
          document.activeElement === menuButton.current;
        setMenu(false);
        if (restore) menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("hashchange", handle);
      window.removeEventListener("keydown", esc);
    };
  }, []);
  const pendingAnchor=useRef(""), anchorUntil=useRef(0);
  useEffect(()=>{
    const cancel=()=>{pendingAnchor.current="";};
    window.addEventListener("wheel",cancel,{passive:true});window.addEventListener("touchmove",cancel,{passive:true});window.addEventListener("keydown",cancel);
    return ()=>{window.removeEventListener("wheel",cancel);window.removeEventListener("touchmove",cancel);window.removeEventListener("keydown",cancel);};
  },[]);
  useEffect(() => {
    const titles: Record<string, string> = {
      "": "Selling needs a plea",
      how: "Selling needs a plea",
      contracts: "Selling needs a plea",
      buy: "Buy PLEA",
      plead: "Plead to sell",
      wall: "The Wall",
      seasons: "Seasons",
      letters: "Plead by letter",
      objections: "Objection!",
      claim: "Claim your PLEA",
      profile: "Profile",
      share: "Share cards",
      "share-cards": "Share cards",
    };
    document.title =
      (page === "p" ? `Plea #${path[1]}` : titles[page] || "Page not found") +
      " · PLEA";
    const anchor =
      page === "how"
        ? "how"
        : page === "contracts"
          ? "contracts"
          : page === "seasons" && location.hash.includes("seat=1")
            ? "seat"
            : "";
    pendingAnchor.current = anchor;
    anchorUntil.current=Date.now()+20000;
  }, [hash]);
  useEffect(()=>{
    if(!pendingAnchor.current || Date.now()>anchorUntil.current) return;
    const target=document.getElementById(pendingAnchor.current);
    if(target){target.scrollIntoView();pendingAnchor.current="";}
  },[hash,!!s]);
  useEffect(() => {
    if (menu) document.querySelector<HTMLAnchorElement>("#drawer a")?.focus();
  }, [menu]);
  const season = seasonState(s, now);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.add("no-motion");
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("plea-theme", next);
    } catch {}
    requestAnimationFrame(() =>
      document.documentElement.classList.remove("no-motion"),
    );
  }
  const toggleButton = (
    <button
      className="icon-btn"
      type="button"
      data-theme-toggle
      aria-label="Dark theme"
      aria-pressed={theme === "dark"}
      onClick={toggle}
    >
      <Icon name="moon" />
    </button>
  );
  const links = PAGES.map((p) => (
    <li key={p}>
      <a
        href={`#/${p.toLowerCase()}`}
        aria-current={page === p.toLowerCase() ? "page" : undefined}
      >
        {p}
      </a>
    </li>
  ));
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="page nav">
          <a className="logo" href="#/" aria-label="PLEA home">
            PLEA
          </a>
          <nav className="nav__primary" aria-label="Main">
            <ul className="nav__links">{links}</ul>
          </nav>
          <div className="nav__end">
            {toggleButton}
            <Wallet />
            <button
              ref={menuButton}
              className="icon-btn menu-btn"
              aria-label="Menu"
              aria-expanded={menu}
              aria-controls="drawer"
              onClick={() => setMenu(!menu)}
            >
              <Icon name={menu ? "x" : "list"} />
            </button>
          </div>
        </div>
        <nav className="drawer" id="drawer" aria-label="Pages" hidden={!menu}>
          <div className="page">
            <ul>
              {links}
              <li>
                <a href="#/how">How it works</a>
              </li>
            </ul>
            <div className="theme-row">
              <span>Theme</span>
              {toggleButton}
            </div>
          </div>
        </nav>
        <div className="status-strip">
          <div className="page">
            <span className="status-item test-run">
              <b>Sepolia test run 9 · test tokens, no value</b>
            </span>
            <span className="status-item">
              {s?.v["PleaHook.seeded"] && (
                <span
                  className={`live-dot ${dead || !s?.v["PleaHook.seeded"] ? "live-dot--dead" : ""}`}
                  aria-hidden="true"
                />
              )}
              <b>
                {!s
                  ? error
                    ? "Can’t reach Sepolia"
                    : "Reading the Cabal…"
                  : !s.v["PleaHook.seeded"]
                    ? "Trading not open yet"
                    : dead
                      ? "Cabal dead"
                      : "Cabal alive"}
              </b>
              {s?.v["PleaHook.seeded"] && !dead
                ? ` · dies in ${deadman(Number(val(s, "CabalGate.lastVerdictAt")) + Number(con(s, "CabalGate.DEADMAN")) - now)} without a verdict`
                : dead
                  ? ` · no verdict for ${span(Number(con(s, "CabalGate.DEADMAN")))}`
                  : ""}
            </span>
            {s?.v["PleaHook.seeded"] && (
              <>
                <span className="status-item">
                  {season && (
                    <>
                      <b>Season {String(season.displayed + 1n)}</b> ·{" "}
                      {season.dead
                        ? season.current.closed
                          ? "closed"
                          : `ended with the Cabal · close it from ${clock(Number(season.current.bounds[2]) + Number(con(s, "Seasons.CLOSE_GRACE")))}`
                        : `${duration(Number(season.current.bounds[2]) - now)} left · pot ${tokenAmount(potOf(s), s, true)}${season.displayed < BigInt(con(s, "Seasons.BONUS_SEASONS")) ? ` + ${tokenAmount(con(s, "Seasons.BONUS_PER_SEASON"), s)}` : ""}`}
                    </>
                  )}
                </span>
                <span className="status-item">
                  1M {s.constants.symbol} ={" "}
                  {tokenAmount(
                    val(s, "PleaHook.priceX96")
                      ? (val(s, "PleaHook.priceX96") * 10n ** 24n) / 2n ** 96n
                      : undefined,
                    s,
                    true,
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      </header>
      {dead && (
        <div className="banner" role="status">
          <div className="page">
            <span className="live-dot live-dot--dead" aria-hidden="true" />
            <span>
              The Cabal is dead: no verdict for{" "}
              {span(Number(con(s, "CabalGate.DEADMAN")))}. PLEA trades freely
              forever. Pleas and objections are closed; sell on the Buy page.
            </span>
          </div>
        </div>
      )}
      <main id="main" className="page main" tabIndex={-1}>
        {error && (
          <div className="app-error error-box" role="alert">
            <p className="error-box__title">
              <Icon name="plugs" />
              {page === "buy"
                ? "Can’t read the price"
                : page === "profile"
                  ? "Can’t read this profile"
                  : page === ""
                    ? "Can’t read the latest verdicts"
                    : "Can’t reach Sepolia"}
            </p>
            <p className="small">{error}</p><div className="btn-row"><button className="btn btn--sm" onClick={()=>{resetHealth();void refresh();}}><Icon name="arrow-clockwise"/>Try again</button></div>
          </div>
        )}
        {s?.historyError && (
          <div className="app-error">
            <Notice kind="warn" title="History is incomplete">
              <p>{s.historyError}</p>
              <button className="link-btn" onClick={()=>{resetHealth();void refresh();}}>
                Try history again
              </button>
            </Notice>
          </div>
        )}
        <PageBoundary key={hash}>
        {!s && error ? null : !s ? (<PageLoading page={page} id={path[1]}/>
        ) : page === "buy" ? (
          <Buy />
        ) : page === "plead" ? (
          <Plead />
        ) : page === "wall" ? (
          <Wall />
        ) : page === "seasons" ? (
          <Seasons />
        ) : page === "letters" ? (
          <Letters />
        ) : page === "objections" ? (
          <Objections />
        ) : page === "claim" ? (
          <Claim />
        ) : page === "profile" ? (
          <Profile target={path[1]} />
        ) : page === "p" ? (
          <PleaPage id={path[1] || ""} />
        ) : page === "share" || page === "share-cards" ? (
          <Share id={path[1]} />
        ) : ["", "how", "contracts"].includes(page) ? (
          <Home />
        ) : (
          <>
            <Title title="Page not found" />
            <Empty
              title={`No page at #/${page}`}
              action={{ href: "#/", label: "Go to Home" }}
            >
              Check the link, or pick a page from the menu.
            </Empty>
          </>
        )}
        {receipts.length > 0 && (
          <div
            className="stack form-actions-top"
            aria-label="Confirmed transactions"
          >
            {receipts.map((receipt) => (
              <p className="small" key={receipt.key}>
                {receipt.text}{" "}
                <a href={`${r.network.explorer}/tx/${receipt.hash}`}>
                  View transaction
                </a>
              </p>
            ))}
          </div>
        )}
        </PageBoundary>
      </main>
      <footer className="site-footer">
        <div className="page">
          <p className="fine">
            PLEA is a meme token on Uniswap v4. Buying is open; selling needs a
            plea while the Cabal lives. Not financial advice, and not an
            official IMD page. Sepolia test tokens have no value. Inspired by
            CabalCoin by TokenWorks (2025).
          </p>
          <nav aria-label="Footer">
            <ul>
              <li>
                <a href="#/how">How it works</a>
              </li>
              <li>
                <a href="#/contracts">Contracts</a>
              </li>

              <li>
                <a href="#/profile">Profile</a>
              </li>
              <li>
                <a
                  href="https://x.com/Pleaimd"
                  target="_blank"
                  rel="noreferrer"
                >
                  @Pleaimd on X
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/khaed1/plea"
                  target="_blank"
                  rel="noreferrer"
                >
                  Code
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}
