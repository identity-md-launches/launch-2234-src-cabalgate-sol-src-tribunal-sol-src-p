/** Fault proxy against read-only local RPC. Never sends wallet transactions. */
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright");
const root = path.resolve("dist"),
  out = path.resolve("test/scratch/round2-rpc");
fs.mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  const f = path.resolve(
    root,
    new URL(req.url, "http://x").pathname.slice(1) || "index.html",
  );
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) {
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
  rpc = process.env.PLEA_QA_RPC;
if (!rpc) throw Error("Set a read-only test RPC");
const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  }),
  reports = [];
try {
  for (const mode of [
    "hang-first",
    "429-first",
    "sentio-only",
    "head-lag",
    "outage",
    "request-errors",
    "offline",
  ]) {
    const context = await browser.newContext(),
      page = await context.newPage(),
      calls = [],
      errors = [];
    let fault = false,
      limited = 0,
      head = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route(
      (u) => network.rpcUrls.some((r) => u.href.startsWith(r)),
      async (route) => {
        const i = network.rpcUrls.findIndex((r) =>
            route.request().url().startsWith(r),
          ),
          body = JSON.parse(route.request().postData()),
          list = Array.isArray(body) ? body : [body];
        calls.push({
          at: Date.now(),
          i,
          methods: list.map((c) => c.method),
          ranges: list
            .filter((c) => c.method === "eth_getLogs")
            .map((c) =>
              Number(
                BigInt(c.params[0].toBlock) -
                  BigInt(c.params[0].fromBlock) +
                  1n,
              ),
            ),
        });
        const fail = async (status, text) => {
          try {
            await route.fulfill({ status, body: text });
          } catch {}
        };
        if (mode === "hang-first" && i === 0) {
          await new Promise((r) => setTimeout(r, 6500));
          await fail(503, "Timeout");
          return;
        }
        if (mode === "429-first" && i === 0) {
          await fail(429, "Rate limited");
          return;
        }
        if ((mode === "sentio-only" && i < 2) || (mode === "outage" && fault)) {
          await fail(503, "Unavailable");
          return;
        }
        const log = list.find((c) => c.method === "eth_getLogs");
        if (
          mode === "sentio-only" &&
          log &&
          BigInt(log.params[0].toBlock) - BigInt(log.params[0].fromBlock) >=
            1000n
        ) {
          limited++;
          await fail(
            429,
            JSON.stringify({
              code: 8,
              message: "public eth_getLogs is limited to 1000 blocks",
            }),
          );
          return;
        }
        if (mode === "head-lag" && log && !head++) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: log.id,
              error: {
                code: -32000,
                message: "block range extends beyond current head block",
              },
            }),
          });
          return;
        }
        if (mode === "request-errors" && fault) {
          const responses = await Promise.all(
            list.map(async (c) =>
              c.method === "eth_call"
                ? {
                    jsonrpc: "2.0",
                    id: c.id,
                    error: { code: -32603, message: "internal error" },
                  }
                : await forward(c),
            ),
          );
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(
              Array.isArray(body) ? responses : responses[0],
            ),
          });
          return;
        }
        try {
          const res = await fetch(rpc, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          });
          await route.fulfill({
            status: res.status,
            contentType: "application/json",
            body: await res.text(),
          });
        } catch {
          await fail(503, "Proxy error");
        }
      },
    );
    async function forward(c) {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(c),
      });
      return res.json();
    }
    const started = Date.now();
    await page.goto(base);
    await page.locator("#main").waitFor({ timeout: 30000 });
    await page
      .locator(".page-loading")
      .waitFor({ state: "detached", timeout: 30000 });
    await page
      .getByRole("heading", { name: "Latest verdicts", exact: true })
      .waitFor({ timeout: 30000 });
    const ready = Date.now() - started;
    assert.ok(ready < 15000, `${mode}: ${ready}ms`);
    assert.equal(
      await page.getByText("History is incomplete", { exact: true }).count(),
      0,
    );
    if (mode === "sentio-only") {
      assert.ok(limited > 0);
      assert.ok(
        calls
          .filter((c) => c.i === 2)
          .flatMap((c) => c.ranges)
          .some((n) => n === 1000),
      );
    }
    if (mode === "head-lag") {
      const ranges = calls.flatMap((c) => c.ranges);
      assert.equal(ranges[0], 10000);
      assert.equal(ranges[1], 10000);
    }
    if (mode === "outage") {
      fault = true;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .waitFor({ timeout: 10000 });
      await page.waitForTimeout(15000);
      fault = false;
      const before = calls.length,
        at = Date.now();
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await page
        .locator(".app-error.error-box")
        .waitFor({ state: "detached", timeout: 15000 });
      assert.ok(calls.length > before);
      reports.push({ mode, recoveryMs: Date.now() - at });
    }
    if (mode === "offline") {
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForTimeout(700);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForTimeout(13000);
      await context.setOffline(false);
      const at = Date.now();
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page
        .locator(".app-error.error-box")
        .waitFor({ state: "detached", timeout: 15000 });
      reports.push({ mode, recoveryMs: Date.now() - at });
    }
    if (mode === "request-errors") {
      fault = true;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .waitFor({ timeout: 10000 });
      const before = calls.length;
      await page.waitForTimeout(16000);
      assert.ok(
        calls
          .slice(before)
          .some((c) => c.methods.includes("eth_getBlockByNumber")),
      );
      fault = false;
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await page
        .locator(".app-error.error-box")
        .waitFor({ state: "detached", timeout: 15000 });
    }
    if (mode === "429-first") {
      const before = calls.filter((c) => c.i === 0).length;
      await page.waitForTimeout(12500);
      assert.equal(calls.filter((c) => c.i === 0).length, before);
    }
    assert.deepEqual(errors, []);
    reports.push({
      mode,
      readyMs: ready,
      limited,
      requests: calls.length,
      endpointCounts: [0, 1, 2].map(
        (i) => calls.filter((c) => c.i === i).length,
      ),
    });
    await context.close();
    console.log(JSON.stringify(reports.at(-1)));
  }
} finally {
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(reports, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
