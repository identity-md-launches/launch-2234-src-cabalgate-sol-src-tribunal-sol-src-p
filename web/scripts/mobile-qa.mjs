import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs";
const root = path.resolve("dist"),
  out = "test/scratch/mobile";
fs.mkdirSync(out, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer((req, res) => {
  const f = path.resolve(
    root,
    new URL(req.url, "http://x").pathname.replace(/^\/preview\//, "") ||
      "index.html",
  );
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "content-type",
    types[path.extname(f)] || "application/octet-stream",
  );
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
await page.goto(base + "#/buy");
await page.getByRole("button", { name: "Connect", exact: true }).click();
for (const w of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
  assert.equal(
    await page.getByRole("link", { name: "Open in " + w, exact: true }).count(),
    1,
  );
assert.equal(
  await page
    .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
    .count(),
  1,
);
const href = await page
  .getByRole("link", { name: "Open in Rabby", exact: true })
  .getAttribute("href");
assert.equal(new URL(href).searchParams.get("_cmd"), "open-dapp");
assert.equal(new URL(href).searchParams.get("dapp"), base + "#/buy");
assert.ok(!(await page.locator("body").innerText()).includes("Injected"));
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - innerWidth,
);
assert.equal(overflow, 0);
const axe = fs.readFileSync("web/node_modules/axe-core/axe.min.js", "utf8");
await page.addScriptTag({ content: axe });
const runs = [];
for (const theme of ["light", "dark"])
  for (const width of [320, 360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    const result = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
        resultTypes: ["violations"],
      });
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        violations: r.violations.map((x) => ({
          id: x.id,
          targets: x.nodes.map((n) => n.target),
        })),
      };
    });
    runs.push({ theme, width, ...result });
    assert.equal(result.overflow, 0);
    assert.deepEqual(result.violations, []);
  }
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: out + "/wallet-390.png", fullPage: true });
await page.keyboard.press("Escape");
assert.equal(await page.getByRole("dialog").isVisible(), false);
const result = {
  runs,
  mobileWalletRows: 4,
  coinbaseSmartWallet: true,
  rabbyCommandVerified: true,
  overflow,
  escapeCloses: true,
  nativeApplicationsOpened: false,
};
fs.writeFileSync(out + "/report.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await browser.close();
await new Promise((r) => server.close(r));
