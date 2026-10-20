import test from "node:test";
import assert from "node:assert/strict";
import { keccak256, encodePacked } from "viem";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(import.meta.url),
  E = 10n ** 18n,
  Q = 2n ** 96n;
test("automatic appeal reads openOf as (id, openCount), returns settleable escrow, and scores its restored share", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "plea-appeal-test-"));
  try {
    const outfile = path.join(dir, "appeal.mjs");
    await build({
      entryPoints: [
        fileURLToPath(new URL("../src/appeal.ts", import.meta.url)),
      ],
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
    const { appealPreview } = await import(pathToFileURL(outfile));
    const wallet = "0x1111111111111111111111111111111111111111",
      original = 1000000n * E,
      held = 4000000n * E,
      escrow = 1000000n * E,
      originalBalance = 6000000n * E;
    const r = {
      addresses: {
        PLEA: wallet,
        Letterbox: wallet,
        CabalGate: wallet,
        PleaHook: wallet,
      },
      abis: {},
      client: {
        async readContract({ functionName, args }) {
          switch (functionName) {
            case "openOf":
              return [9n, 1n];
            case "escrowOf":
              assert.equal(args[0], 9n);
              return [wallet, true, escrow, 0n];
            case "getPlea":
              assert.equal(args[0], 9n);
              return { status: 3, verdictAt: 100n };
            case "balanceOf":
              return held;
            case "pleaBalance":
              return originalBalance;
            case "latestPrice":
              return Q / 100000n;
            case "factScore":
              return 34;
            default:
              throw Error(functionName);
          }
        },
      },
    };
    const s = {
      timestamp: 200,
      constants: {
        "CabalGate.MAX_SELL": 2500000n * E,
        "CabalGate.PASS_MARK": 71,
        "CabalGate.EXECUTE_WINDOW": 420,
        "CabalGate.PENDING_EXPIRY": 1200,
      },
      v: { appealFees: [1100000000000000000n, 150000n * E] },
    };
    const preview = await appealPreview(
      r,
      s,
      { id: 1n, amount: original },
      wallet,
      true,
      original,
    );
    assert.equal(preview.returned, escrow);
    assert.equal(preview.balance, held + escrow);
    assert.equal(
      preview.amount,
      ((held + escrow) * original) / originalBalance,
    );
    assert.equal(preview.need, 30);
    assert.equal(preview.reason, "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("S14: claims refuse unsafe JSON numbers and verify sorted packed Merkle proofs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "plea-claims-test-"));
  try {
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
    const {
      normalizeClaims,
      verifyClaim,
      amount,
      deadman,
      span,
      ago,
      heldTime,
      elapsed,
      words,
    } = await import(pathToFileURL(outfile));
    assert.equal(amount(206933n, 6, 2, "down"), "0.20");
    assert.equal(amount(206933n, 6, 2, "up"), "0.21");
    assert.equal(amount(100001n, 2, 0, "up"), "1,001");
    assert.equal(deadman(90061), "25h 1m");
    assert.equal(span(604800), "7 days");
    assert.equal(span(420, "adj"), "7-minute");
    assert.equal(ago(59), "59 s ago");
    assert.equal(ago(60), "1 min ago");
    assert.equal(ago(3600), "1 h ago");
    assert.equal(heldTime(3599), "59 min");
    assert.equal(elapsed(61), "1m 1s");
    assert.equal(words(61), "1 minute 1 second");
    const account = "0x1111111111111111111111111111111111111111",
      other = "0x2222222222222222222222222222222222222222";
    const a = {
        index: "0",
        amount: "1000000000000000000000",
        account,
        proof: [],
      },
      b = { index: "0x1", amount: "0x20", account: other, proof: [] };
    const leaf = (c) =>
      keccak256(
        encodePacked(
          ["uint256", "address", "uint256"],
          [BigInt(c.index), c.account, BigInt(c.amount)],
        ),
      );
    const left = leaf(a),
      right = leaf(b),
      root = keccak256(
        left < right ? left + right.slice(2) : right + left.slice(2),
      );
    a.proof = [right];
    b.proof = [left];
    assert.equal(normalizeClaims([a, b]).length, 2);
    assert.equal(normalizeClaims({ claims: { [other]: b } })[0].index, "1");
    assert.equal(
      normalizeClaims([
        null,
        { ...a, index: 9007199254740993 },
        { ...a, amount: 1000000000000000000000 },
        { ...a, proof: ["0x1"] },
        { ...a, amount: "-1" },
      ]).length,
      0,
    );
    for (const c of normalizeClaims([a, b]))
      assert.equal(verifyClaim(c, root), true);
    assert.equal(verifyClaim({ ...a, amount: "999" }, root), false);
    assert.equal(verifyClaim({ ...a, account: other }, root), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
