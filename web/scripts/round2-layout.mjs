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
try {
  for (const theme of ["light", "dark"])
    for (const width of [320, 360, 1280])
      for (const route of ["", "contracts", "claim"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(base + "#/" + route);
        await page.locator("#main").waitFor({ timeout: 60000 });
        await page
          .locator(".page-loading")
          .waitFor({ state: "detached", timeout: 60000 });
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await page.evaluate(() => document.fonts.ready);
        await page.locator("#main").focus();
        const seen = new Set();
        let count = 0;
        for (let i = 0; i < 100; i++) {
          await page.keyboard.press("Tab");
          const r = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const r = el.getBoundingClientRect(),
              style = getComputedStyle(el),
              pad =
                parseFloat(style.outlineWidth) +
                parseFloat(style.outlineOffset),
              clips = [];
            for (
              let p = el.parentElement;
              p && p !== document.body && p !== document.documentElement;
              p = p.parentElement
            ) {
              const s = getComputedStyle(p);
              if (
                ["hidden", "clip"].includes(s.overflowX) ||
                ["hidden", "clip"].includes(s.overflowY)
              ) {
                const b = p.getBoundingClientRect();
                if (
                  r.left - pad < b.left ||
                  r.right + pad > b.right ||
                  r.top - pad < b.top ||
                  r.bottom + pad > b.bottom
                )
                  clips.push(p.className);
              }
            }
            return {
              key: el.outerHTML.slice(0, 220),
              name:
                el.getAttribute("aria-label") || el.textContent.slice(0, 80),
              outline: style.outlineStyle,
              width: parseFloat(style.outlineWidth),
              clips,
            };
          });
          if (!r) continue;
          if (seen.has(r.key)) break;
          seen.add(r.key);
          count++;
          assert.ok(
            r.outline !== "none" && r.width >= 2,
            JSON.stringify({ route, theme, width, focus: r }),
          );
          assert.deepEqual(
            r.clips,
            [],
            JSON.stringify({ route, theme, width, focus: r }),
          );
        }
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
          0,
        );
        checks.push({ theme, width, route: route || "home", tabStops: count });
        if (route === "contracts" && width === 320) {
          await page
            .getByRole("button", { name: "Copy PLEA address", exact: true })
            .focus();
          await page.screenshot({
            path: path.join(out, `focus-contracts-${theme}.png`),
          });
        }
      }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors }));
} finally {
  fs.writeFileSync(
    path.join(out, "round2-layout.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
