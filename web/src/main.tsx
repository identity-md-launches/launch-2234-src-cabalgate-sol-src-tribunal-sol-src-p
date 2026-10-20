import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { loadConfig } from "./config";
import { DataProvider } from "./context";
import "./design/tokens.css";
import "./design/components.css";
import "./site.css";
const root = createRoot(document.getElementById("root")!);
root.render(
  <main className="page main">
    <h1>PLEA</h1>
    <p>Loading the Sepolia deployment…</p>
  </main>,
);
loadConfig()
  .then((r) =>
    root.render(
      <WagmiProvider config={r.walletConfig}>
        <QueryClientProvider client={new QueryClient()}>
          <DataProvider r={r}>
            <App />
          </DataProvider>
        </QueryClientProvider>
      </WagmiProvider>,
    ),
  )
  .catch(() =>
    root.render(
      <main className="page main stack">
        <h1>PLEA</h1>
        <div className="error-box">
          <p>
            The deployment configuration could not be loaded or verified.
            Transactions are disabled.
          </p>
          <button className="btn" onClick={() => location.reload()}>
            Reload deployment
          </button>
        </div>
      </main>,
    ),
  );
