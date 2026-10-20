/** PoolSwapTest's live hook delivers PLEA directly, so v4 Quoter may report zero delta.
 * This indicative calculation walks the hook's two liquidity bands. Execution still simulates
 * the real router, and the UI discloses that its price limit can partially fill an input.
 */
const Q96 = 2n ** 96n;
const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
/** Exact Uniswap v4 TickMath Q128.128 products, uint256 inversion, Q64.96 round up. */
export function sqrtAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || Math.abs(tick) > 887272)
    throw Error("Tick is outside the pool's range.");
  const bits = Math.abs(tick);
  const ratios = [
    0xfffcb933bd6fad37aa2d162d1a594001n,
    0xfff97272373d413259a46990580e213an,
    0xfff2e50f5f656932ef12357cf3c7fdccn,
    0xffe5caca7e10e4e61c3624eaa0941cd0n,
    0xffcb9843d60f6159c9db58835c926644n,
    0xff973b41fa98c081472e6896dfb254c0n,
    0xff2ea16466c96a3843ec78b326b52861n,
    0xfe5dee046a99a2a811c461f1969c3053n,
    0xfcbe86c7900a88aedcffc83b479aa3a4n,
    0xf987a7253ac413176f2b074cf7815e54n,
    0xf3392b0822b70005940c7a398e4b70f3n,
    0xe7159475a2c29b7443b29c7fa6e889d9n,
    0xd097f3bdfd2022b8845ad8f792aa5825n,
    0xa9f746462d870fdf8a65dc1f90e061e5n,
    0x70d869a156d2a1b890bb3df62baf32f7n,
    0x31be135f97d08fd981231505542fcfa6n,
    0x9aa508b5b7a84e1c677de54f3e99bc9n,
    0x5d6af8dedb81196699c329225ee604n,
    0x2216e584f5fa1ea926041bedfe98n,
    0x48a170391f7dc42444e8fa2n,
  ];
  let ratio = 1n << 128n;
  ratios.forEach((r, i) => {
    if (bits & (1 << i)) ratio = (ratio * r) >> 128n;
  });
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio + (1n << 32n) - 1n) >> 32n;
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
  return { out: out - (out * outputBps) / 10000n, gross: out, next: current };
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

export const bandOf = (b: any): Band => ({
  tickLower: Number(b[0]),
  tickUpper: Number(b[1]),
  liquidity: BigInt(b[2]),
});
export function bandAmount0(b: Band, sqrt: bigint) {
  if (!b.liquidity) return 0n;
  const lo = sqrtAtTick(b.tickLower),
    hi = sqrtAtTick(b.tickUpper);
  const at = sqrt < lo ? lo : sqrt > hi ? hi : sqrt;
  return (b.liquidity * Q96 * (hi - at)) / (at * hi);
}
export function unpackDelta(delta: bigint) {
  return [
    BigInt.asIntN(128, delta >> 128n),
    BigInt.asIntN(128, delta),
  ] as const;
}
