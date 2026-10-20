/** Bounded browser QA. Reads public config; optional RPC override is for a local fork only. */
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright");
const root = path.resolve("dist"),
  out = path.resolve("test/scratch/run9-browser");
fs.mkdirSync(out, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  const file = path.resolve(
    root,
    decodeURIComponent(new URL(req.url, "http://x").pathname).replace(
      /^\/preview\//,
      "",
    ) || "index.html",
  );
  if (
    !file.startsWith(root + path.sep) ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "content-type",
    mime[path.extname(file)] || "application/octet-stream",
  );
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/preview/`,
  network = JSON.parse(fs.readFileSync("web/network-input.json")).network;
const rpc = process.env.PLEA_QA_RPC || network.rpcUrls[0],
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] }),
  context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [],
  requests = [],
  runs = [];
let count = 0;
await context.route(
  (url) => network.rpcUrls.some((r) => url.href.startsWith(r)),
  async (route) => {
    count++;
    const body = route.request().postData();
    requests.push(JSON.parse(body));
    try {
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: await response.text(),
      });
    } catch (e) {
      await route.fulfill({ status: 503, body: "RPC unavailable" });
    }
  },
);
if (process.env.PLEA_QA_WALLET) {
  await context.addInitScript((account) => {
    const events = new Map(),
      provider = {
        isMetaMask: true,
        on(name, fn) {
          events.set(name, [...(events.get(name) || []), fn]);
        },
        removeListener() {},
        async request({ method, params }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts")
            return [account];
          if (method === "wallet_requestPermissions")
            return [{ parentCapability: "eth_accounts" }];
          if (method === "wallet_getPermissions") return [];
          if (method === "eth_chainId") return "0xaa36a7";
          if (
            method === "wallet_switchEthereumChain" ||
            method === "wallet_addEthereumChain"
          )
            return null;
          return window.pleaForkRequest({ method, params });
        },
      };
    window.ethereum = provider;
    const announce = () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: "fd9ef8ef-3a1d-4af4-b938-6524f5c88e37",
              name: "Fork test wallet",
              icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
              rdns: "test.plea.fork",
            },
            provider,
          },
        }),
      );
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, process.env.PLEA_QA_WALLET);
  await context.exposeFunction(
    "pleaForkRequest",
    async ({ method, params }) => {
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: params || [],
        }),
      });
      const body = await response.json();
      if (body.error) throw Error(body.error.message);
      return body.result;
    },
  );
}
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const axe = fs.readFileSync(
  process.env.PLEA_AXE || path.resolve("web/node_modules/axe-core/axe.min.js"),
  "utf8",
);
const seen = [];
context.on("request", (r) => seen.push(r.url()));
try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Latest verdicts", exact: true })
    .waitFor({ timeout: 90000 });
  assert.equal((await context.cookies()).length, 0);
  assert.ok(
    !seen.some((u) => /cca-lite|cbwsdk|coinbase|walletconnect|reown/i.test(u)),
  );
  const coldHosts = [...new Set(seen.map((u) => new URL(u).host))];
  const headings = [];
  for (const route of [
    "buy",
    "plead",
    "letters",
    "claim",
    "profile",
    "seasons",
    "objections",
    "wall",
  ]) {
    await page.goto(base + "#/" + route);
    await page.waitForTimeout(150);
    headings.push({
      route,
      outline: await page
        .locator("main h1,main h2,main h3,main h4")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({ level: n.tagName, text: n.textContent.trim() })),
        ),
    });
  }
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(base + "#/letters");
  const field = page.getByLabel("Your letter", { exact: true });
  await field.waitFor();
  await field.fill("NAME run9_rent");
  await page
    .getByRole("button", { name: "Copy hex data", exact: true })
    .click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "0x4e414d452072756e395f72656e74",
  );
  await field.fill("NAME other_rent");
  await page
    .getByRole("button", { name: "Copy hex data", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Copy hex data", exact: true })
    .click();
  await page.getByRole("button", { name: "Copied", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Copy hex data", exact: true })
    .waitFor();
  await page.goto(base + "#/profile");
  const addr = page.getByLabel("Any address", { exact: true });
  await addr.fill("wrong");
  assert.equal(await addr.getAttribute("aria-invalid"), "true");
  assert.ok(await addr.getAttribute("aria-describedby"));
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, "cold-interaction-report.json"),
    JSON.stringify(
      {
        cookies: await context.cookies(),
        coldHosts,
        headings,
        checks: [
          "no SDK request or cookie on cold load",
          "letter hex clipboard bytes, reset on edit and 1.5-second reset",
          "profile invalid-address associations",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ coldHosts, cookies: 0, errors, checks: 3 }));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
