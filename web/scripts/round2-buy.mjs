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
const page = await context.newPage(),
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(base + "#/buy");
  await page.locator("#main").waitFor({ timeout: 60000 });
  await page
    .locator(".page-loading")
    .waitFor({ state: "detached", timeout: 60000 });
  if (process.env.PLEA_QA_WALLET) {
    if (
      await page.getByRole("button", { name: "Connect", exact: true }).count()
    ) {
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await page
        .getByRole("button", { name: "Fork test wallet", exact: true })
        .click();
    }
    await page.getByRole("link", { name: /your profile/ }).waitFor();
  }
  for (const theme of ["light", "dark"])
    for (const width of [320, 360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      for (const input of [
        "abc",
        ".",
        "1e3",
        "-1",
        "0.0001",
        "2.123456",
        "100",
      ]) {
        await page.getByLabel("You pay", { exact: true }).fill(input);
        await page.waitForTimeout(80);
        assert.equal(
          await page.getByText("Can’t show this page", { exact: true }).count(),
          0,
        );
        const r = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          invalid: document.querySelector(".app-error")?.textContent,
        }));
        assert.equal(r.overflow, 0, JSON.stringify({ width, theme, input, r }));
        if (/[^\d.,]/.test(input) || input === ".")
          assert.equal(
            await page
              .getByRole("button", { name: /^Buy PLEA$|^Approve imdTEST$/ })
              .getAttribute("aria-disabled"),
            "true",
          );
      }
      if (!(await page.evaluate(() => !!window.axe)))
        await page.addScriptTag({ path: process.env.PLEA_AXE });
      const violations = await page.evaluate(async () =>
        (
          await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map((v) => v.id),
      );
      assert.deepEqual(violations, []);
      checks.push({ width, theme, inputs: 7, violations });
    }
  await page.getByLabel("You pay", { exact: true }).fill("");
  await page.route(
    (u) => network.rpcUrls.some((r) => u.href.startsWith(r)),
    async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: route.request().postData(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: await response.text(),
      });
    },
  );
  await page.getByLabel("You pay", { exact: true }).fill("2");
  await page
    .locator(".input--readonly .skeleton__line")
    .waitFor({ timeout: 10000 });
  await page.locator("#quote").waitFor({ timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, quoteSkeleton: true, errors }));
} finally {
  fs.writeFileSync(
    path.join(
      out,
      "round2-buy" + (process.env.PLEA_QA_WALLET ? "-wallet" : "") + ".json",
    ),
    JSON.stringify({ checks, errors }, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
