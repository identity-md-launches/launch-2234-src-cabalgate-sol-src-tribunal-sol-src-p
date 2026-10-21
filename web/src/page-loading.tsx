import { Icon, Title } from "./components";
export function PageLoading({ page, id }: { page: string; id?: string }) {
  const home = ["", "how", "contracts"].includes(page),
    wall = page === "wall";
  const titles: Record<string, string> = {
    buy: "Buy PLEA",
    plead: "Plead to sell",
    wall: "The Wall",
    seasons: "Seasons",
    objections: "Objection!",
    letters: "Plead by letter",
    claim: "Claim your PLEA",
    profile: "Profile",
    share: "Share cards",
  };
  const lines: Record<string, string> = {
    buy: "Reading the pool…",
    plead: "Reading your balance and buy record from the chain…",
    wall: "Reading pleas from the chain…",
    seasons: "Reading the leaderboard from Seasons…",
    objections: "Reading approvals and objections from the chain…",
    profile: `Reading ${id || "your wallet"}’s balances, pleas and seasons from the chain…`,
    p: `Reading plea #${id} from the chain…`,
  };
  const skeleton = (key: number) => (
    <div key={key} className="panel skeleton" aria-hidden="true">
      <div className="skeleton__line skeleton__line--short" />
      <div className="skeleton__block" />
      <div className="skeleton__line skeleton__line--mid" />
    </div>
  );
  return (
    <div className="page-loading stack stack--lg" aria-busy="true">
      <Title
        title={
          home
            ? "Buying is open. Selling needs a plea."
            : page === "p"
              ? `Plea #${id}`
              : titles[page] || "PLEA"
        }
      />
      {home && (
        <>
          <p className="lead">
            PLEA is a meme token on Uniswap v4. Selling takes a plea while the
            Cabal lives.
          </p>
          <div className="btn-row">
            <a className="btn btn--primary" href="#/buy">
              Buy PLEA
            </a>
            <a className="btn" href="#/plead">
              Plead to sell
            </a>
          </div>
          {skeleton(0)}
        </>
      )}
      <p className="loading-label">
        <Icon name="hourglass" />
        {lines[page] ||
          "Reading the pool, the Cabal and the season from the chain…"}
      </p>
      {home && (
        <>
          <div className="stats">
            {[
              "Price · 1M PLEA",
              "Market cap",
              "PLEA burned",
              "Pleas",
              "Season prize pot",
              "Cabal",
            ].map((label) => (
              <div className="stat" key={label}>
                <span className="stat__label">{label}</span>
                <div className="skeleton__line" />
                <div className="skeleton__line skeleton__line--short" />
              </div>
            ))}
          </div>
          <h2>Latest verdicts</h2>
        </>
      )}
      {home || wall ? (
        <div className="wall-grid loading-wall">{[1, 2, 3].map(skeleton)}</div>
      ) : (
        skeleton(1)
      )}
    </div>
  );
}
