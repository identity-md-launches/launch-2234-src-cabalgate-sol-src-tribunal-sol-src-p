/** PoolSwapTest's live hook delivers PLEA directly, so v4 Quoter may report zero delta.
 * This indicative calculation walks the hook's two liquidity bands. Execution still simulates
 * the real router, and the UI discloses that its price limit can partially fill an input.
 */
const Q96 = 2n ** 96n;
const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
export function sqrtAtTick(tick: number) {
  return BigInt(Math.floor(Math.pow(1.0001, tick / 2) * 2 ** 96));
}
export type Band = { tickLower: number; tickUpper: number; liquidity: bigint };
export function estimateHookOutput({
  amount,
  zeroForOne,
  sqrt,
  bands,
  inputBps,
  outputBps,
}: {
  amount: bigint;
  zeroForOne: boolean;
  sqrt: bigint;
  bands: Band[];
  inputBps: bigint;
  outputBps: bigint;
}) {
  let remaining = amount - (amount * inputBps) / (10000n + inputBps),
    out = 0n,
    current = sqrt;
  const ranges = bands
    .filter((b) => b.liquidity > 0n)
    .map((b) => ({
      ...b,
      lo: sqrtAtTick(b.tickLower),
      hi: sqrtAtTick(b.tickUpper),
    }));
  for (let steps = 0; steps < 6 && remaining > 0n; steps++) {
    const active = ranges.filter((b) =>
      zeroForOne
        ? current > b.lo && current <= b.hi
        : current >= b.lo && current < b.hi,
    );
    const liquidity = active.reduce((n, b) => n + b.liquidity, 0n);
    if (liquidity === 0n)
      throw Error("Not enough active pool liquidity for this quote.");
    const boundaries = ranges.flatMap((b) => [b.lo, b.hi]);
    const boundary = zeroForOne
      ? boundaries
          .filter((b) => b < current)
          .reduce((x, b) => (b > x ? b : x), 0n)
      : boundaries
          .filter((b) => b > current)
          .reduce((x, b) => (b < x ? b : x), 2n ** 160n - 1n);
    const required = zeroForOne
      ? ceil(liquidity * Q96 * (current - boundary), current * boundary)
      : ceil(liquidity * (boundary - current), Q96);
    const used = remaining < required ? remaining : required;
    const next =
      used === required
        ? boundary
        : zeroForOne
          ? ceil(liquidity * Q96 * current, liquidity * Q96 + used * current)
          : current + (used * Q96) / liquidity;
    out += zeroForOne
      ? (liquidity * (current - next)) / Q96
      : (liquidity * Q96 * (next - current)) / (current * next);
    current = next;
    remaining -= used;
  }
  if (remaining > 0n)
    throw Error("This amount crosses the pool’s available liquidity.");
  return out - (out * outputBps) / 10000n;
}

export function integerSqrt(n: bigint) {
  if (n < 0n) throw Error("Negative square root");
  if (n < 2n) return n;
  let x = n,
    y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}
export function priceLimit(
  sqrt: bigint,
  slippageBps: number,
  zeroForOne: boolean,
) {
  const bps = BigInt(10000 - slippageBps);
  return integerSqrt(
    zeroForOne ? (sqrt * sqrt * bps) / 10000n : (sqrt * sqrt * 10000n) / bps,
  );
}
