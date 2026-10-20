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
  for (const mode of ["hang", "429", "third-only"]) {
    const context = await browser.newContext(),
      counts = [0, 0, 0],
      batches = [],
      page = await context.newPage();
    let limited = 0;
    await context.route(
      (u) => network.rpcUrls.some((r) => u.href.startsWith(r)),
      async (route) => {
        const i = network.rpcUrls.findIndex((r) =>
            route.request().url().startsWith(r),
          ),
          calls = JSON.parse(route.request().postData()),
          list = Array.isArray(calls) ? calls : [calls];
        counts[i]++;
        batches.push(list.length);
        if (i === 0 && mode === "hang") {
          await new Promise((r) => setTimeout(r, 6500));
          try {
            await route.fulfill({ status: 503, body: "Timed out" });
          } catch {}
          return;
        }
        if (i === 0 && mode === "429") {
          await route.fulfill({ status: 429, body: "Rate limited" });
          return;
        }
        if (mode === "third-only" && i < 2) {
          await route.fulfill({ status: 503, body: "Unavailable" });
          return;
        }
        const responses = [];
        for (const call of list) {
          if (
            call.method === "eth_getLogs" &&
            BigInt(call.params[0].toBlock) - BigInt(call.params[0].fromBlock) >=
              1000n
          ) {
            limited++;
            responses.push({
              jsonrpc: "2.0",
              id: call.id,
              error: {
                code: -32000,
                message: "eth_getLogs is limited to 1000 blocks",
              },
            });
          } else {
            const response = await fetch(rpc, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(call),
            });
            responses.push(await response.json());
          }
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(Array.isArray(calls) ? responses : responses[0]),
        });
      },
    );
    const begin = Date.now();
    await page.goto(base);
    await page
      .getByRole("heading", { name: "Latest verdicts", exact: true })
      .waitFor({ timeout: 25000 });
    const ready = Date.now() - begin;
    assert.ok(ready < 15000, `${mode}: ready ${ready}ms`);
    const before = counts[0];
    await page.evaluate(() => (location.hash = "#/wall"));
    await page
      .getByRole("heading", { name: "The Wall", exact: true })
      .waitFor();
    await page.waitForTimeout(12500);
    assert.equal(
      counts[0],
      before,
      "Failed first endpoint remains on cooldown",
    );
    assert.ok(Math.max(...batches) <= 5);
    if (mode === "third-only") assert.ok(counts[2] > 0);
    report.push({
      mode,
      readyMs: ready,
      counts,
      maxBatch: Math.max(...batches),
      rangeLimitResponses: limited,
    });
    await context.close();
  }
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
