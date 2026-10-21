import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  sqrtAtTick,
  estimateHookOutput,
  priceLimit,
  unpackDelta,
} from "../src/swap-math.ts";
import {
  potFor,
  clampAppeal,
  pendingState,
  LETTERBOX,
  Q96,
  factParts,
} from "../src/models.ts";
import { explainError, messages } from "../src/errors.ts";
import { parseAbi, encodeErrorResult } from "viem";
const E = 10n ** 18n;
test("T1: exact TickMath seed boundary quotes the first 2 imdTEST buy", () => {
  const sqrt = 33124552144596724627636001868808n;
  assert.equal(sqrtAtTick(120720), sqrt);
  const q = estimateHookOutput({
    amount: 2n * E,
    zeroForOne: true,
    sqrt,
    bands: [
      {
        tickLower: -887220,
        tickUpper: 120720,
        liquidity: 1961295295737331612477319n,
      },
    ],
    inputBps: 7200n,
    outputBps: 25n,
  });
  assert.ok(q.out > 202000n * E && q.out < 204000n * E);
  assert.ok(q.next < sqrt && q.gross > q.out);
});
test("TickMath exact endpoints, zero, invalid inputs, and monotonic symmetry", () => {
  assert.equal(sqrtAtTick(0), Q96);
  assert.equal(sqrtAtTick(-887272), 4295128739n);
  assert.equal(
    sqrtAtTick(887272),
    1461446703485210103287273052203988822378723970342n,
  );
  assert.throws(() => sqrtAtTick(887273));
  assert.throws(() => sqrtAtTick(1.1));
  for (const tick of [1, 100, 120720, 600000]) {
    assert.ok(sqrtAtTick(-tick) < Q96);
    assert.ok(sqrtAtTick(tick) > Q96);
    assert.ok(sqrtAtTick(tick - 1) < sqrtAtTick(tick));
  }
});
test("T3: limit is beyond post-trade price, and packed BalanceDelta is signed", () => {
  const q = estimateHookOutput({
    amount: 30n * E,
    zeroForOne: true,
    sqrt: sqrtAtTick(120720),
    bands: [
      {
        tickLower: -887220,
        tickUpper: 120720,
        liquidity: 1961295295737331612477319n,
      },
    ],
    inputBps: 200n,
    outputBps: 25n,
  });
  assert.ok(priceLimit(q.next, 50, true) < q.next);
  assert.ok(
    priceLimit(q.next, 50, true) < priceLimit(sqrtAtTick(120720), 50, true),
  );
  const delta = ((-30n * E) << 128n) | BigInt.asUintN(128, 1000n * E);
  assert.deepEqual(unpackDelta(delta), [-30n * E, 1000n * E]);
});
test("S1: rollover belongs only to nextToClose, never the running season too", () => {
  assert.equal(potFor(100n, 0n, 0n, 20n), 120n);
  assert.equal(potFor(50n, 1n, 0n, 20n), 50n);
  assert.equal(potFor(50n, 1n, 1n, 120n), 170n);
});
test("C4: automatic appeal includes returned escrow before its original-share clamp", () => {
  const original = 1000000n * E,
    held = 4000000n * E,
    escrow = 1000000n * E,
    origBalance = 6000000n * E,
    price = Q96 / 100000n;
  const without = clampAppeal(
      original,
      held,
      origBalance,
      2500000n * E,
      price,
      true,
    ),
    withEscrow = clampAppeal(
      original,
      held + escrow,
      origBalance,
      2500000n * E,
      price,
      true,
    );
  assert.equal(withEscrow.amount, ((held + escrow) * original) / origBalance);
  assert.ok(withEscrow.amount > without.amount);
  assert.equal(
    clampAppeal(
      original,
      held,
      origBalance,
      2500000n * E,
      price,
      false,
      500000n * E,
    ).amount,
    500000n * E,
  );
});
test("C4: appeal floor is 0.70, never greater than original or half balance", () => {
  const result = clampAppeal(
    100n,
    150n,
    1000n,
    250n,
    (LETTERBOX.MIN_SALE_VALUE * Q96) / 1000n,
    true,
  );
  assert.equal(result.amount, 75n);
});
test("C1/X19: exact deadline remains open; lapse cooldown starts at verdict", () => {
  const p = { status: 2, verdictAt: 1000n, submittedAt: 0n };
  assert.equal(pendingState(p, 1420, 420, 1200).open, true);
  const lapsed = pendingState(p, 1421, 420, 1200);
  assert.equal(lapsed.open, false);
  assert.equal(lapsed.lapsedAt, 1000);
  assert.equal(lapsed.settleable, true);
  assert.equal(
    pendingState({ status: 1, submittedAt: 1000n }, 2200, 420, 1200).open,
    true,
  );
  assert.equal(
    pendingState({ status: 1, submittedAt: 1000n }, 2201, 420, 1200).open,
    false,
  );
});
test("C10: exact share edges and uncovered PLEA use weighted facts", () => {
  const parts = factParts(
    1000n,
    200n,
    [100n, 1000n, 100n],
    Q96 / 20n,
    0n,
    100,
    100,
  );
  assert.equal(parts.share, 16);
  assert.equal(parts.total, 34);
  assert.equal(
    factParts(1000n, 201n, [100n, 1000n, 100n], Q96 / 20n, 0n, 100, 100).share,
    9,
  );
  const uncovered = factParts(1000n, 200n, [0n, 0n, 0n], Q96, 0n, 100, 100);
  assert.equal(uncovered.total, 31);
});
test("T4: nested PoolManager WrappedError decodes the inner hook error", () => {
  const hook = parseAbi(["error BuyTooLarge(uint256 amount,uint256 maximum)"]),
    wrap = parseAbi([
      "error WrappedError(address target,bytes4 selector,bytes reason,bytes details)",
    ]);
  const inner = encodeErrorResult({
    abi: hook,
    errorName: "BuyTooLarge",
    args: [6000000n * E, 5000000n * E],
  });
  const data = encodeErrorResult({
    abi: wrap,
    errorName: "WrappedError",
    args: [
      "0x1111111111111111111111111111111111111111",
      "0x12345678",
      inner,
      "0x",
    ],
  });
  assert.match(explainError({ cause: { data } }, [hook]).title, /launch cap/);
});
test("T4: every custom error in all eight pinned ABIs has a plain remedy", () => {
  for (const file of fs.readdirSync(
    new URL("../public/abi/", import.meta.url),
  )) {
    const abi = JSON.parse(
      fs.readFileSync(new URL("../public/abi/" + file, import.meta.url)),
    );
    for (const e of abi.filter((e) => e.type === "error"))
      assert.ok(messages[e.name], `${file}: ${e.name}`);
  }
});
