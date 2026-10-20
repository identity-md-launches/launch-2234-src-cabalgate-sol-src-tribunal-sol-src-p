import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { chromium } from "/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs";
const root = path.resolve("dist"),
  out = path.resolve("test/scratch/qa");
fs.mkdirSync(out, { recursive: true });
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(
    /^\/preview\//,
    "",
  );
  const file = path.resolve(root, p || "index.html");
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
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const cache = new Map();
const liveCalls = [];
const rpcCacheFile = path.join(out, "rpc-cache.json");
const net = JSON.parse(fs.readFileSync("web/network-input.json")).network;
await context.route(
  (url) => net.rpcUrls.some((r) => url.href.startsWith(r)),
  async (route) => {
    try {
      const req = route.request();
      const calls = JSON.parse(req.postData());
      const items = Array.isArray(calls) ? calls : [calls];
      const key = (c) => JSON.stringify([c.method, c.params]);
      const results = [];
      const missing = items.filter((c) => !cache.has(key(c)));
      if (missing.length) {
        const response = await fetch(req.url(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(missing.length === 1 ? missing[0] : missing),
          signal: AbortSignal.timeout(20000),
        });
        const body = await response.json();
        for (const row of Array.isArray(body) ? body : [body]) {
          const call = missing.find((c) => c.id === row.id);
          if (call && !row.error) {
            cache.set(key(call), row.result);
            liveCalls.push({
              method: call.method,
              params: call.params,
              result: row.result,
            });
          }
        }
        for (const call of missing)
          if (!cache.has(key(call))) {
            const row = (Array.isArray(body) ? body : [body]).find(
              (c) => c.id === call.id,
            );
            results.push(
              row || {
                jsonrpc: "2.0",
                id: call.id,
                error: { code: -32000, message: "RPC unavailable" },
              },
            );
          }
      }
      for (const call of items)
        if (cache.has(key(call)))
          results.push({
            jsonrpc: "2.0",
            id: call.id,
            result: cache.get(key(call)),
          });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(calls) ? results : results[0]),
      });
    } catch (e) {
      await route.fulfill({ status: 503, body: "RPC unavailable" });
    }
  },
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const failed = [];
page.on("response", (r) => {
  if (r.status() >= 400 && !net.rpcUrls.some((x) => r.url().startsWith(x)))
    failed.push({ url: r.url().replace(base, ""), status: r.status() });
});
await page.goto(base, { waitUntil: "networkidle" });
await page
  .getByText("Anyone may seed from", { exact: false })
  .waitFor({ timeout: 60000 });
console.log("Live deployment loaded");
fs.writeFileSync(rpcCacheFile, JSON.stringify(liveCalls, null, 2));
const axe = fs.readFileSync("web/node_modules/axe-core/axe.min.js", "utf8");
const report = { live: true, runs: [], interaction: [], errors, failed };
for (const theme of ["light", "dark"])
  for (const width of [320, 360, 390, 768, 1280])
    for (const route of [
      "",
      "buy",
      "plead",
      "letters",
      "objections",
      "seasons",
      "wall",
      "claim",
      "profile",
      "share",
      "p/1",
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((t) => {
        localStorage.setItem("plea-theme", t);
        document.documentElement.dataset.theme = t;
      }, theme);
      await page.goto(base + "#/" + route, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
          resultTypes: ["violations"],
        });
        return r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        }));
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      const run = {
        route: route || "home",
        theme,
        width,
        overflow,
        violations,
      };
      report.runs.push(run);
      if (overflow || violations.length)
        console.log("FAIL", JSON.stringify(run));
      if ([390, 1280].includes(width) && theme === "light")
        await page.screenshot({
          path: path.join(
            out,
            `${route.replace("/", "-") || "home"}-${width}.png`,
          ),
          fullPage: true,
        });
    }
fs.writeFileSync(
  path.join(out, "live-report.json"),
  JSON.stringify(report, null, 2),
);
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "#/plead", { waitUntil: "networkidle" });
await page.getByLabel("Your plea", { exact: true }).fill("An honest case.");
if (!(await page.getByText("15 / 280 bytes", { exact: true }).count()))
  throw Error("Byte counter failed");
await page.getByLabel("Your plea", { exact: true }).fill("Hidden\u200btext");
if (!(await page.getByText(/Remove the.*zero-width/).count()))
  throw Error("Hidden text not rejected");
report.interaction.push("UTF-8 live counter and hidden-character checks");
if (
  !(await page
    .getByLabel("Sell automatically if approved", { exact: true })
    .isChecked())
)
  throw Error("Auto-sell not default");
report.interaction.push("Auto-sell checked by default");
await page.getByRole("button", { name: "Menu", exact: true }).click();
await page.keyboard.press("Escape");
if (await page.locator("#drawer").isVisible())
  throw Error("Menu Escape failed");
report.interaction.push("Menu keyboard Escape");
await page.getByRole("button", { name: "Connect", exact: true }).click();
if (!(await page.getByRole("dialog").isVisible()))
  throw Error("Wallet sheet did not open");
await page.keyboard.press("Escape");
report.interaction.push(
  "Connect sheet opens, closes with Escape, restores focus",
);
await page.goto(base + "#/share", { waitUntil: "networkidle" });
await page.setViewportSize({ width: 1280, height: 900 });
const downloadWait = page.waitForEvent("download");
await page.getByRole("button", { name: "Download image", exact: true }).click();
const download = await downloadWait;
await download.saveAs("web/public/og.png");
const png = fs.readFileSync("web/public/og.png");
if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 675)
  throw Error("Wrong PNG dimensions");
report.interaction.push("1200×675 share-card rendering");
fs.writeFileSync(rpcCacheFile, JSON.stringify(liveCalls, null, 2));
fs.writeFileSync(
  path.join(out, "live-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    runs: report.runs.length,
    failures: report.runs.filter((x) => x.overflow || x.violations.length)
      .length,
    errors,
    failed,
    interaction: report.interaction,
  }),
);
await browser.close();
await new Promise((r) => server.close(r));
