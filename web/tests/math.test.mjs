import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateHookOutput,
  priceLimit,
  integerSqrt,
  sqrtAtTick,
} from "../src/swap-math.ts";
import { explainError } from "../src/errors.ts";
import { parseAbi, encodeErrorResult } from "viem";
const Q = 2n ** 96n,
  L = 10n ** 24n,
  bands = [{ tickLower: -1000, tickUpper: 1000, liquidity: L }];
test("indicative exact-input calculation charges both hook fee legs", () => {
  const input = 10n ** 18n,
    fee = (input * 200n) / 10200n,
    net = input - fee,
    next = (L * Q * Q + L * Q + net * Q - 1n) / (L * Q + net * Q),
    raw = (L * (Q - next)) / Q;
  const out = estimateHookOutput({
    amount: input,
    zeroForOne: true,
    sqrt: Q,
    bands,
    inputBps: 200n,
    outputBps: 25n,
  });
  assert.equal(out, raw - (raw * 25n) / 10000n);
  assert.ok(out > 0n && out < input);
});
test("quotes are monotonic and never manufacture value at unit price", () => {
  let last = 0n;
  for (const size of [1n, 10n, 100n, 1000n, 10000n]) {
    const input = size * 10n ** 18n;
    const out = estimateHookOutput({
      amount: input,
      zeroForOne: false,
      sqrt: Q,
      bands,
      inputBps: 25n,
      outputBps: 200n,
    });
    assert.ok(out >= last && out < input);
    last = out;
  }
});
test("walks a second liquidity range when crossing its boundary", () => {
  const split = [
    { tickLower: -1000, tickUpper: 0, liquidity: L },
    { tickLower: 0, tickUpper: 1000, liquidity: L },
  ];
  const input = 10n ** 22n,
    params = {
      amount: input,
      zeroForOne: true,
      sqrt: sqrtAtTick(100),
      inputBps: 0n,
      outputBps: 0n,
    };
  const whole = estimateHookOutput({ ...params, bands });
  const pieces = estimateHookOutput({ ...params, bands: split });
  assert.ok(whole >= pieces && whole - pieces <= 3n);
});
test("price slippage is applied to price rather than twice to its square root", () => {
  const down = priceLimit(Q, 100, true),
    up = priceLimit(Q, 100, false);
  assert.ok(down * down <= (Q * Q * 9900n) / 10000n);
  assert.ok((down + 1n) * (down + 1n) > (Q * Q * 9900n) / 10000n);
  assert.ok(up > Q);
  assert.equal(integerSqrt(81n), 9n);
});
test("out-of-liquidity estimates fail instead of returning a partial quote", () => {
  assert.throws(
    () =>
      estimateHookOutput({
        amount: 10n ** 40n,
        zeroForOne: true,
        sqrt: Q,
        bands,
        inputBps: 0n,
        outputBps: 0n,
      }),
    /liquidity/,
  );
});
test("custom error data and wallet rejection become plain remedies", () => {
  const abi = parseAbi(["error CannotPass(uint256 need)"]);
  const data = encodeErrorResult({ abi, errorName: "CannotPass", args: [50n] });
  assert.match(explainError({ cause: { data } }, [abi]), /cannot pass/);
  assert.match(explainError({ code: 4001 }), /declined/);
  assert.match(
    explainError({ message: "insufficient funds for gas" }),
    /Sepolia ETH/,
  );
});

test("oracle attestation IDs map to API UUIDs, not Intake hashes", async () => {
  const { requestUuid } = await import("../src/oracle-id.ts");
  assert.equal(
    requestUuid("0xebe6ff4d3f1948e1a4cc1c2f0e35547d" + "0".repeat(32)),
    "ebe6ff4d-3f19-48e1-a4cc-1c2f0e35547d",
  );
  assert.equal(requestUuid("0x" + "a".repeat(64)), undefined);
  assert.equal(requestUuid("0x" + "0".repeat(64)), undefined);
});
