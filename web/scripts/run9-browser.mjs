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
try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { name: "Latest verdicts", exact: true })
    .waitFor({ timeout: 90000 });
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
  const routes = (
    process.env.PLEA_QA_ROUTES ||
    ",buy,plead,letters,objections,seasons,wall,claim,profile,profile/0x4b91078b2374c956A65F7Af0999CaE0a935E6821,share,p/0,p/999999,no-such-page"
  ).split(",");
  for (const theme of ["light", "dark"])
    for (const width of [320, 360, 390, 768, 1280])
      for (const route of routes) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t;
          localStorage.setItem("plea-theme", t);
        }, theme);
        await page.goto(base + "#/" + route, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(120);
        await page.addScriptTag({ content: axe });
        const result = await page.evaluate(async () => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          violations: (
            await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
              },
            })
          ).violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            targets: v.nodes.map((n) => n.target),
          })),
        }));
        runs.push({ route: route || "home", theme, width, ...result });
        if (result.overflow || result.violations.length)
          console.log("FAIL", JSON.stringify(runs.at(-1)));
        if ([390, 1280].includes(width) && theme === "light")
          await page.screenshot({
            path: path.join(
              out,
              `${route.replaceAll("/", "-") || "home"}-${width}.png`,
            ),
            fullPage: true,
          });
      }
  await page.goto(base + "#/buy");
  await page.getByLabel("You pay", { exact: true }).fill("2");
  await page.getByLabel("You get (quote)", { exact: true }).waitFor();
  await page.goto(base + "#/plead");
  if (await page.getByLabel("Your plea", { exact: true }).count()) {
    await page.getByLabel("Your plea", { exact: true }).fill("An honest case.");
    assert.ok(await page.getByText("15 / 280 bytes", { exact: true }).count());
    await page
      .getByLabel("Your plea", { exact: true })
      .fill("Hidden\u200btext");
    assert.ok(await page.getByText(/Remove the.*zero-width/).count());
    assert.equal(
      await page
        .getByLabel("Sell automatically if approved", { exact: true })
        .isChecked(),
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  assert.ok(
    await page
      .locator("#drawer a")
      .first()
      .evaluate((el) => el === document.activeElement),
  );
  await page.keyboard.press("Escape");
  assert.ok(
    await page
      .getByRole("button", { name: "Menu", exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  const report = {
    rpcSource: "Configured Sepolia RPC (or a local Sepolia fork override)",
    wallet: !!process.env.PLEA_QA_WALLET,
    runs,
    errors,
    requests: count,
    failures: runs.filter((x) => x.overflow || x.violations.length).length,
  };
  fs.writeFileSync(
    path.join(out, (process.env.PLEA_QA_LABEL || "report") + ".json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      runs: runs.length,
      failures: report.failures,
      errors,
      requests: count,
    }),
  );
  assert.equal(report.failures, 0);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
