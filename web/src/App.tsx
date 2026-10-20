import { useEffect, useState } from "react";
import { useApp } from "./context";
import { con, duration, tokenAmount, utc, val } from "./chain";
import { Icon, Notice } from "./components";
import { Wallet } from "./wallet";
import { Buy, Plead } from "./pages-trade";
import { Home, Letters, Claim, Profile } from "./pages-info";
import { Wall, PleaPage, Objections, Seasons } from "./pages-court";
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
  const { r, s, error, refresh, now } = useApp();
  const [hash, setHash] = useState(location.hash || "#/");
  const [menu, setMenu] = useState(false);
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
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handle);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("hashchange", handle);
      window.removeEventListener("keydown", esc);
    };
  }, []);
  useEffect(() => {
    document.title = `${page ? `${page === "p" ? "Plea #" + path[1] : page.charAt(0).toUpperCase() + page.slice(1)} · ` : ""}PLEA · Sepolia test run 9`;
    const anchor =
      page === "how" ? "how" : page === "contracts" ? "contracts" : "";
    if (anchor)
      setTimeout(() => document.getElementById(anchor)?.scrollIntoView(), 100);
  }, [hash]);
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
      <Icon name={theme === "dark" ? "sun" : "moon"} />
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
              <li>
                <a href="#/profile">Profile</a>
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
              <span
                className={`live-dot ${dead || !s?.v["PleaHook.seeded"] ? "live-dot--dead" : ""}`}
                aria-hidden="true"
              />
              <b>
                {!s
                  ? "Reading the Cabal…"
                  : !s.v["PleaHook.seeded"]
                    ? "Trading not open yet"
                    : dead
                      ? "Cabal dead"
                      : "Cabal alive"}
              </b>
              {s?.v["PleaHook.seeded"] && !dead
                ? ` · dies in ${duration(Number(val(s, "CabalGate.lastVerdictAt")) + Number(con(s, "CabalGate.DEADMAN")) - now)} without a verdict`
                : ""}
            </span>
            {s?.v["PleaHook.seeded"] && (
              <>
                <span className="status-item">
                  <b>Season {Number(val(s, "Seasons.currentSeason")[1]) + 1}</b>{" "}
                  · pot {tokenAmount(val(s, "Seasons.pot"), s, true)}
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
              {duration(Number(con(s, "CabalGate.DEADMAN")))}. PLEA trades
              freely forever. Pleas and objections are closed; sell on the Buy
              page.
            </span>
          </div>
        </div>
      )}
      <main id="main" className="page main" tabIndex={-1}>
        {error && (
          <div className="app-error error-box" role="alert">
            <p className="error-box__title">Cannot read Sepolia</p>
            <p>{error}</p>
            <button className="btn btn--sm" onClick={refresh}>
              Try again
            </button>
          </div>
        )}
        {s?.historyError && (
          <div className="app-error">
            <Notice kind="warn" title="History is incomplete">
              <p>{s.historyError}</p>
              <button className="link-btn" onClick={refresh}>
                Try history again
              </button>
            </Notice>
          </div>
        )}
        {page === "buy" ? (
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
        ) : (
          <Home />
        )}
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
