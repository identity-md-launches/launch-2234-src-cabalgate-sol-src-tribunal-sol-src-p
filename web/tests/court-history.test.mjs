import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = await mkdtemp(path.join(tmpdir(), "plea-court-test-"));
after(() => rm(dir, { recursive: true, force: true }));
const outfile = path.join(dir, "chain.mjs");
await build({
  entryPoints: [fileURLToPath(new URL("../src/chain.ts", import.meta.url))],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "locked-packages",
      setup(build) {
        build.onResolve({ filter: /^(viem|wagmi)(\/.*)?$/ }, (args) => ({
          path: require.resolve(args.path),
          external: true,
        }));
      },
    },
  ],
});
const { readCourtHistory, courtCounts, verdictSeason } = await import(
  pathToFileURL(outfile)
);
const constants = {
  "CabalGate.PENDING_EXPIRY": 1200,
  "Tribunal.OBJECTION_WINDOW": 1200,
};
const wallet = "0x1111111111111111111111111111111111111111";
const plea = (id, status = 1, submittedAt = 4000n, verdictAt = 0n) => ({
  id,
  seller: wallet,
  status,
  submittedAt,
  verdictAt,
  score: 45,
  need: 40,
  factScore: 31,
  flags: 0,
  amount: 20n,
  originalId: 0n,
  intakeId: `0x${id.toString(16).padStart(64, "0")}`,
  text: "For rent.",
});
function fixture() {
  const records = new Map(
    Array.from({ length: 32 }, (_, i) => [BigInt(i + 1), plea(BigInt(i + 1))]),
  );
  for (const id of [1n, 3n, 4n]) records.set(id, plea(id, 4, 100n, 200n));
  records.set(2n, plea(2n, 3, 100n, 200n));
  records.set(5n, plea(5n, 6, 100n));
  records.set(7n, plea(7n, 2, 4000n, 4500n));
  const logs = [...records.keys()].map((id) => ({
    eventName: "PleaSubmitted",
    args: { id },
    blockNumber: id + 100n,
  }));
  for (const id of [1n, 2n, 3n, 4n, 7n])
    logs.push({
      eventName: "Verdict",
      args: { id, approved: id !== 2n },
      blockNumber: id === 7n ? 1000n : 200n,
    });
  logs.push({ eventName: "PleaExpired", args: { id: 5n }, blockNumber: 300n });
  logs.sort((a, b) => Number(a.blockNumber - b.blockNumber));
  const calls = [];
  const r = {
    addresses: {
      CabalGate: wallet,
      Seasons: wallet,
      Tribunal: wallet,
      Letterbox: wallet,
    },
    abis: {},
    client: {
      async getBlock({ blockNumber }) {
        calls.push(["block", blockNumber]);
        return { timestamp: blockNumber === 1000n ? 4500n : 200n };
      },
      async readContract({ functionName: fn, args, blockNumber }) {
        calls.push([fn, ...(args || [])]);
        if (blockNumber !== undefined)
          throw Error("archive unavailable in this fixture");
        switch (fn) {
          case "getPlea":
            return { ...records.get(args[0]) };
          case "requests":
            return [wallet, wallet, "0x00000000", false];
          case "intake":
            return wallet;
          case "standing":
            return [true, false, 45];
          case "recorded":
          case "holdsSeat":
          case "excluded":
            return false;
          case "nameOf":
            return "";
          case "escrowOf":
            return [wallet, false, 0n, 0n];
          case "pleaBalance":
            return 100n;
          case "pointsFor":
            return 45;
          default:
            throw Error(fn);
        }
      },
    },
  };
  const recent = [...records.values()].filter((p) => p.id >= 9n).reverse();
  return { r, records, logs, calls, recent };
}
test("court history keeps old open #7 and pending #6/#8 outside the 24-card page", async () => {
  const f = fixture();
  const court = await readCourtHistory(f.r, f.logs, f.recent, constants, 4600);
  assert.equal(f.recent.length, 24);
  assert.deepEqual(
    court.open.map((p) => p.id),
    [7n],
  );
  assert.equal(court.latestVerdict.id, 7n);
  assert.equal(
    court.pending.filter(
      (p) => !p.completed && 4600 <= Number(p.submittedAt) + 1200,
    ).length,
    26,
  );
  assert.ok(court.pending.some((p) => p.id === 6n));
  assert.ok(court.pending.some((p) => p.id === 8n));
  assert.equal(
    f.calls.filter(([fn, id]) => fn === "getPlea" && id === 7n).length,
    1,
    "open case and latest verdict share one full read",
  );
  assert.equal(
    f.calls.filter(([fn]) => fn === "block").length,
    1,
    "only the old verdict block is needed to stop at the window boundary",
  );
  const s = {
    court,
    pleas: f.recent,
    constants,
    logs: f.logs,
    v: { "CabalGate.nextId": 33n },
  };
  assert.deepEqual(courtCounts(s, 4600), {
    total: 32,
    approved: 4,
    denied: 1,
    pending: 26,
    noVerdict: 1,
  });
  assert.equal(
    courtCounts({ ...s, historyError: "scan incomplete" }, 4600),
    undefined,
  );
});
test("pending totals respect exact expiry, Intake completion and terminal events", async () => {
  const f = fixture();
  f.records.get(6n).submittedAt = 3400n;
  f.records.get(8n).completed = true;
  f.recent.push(f.records.get(8n));
  const court = await readCourtHistory(f.r, f.logs, f.recent, constants, 4600);
  const s = { court, logs: f.logs, constants, v: { "CabalGate.nextId": 33n } };
  assert.equal(courtCounts(s, 4600).pending, 25);
  assert.equal(courtCounts(s, 4601).pending, 24);
  const previous = { court };
  f.calls.length = 0;
  await readCourtHistory(f.r, f.logs, f.recent, constants, 6000, previous);
  assert.ok(
    !f.calls.some(([fn, id]) => fn === "getPlea" && id === 6n),
    "expired records reuse their immutable submission time",
  );
});
test("older verdicts remain latest after their objection window; later denials replace them", async () => {
  const f = fixture();
  let court = await readCourtHistory(f.r, f.logs, f.recent, constants, 5701);
  assert.deepEqual(court.open, []);
  assert.equal(court.latestVerdict.id, 7n);
  f.records.set(8n, plea(8n, 3, 4000n, 5800n));
  f.logs.push({
    eventName: "Verdict",
    args: { id: 8n, approved: false },
    blockNumber: 1100n,
  });
  f.r.client.getBlock = async () => ({ timestamp: 5800n });
  court = await readCourtHistory(f.r, f.logs, f.recent, constants, 5800, {
    court,
  });
  assert.equal(court.latestVerdict.id, 8n);
  assert.ok(!court.pending.some((p) => p.id === 8n));
});
test("plea seasons use verdict time with exact season boundaries", () => {
  assert.equal(verdictSeason(0n, 100n, 18000n), undefined);
  assert.equal(verdictSeason(99n, 100n, 18000n), undefined);
  assert.equal(verdictSeason(100n, 100n, 18000n), 0n);
  assert.equal(verdictSeason(18099n, 100n, 18000n), 0n);
  assert.equal(verdictSeason(18100n, 100n, 18000n), 1n);
});
