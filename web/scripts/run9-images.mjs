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
const base = "https://plea-test-run-9.sites.imd.fun/",
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
await context.route(
  "https://plea-test-run-9.sites.imd.fun/**",
  async (route) => {
    const file = path.resolve(
      root,
      new URL(route.request().url()).pathname.slice(1) || "index.html",
    );
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
      await route.fulfill({ status: 404, body: "Missing file" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: mime[path.extname(file)] || "application/octet-stream",
      body: fs.readFileSync(file),
    });
  },
);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const axe = fs.readFileSync(
  process.env.PLEA_AXE || path.resolve("web/node_modules/axe-core/axe.min.js"),
  "utf8",
);
try {
  await page.goto(base + "#/share", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Share PLEA", exact: true })
    .waitFor({ timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Download image/ }).click();
  const file = await download;
  await file.saveAs("test/scratch/run9-browser/default.png");
  const bytes = fs.readFileSync("test/scratch/run9-browser/default.png");
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 675);
  console.log("Default PNG: 1200x675");
  const intent = new URL(
    await page.getByRole("link", { name: /^Share on X/ }).getAttribute("href"),
  );
  assert.ok(intent.searchParams.get("text").length + 24 <= 280);
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "write", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.getByRole("button", { name: /^Copy image/ }).click();
  await page
    .getByText("This browser can’t copy images.", { exact: true })
    .first()
    .waitFor();
  await page
    .getByText("Use Download image, then attach the file to your post.", {
      exact: true,
    })
    .first()
    .waitFor();
  console.log(
    "Image clipboard fallback gives download instructions; X intent is bounded",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Latest verdicts", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(out, "home-first-screen-390.png") });
  await page.goto(base + "#/buy");
  await page.screenshot({ path: path.join(out, "buy-first-screen-390.png") });
  if (process.env.PLEA_QA_IMAGE_ID) {
    await page.goto(base + "#/share/" + process.env.PLEA_QA_IMAGE_ID);
    await page
      .getByRole("heading", {
        name: "Share plea #" + process.env.PLEA_QA_IMAGE_ID,
        exact: true,
      })
      .waitFor();
    const d = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Download image/ }).click();
    await (
      await d
    ).saveAs(path.join(out, "plea-" + process.env.PLEA_QA_IMAGE_ID + ".png"));
    const intent = new URL(
      await page
        .getByRole("link", { name: /^Share on X/ })
        .getAttribute("href"),
    );
    assert.ok(intent.searchParams.get("text").length + 24 <= 280);
    assert.ok(
      intent.searchParams
        .get("url")
        .endsWith("#/p/" + process.env.PLEA_QA_IMAGE_ID),
    );
    const bytes = fs.readFileSync(
      path.join(out, "plea-" + process.env.PLEA_QA_IMAGE_ID + ".png"),
    );
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 675);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
