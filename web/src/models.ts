/** Immutable internal Letterbox constants, pinned src/Letterbox.sol:111–136. */
export const LETTERBOX = {
  MIN_LETTER: 1000n * 10n ** 18n,
  TIP: 250000000000000000n,
  AUTO_SELL_FEE: 350000000000000000n,
  MIN_SALE_VALUE: 700000000000000000n,
  MIN_OUT_BPS: 9500n,
  MAX_FEE_SHARE_BPS: 1000n,
  FEE_CAP_BPS: 11000n,
};
export const Q96 = 2n ** 96n;
export const min = (a: bigint, b: bigint) => (a < b ? a : b);
export const max = (a: bigint, b: bigint) => (a > b ? a : b);
export const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
export const sharePoints = (bps: bigint) =>
  bps <= 2000n ? 16 : bps <= 3500n ? 9 : 3;
export function pendingState(
  p: any,
  now: number,
  execute: number,
  expiry: number,
  lastLapsed = 0,
) {
  if (!p) return { open: false, lapsedAt: lastLapsed, settleable: false };
  const open =
    (p.status === 1 && !p.completed && now <= Number(p.submittedAt) + expiry) ||
    (p.status === 2 && now <= Number(p.verdictAt) + execute);
  const lapsedAt =
    p.status === 2 && !open
      ? Math.max(lastLapsed, Number(p.verdictAt))
      : lastLapsed;
  return {
    open,
    lapsedAt,
    settleable:
      [3, 5, 6].includes(p.status) || ([1, 2].includes(p.status) && !open),
  };
}
export function potFor(
  fees: bigint,
  season: bigint,
  nextToClose: bigint,
  rollover: bigint,
) {
  return fees + (season === nextToClose ? rollover : 0n);
}
export function clampAppeal(
  original: bigint,
  balance: bigint,
  originalBalance: bigint,
  maxSell: bigint,
  price: bigint,
  automatic: boolean,
  requested = original,
) {
  const minimum = min(min(balance, originalBalance || balance) / 100n, maxSell);
  if (!automatic)
    return { amount: requested, minimum, maximum: min(original, balance / 2n) };
  let amount = min(original, balance / 2n);
  if (originalBalance)
    amount = max(min(amount, (balance * original) / originalBalance), minimum);
  if (price && amount < ceil(LETTERBOX.MIN_SALE_VALUE * Q96, price))
    amount = min(
      min(ceil(LETTERBOX.MIN_SALE_VALUE * Q96, price), original),
      balance / 2n,
    );
  return { amount, minimum, maximum: min(original, balance / 2n) };
}
export function factParts(
  balance: bigint,
  amount: bigint,
  basis: readonly bigint[],
  latest: bigint,
  previous: bigint,
  started: number,
  now: number,
) {
  const heldPoints = (t: number) =>
    !t || t > now
      ? 0
      : now - t >= 604800
        ? 7
        : now - t >= 259200
          ? 4
          : now - t >= 86400
            ? 2
            : 0;
  const share = balance ? sharePoints(ceil(amount * 10000n, balance)) : 0,
    held = heldPoints(Number(basis[2]));
  const value = (basis[1] * latest) / Q96,
    spent = basis[0],
    gain = value - spent;
  const profit = !spent
    ? 0
    : value < spent
      ? 13
      : gain * 2n <= spent
        ? 12
        : gain <= spent * 2n
          ? 10
          : gain <= spent * 5n
            ? 8
            : gain <= spent * 10n
              ? 6
              : 4;
  const trend = !previous
    ? 5
    : latest > (previous * 102n) / 100n
      ? 9
      : latest * 100n >= previous * 98n
        ? 5
        : 0;
  const covered = Number(
    basis[1] < amount && amount
      ? (basis[1] * BigInt(held + profit) +
          (amount - basis[1]) * BigInt(heldPoints(started) + 10) +
          amount / 2n) /
          amount
      : BigInt(held + profit),
  );
  return {
    share,
    held,
    profit,
    trend,
    total: balance ? share + covered + trend : 0,
    uncovered: basis[1] < amount ? amount - basis[1] : 0n,
    weighted: covered,
  };
}
