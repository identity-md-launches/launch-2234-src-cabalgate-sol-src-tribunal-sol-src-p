import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright"),
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const root = path.resolve("dist"),
  out = path.resolve("test/scratch/rpc");
fs.mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  const f = path.resolve(
    root,
    new URL(req.url, "http://x").pathname.slice(1) || "index.html",
  );
  if (
    !f.startsWith(root + path.sep) ||
    !fs.existsSync(f) ||
    fs.statSync(f).isDirectory()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "content-type",
    f.endsWith(".js")
      ? "application/javascript"
      : f.endsWith(".json")
        ? "application/json"
        : f.endsWith(".css")
          ? "text/css"
          : f.endsWith(".html")
            ? "text/html"
            : "application/octet-stream",
  );
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`,
  network = JSON.parse(fs.readFileSync("web/network-input.json")).network,
  rpc = process.env.PLEA_QA_RPC || network.rpcUrls[0],
  report = [];
try {
  const context = await browser.newContext(),
    page = await context.newPage();
  let requests = 0;
  const methods = {};
  await context.route(
    (u) => network.rpcUrls.some((r) => u.href.startsWith(r)),
    async (route) => {
      requests++;
      const body = route.request().postData(),
        parsed = JSON.parse(body);
      for (const item of Array.isArray(parsed) ? parsed : [parsed])
        methods[item.method] = (methods[item.method] || 0) + 1;
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: await response.text(),
      });
    },
  );
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Latest verdicts", exact: true })
    .waitFor({ timeout: 60000 });
  await page.waitForTimeout(300);
  requests = 0;
  for (const key of Object.keys(methods)) delete methods[key];
  for (let i = 0; i < 6; i++) await page.waitForTimeout(11000);
  const idleRequests = requests,
    idleMethods = { ...methods };
  assert.ok(idleRequests <= 22, `Idle requests in 66s: ${idleRequests}`);
  await page.evaluate(() =>
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    }),
  );
  const before = requests;
  await page.waitForTimeout(13000);
  const hiddenRequests = requests - before;
  assert.equal(hiddenRequests, 0);
  fs.writeFileSync(
    path.join(out, "idle-report.json"),
    JSON.stringify(
      {
        seconds: 66,
        idleRequests,
        idleMethods,
        hiddenSeconds: 13,
        hiddenRequests,
      },
      null,
      2,
    ),
  );
  console.log({ idleRequests, idleMethods, hiddenRequests });
  await context.close();
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
