import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classifyRpc } from "../src/rpc-health.ts";
import { feeDisplay, factParts, Q96 } from "../src/models.ts";
import { explainError } from "../src/errors.ts";
const require = createRequire(import.meta.url),
  dir = await mkdtemp(path.join(tmpdir(), "plea-round2-"));
after(() => rm(dir, { recursive: true, force: true }));
async function load(name) {
  const outfile = path.join(dir, name + ".mjs");
  await build({
    entryPoints: [
      fileURLToPath(new URL("../src/" + name + ".ts", import.meta.url)),
    ],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "locked",
        setup(b) {
          b.onResolve({ filter: /^(viem|wagmi)(\/.*)?$/ }, (a) => ({
            path: require.resolve(a.path),
            external: true,
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(outfile));
}
const { seasonState, countedPleas, caseState, openPleaNotice } =
  await load("chain");
const { resilientTransport, resetHealth } = await load("config");
test("X1: typed causes distinguish request errors, JSON-RPC answers and endpoint outages", () => {
  for (const e of [
    { code: -32603, message: "URL: https://rpc.invalid; internal error" },
    { code: 4444, message: "pruned history" },
    { code: -32000, message: "block range extends beyond current head block" },
  ])
    assert.equal(classifyRpc(e), "answer");
  for (const e of [
    { message: "execution reverted", code: 3 },
    {
      cause: {
        status: 429,
        details: "public eth_getLogs is limited to 1,000 blocks",
      },
    },
    { message: "block range is too wide" },
  ])
    assert.equal(classifyRpc(e), "request");
  for (const e of [
    { name: "TimeoutError" },
    { name: "TypeError" },
    { cause: { name: "HttpRequestError", status: 503 } },
    { code: -32005 },
    { code: 429 },
    { message: "too many requests" },
  ])
    assert.equal(classifyRpc(e), "transport");
});
test("X1: HTTP 429 range body survives, JSON-RPC answers do not bench, all-cooling endpoints are retried", async () => {
  const original = globalThis.fetch,
    calls = [];
  let mode = "range";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body),
      req = Array.isArray(body) ? body[0] : body;
    calls.push(String(url));
    const response = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (mode === "range")
      return response(
        { code: 8, message: "public eth_getLogs is limited to 1000 blocks" },
        429,
      );
    if (mode === "answer")
      return response(
        Array.isArray(body)
          ? [
              {
                jsonrpc: "2.0",
                id: req.id,
                error: { code: -32603, message: "internal error" },
              },
            ]
          : {
              jsonrpc: "2.0",
              id: req.id,
              error: { code: -32603, message: "internal error" },
            },
      );
    if (mode === "down") return response({ message: "outage" }, 503);
    return response(
      Array.isArray(body)
        ? [{ jsonrpc: "2.0", id: req.id, result: "0xaa36a7" }]
        : { jsonrpc: "2.0", id: req.id, result: "0xaa36a7" },
    );
  };
  try {
    const t = resilientTransport(
      ["https://one.invalid", "https://two.invalid"],
      100,
      60000,
    )({});
    await assert.rejects(
      () => t.request({ method: "eth_getLogs", params: [] }),
      /limited to 1000 blocks/,
    );
    assert.equal(calls.length, 1);
    mode = "answer";
    await assert.rejects(() => t.request({ method: "eth_chainId" }));
    assert.equal(calls.length, 3);
    mode = "ok";
    assert.equal(await t.request({ method: "eth_chainId" }), "0xaa36a7");
    assert.equal(calls.at(-1), "https://one.invalid/");
    mode = "down";
    await assert.rejects(() => t.request({ method: "eth_chainId" }));
    mode = "ok";
    assert.equal(await t.request({ method: "eth_chainId" }), "0xaa36a7");
    resetHealth();
  } finally {
    globalThis.fetch = original;
  }
});
const constants = {
  "Seasons.CLOSE_GRACE": 300,
  "CabalGate.COOLDOWN": 14400,
  "CabalGate.EXECUTE_WINDOW": 420,
  "Tribunal.OBJECTION_WINDOW": 1200,
  "Tribunal.MAX_OBJECTIONS": 2,
};
const state = (dead = false, next = 0n) => ({
  constants,
  logs: [],
  v: {
    "CabalGate.startedAt": 100n,
    "CabalGate.diedAt": dead ? 550n : 0n,
    "Seasons.nextToClose": next,
    displayedSeason: 2n,
    seasons: {
      0: { bounds: [true, 100n, 300n, true], closed: false, pot: 1n },
      2: {
        bounds: [true, 500n, dead ? 550n : 700n, dead],
        closed: false,
        pot: 3n,
      },
    },
  },
});
test("S1/S3: all waiting seasons, exact boundaries, final season and completed close", () => {
  assert.deepEqual(seasonState(state(), 600).awaitingAll, [0n, 1n]);
  assert.deepEqual(seasonState(state(), 700).awaitingAll, [0n, 1n, 2n]);
  assert.deepEqual(seasonState(state(true), 550).awaitingAll, [0n, 1n, 2n]);
  assert.deepEqual(seasonState(state(true, 3n), 600).awaitingAll, []);
  assert.equal(seasonState({ v: { "CabalGate.startedAt": 0n } }, 0), undefined);
});
test("S2: best-three matches per-plea score, seat event, ties and filled slots, never Recorded running total", () => {
  const s = state(),
    wallet = "0xabc";
  s.logs = [
    ...[1n, 2n, 3n].map((id, i) => ({
      eventName: "Recorded",
      args: {
        pleaId: id,
        season: 0n,
        wallet,
        score: [40, 38, 38][i],
        points: [48, 93, 138][i],
      },
    })),
    ...[1n, 2n, 3n].map((id, i) => ({
      eventName: "SeatMultiplier",
      args: { pleaId: id, pleaPoints: [48, 45, 45][i] },
    })),
  ];
  assert.deepEqual(
    countedPleas(s, 0n, wallet, [48, 45, 0]).map((p) => [
      p.pleaId,
      p.score,
      p.multiplied,
    ]),
    [
      [1n, 40, true],
      [2n, 38, true],
    ],
  );
  assert.equal(countedPleas(s, 0n, wallet, [54, 0, 0]), undefined);
});
test("C3: void frees a slot; ruled, sustained, recorded, excluded and exact window boundaries", () => {
  const s = state(),
    p = {
      verdictAt: 100n,
      objections: [
        { id: 1n, ruling: 3 },
        { id: 2n, ruling: 4 },
      ],
    };
  assert.equal(caseState(p, s, 1300).filed, 1);
  assert.equal(caseState(p, s, 1300).closed, undefined);
  assert.equal(
    caseState(p, s, 1301).closed,
    "at " +
      new Date(1300 * 1000).toISOString().slice(0, 16).replace("T", " ") +
      " UTC",
  );
  p.objections.push({ id: 3n, ruling: 3 });
  assert.equal(caseState(p, s, 1000).closed, "both objections were ruled");
  p.objections = [{ id: 4n, ruling: 2 }];
  assert.equal(caseState(p, s, 1000).closed, "objection #4 was sustained");
  p.objections = [];
  p.recorded = true;
  assert.equal(caseState(p, s, 1000).closed, "the points were recorded");
});
test("T2: rounded fee parts and displayed total reconcile at 100, launch values and Max", () => {
  const c = Object.fromEntries(
    Object.entries({
      IMD_FEE_BPS: 200,
      CASHBACK_BPS: 50,
      OWNER_BPS: 100,
      PRIZE_BPS: 25,
      POOL_BPS: 25,
    }).map(([k, v]) => ["PleaHook." + k, v]),
  );
  const d = feeDisplay(100n * 10n ** 18n, c);
  assert.deepEqual(
    [d.cash, d.owner, d.prize, d.wall, d.fees, d.reaches, d.pay],
    ["0.49", "0.99", "0.246", "0.246", "1.972", "98.028", "100.00"],
  );
  for (const raw of [2n, 7n, 48n]) {
    const d = feeDisplay(raw * 10n ** 18n, c, 6662n);
    assert.ok(
      Math.abs(
        Number(d.reaches) + Number(d.fees) + Number(d.launch) - Number(d.pay),
      ) < 1e-8,
    );
  }
  assert.equal(
    feeDisplay(270149999999999999999n, c, 0n, false, "270.14").pay,
    "270.14",
  );
  assert.equal(feeDisplay(100n * 10n ** 18n, c, 0n, true).wall, "0.491");
});
test("C1: a lapse uses verdict time, the current sale uses now", () => {
  const s = state();
  const text = openPleaNotice({ status: 2, verdictAt: 100n }, s, 200);
  assert.match(text, /if sold now/);
  assert.match(text, /if it lapses/);
  assert.ok(text.includes("04:01"));
});
test("T1: display error overrides retain title and body", () => {
  const result = explainError({ data: { errorName: "BuyTooLarge" } }, [], {
    BuyTooLarge: { title: "Cap reached", body: "Pay less." },
  });
  assert.deepEqual(result, { title: "Cap reached", body: "Pay less." });
});

const { sanitizeOracle } = await load("oracle");
test("C4: oracle data is bounded, identity checked, and non-renderable values dropped", () => {
  assert.deepEqual(
    sanitizeOracle(
      {
        id: "request",
        panelSize: { bad: 1 },
        agreed: { bad: 1 },
        comment: { bad: 1 },
      },
      "request",
    ),
    { id: "request" },
  );
  assert.deepEqual(
    sanitizeOracle(
      {
        id: "request",
        panelSize: 30,
        attestation: { agreed: 26 },
        comment: "x".repeat(300),
      },
      "request",
    ),
    { id: "request", panelSize: 30, agreed: 26, comment: "x".repeat(280) },
  );
  assert.throws(() => sanitizeOracle({ id: "other" }, "request"));
  assert.equal(
    sanitizeOracle({ id: "request", panelSize: 30, agreed: 31 }, "request")
      .agreed,
    undefined,
  );
});
test("T2: sub-cent and exact fractional payments remain positive and reconcile", () => {
  const c = Object.fromEntries(
    Object.entries({
      IMD_FEE_BPS: 200,
      CASHBACK_BPS: 50,
      OWNER_BPS: 100,
      PRIZE_BPS: 25,
      POOL_BPS: 25,
    }).map(([k, v]) => ["PleaHook." + k, v]),
  );
  const d = feeDisplay(123456000000000000n, c, 0n, false, "0.123456");
  assert.equal(d.pay, "0.123456");
  assert.ok(
    Math.abs(Number(d.reaches) + Number(d.fees) - Number(d.pay)) < 1e-12,
  );
  const tiny = feeDisplay(100000000000000n, c, 0n, false, "0.0001");
  assert.ok(!tiny.reaches.includes("−"));
  assert.ok(
    Math.abs(Number(tiny.reaches) + Number(tiny.fees) - Number(tiny.pay)) <
      1e-12,
  );
});

test("X1: a rate-limited endpoint is skipped until its exact 60-second cooldown expires", async () => {
  const originalFetch = globalThis.fetch,
    originalNow = Date.now;
  let now = originalNow(),
    base = now,
    first = 0,
    second = 0;
  Date.now = () => now;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body),
      list = Array.isArray(body) ? body : [body];
    if (String(url).includes("cooldown-one")) {
      first++;
      if (first === 1) return new Response("Rate limited", { status: 429 });
    } else second++;
    const result = list.map((req) => ({
      jsonrpc: "2.0",
      id: req.id,
      result: "0xaa36a7",
    }));
    return new Response(
      JSON.stringify(Array.isArray(body) ? result : result[0]),
      { headers: { "content-type": "application/json" } },
    );
  };
  try {
    const t = resilientTransport(
      ["https://cooldown-one.invalid", "https://cooldown-two.invalid"],
      1000,
      60000,
    )({});
    await t.request({ method: "eth_chainId" });
    assert.deepEqual([first, second], [1, 1]);
    now = base + 59999;
    await t.request({ method: "eth_chainId" });
    assert.deepEqual([first, second], [1, 2]);
    now = base + 60001;
    await t.request({ method: "eth_chainId" });
    assert.deepEqual([first, second], [2, 2]);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("T2/T4: incomplete decimal input cannot throw while computing hidden fee rows", () => {
  for (const input of ["abc", ".", "1e3", "-1"])
    assert.doesNotThrow(() => feeDisplay(0n, {}, 0n, false, input));
});
