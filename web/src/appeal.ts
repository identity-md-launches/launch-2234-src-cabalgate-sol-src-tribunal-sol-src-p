import { con, read, type Plea, type Snapshot } from "./chain";
import type { Runtime } from "./config";
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b;
// The immutable share bands are the pinned CabalGate._factScoreAt definition. All current
// holding, profit and trend facts still come from factScore; only its appeal share clamp is added.
const sharePoints = (bps: bigint) => (bps <= 2000n ? 16 : bps <= 3500n ? 9 : 3);
export async function appealPreview(
  r: Runtime,
  s: Snapshot,
  p: Plea,
  wallet: `0x${string}`,
  automatic: boolean,
  requested: bigint,
) {
  const [balance, originalBalance, price] = (await Promise.all([
    read(r, "PLEA", "balanceOf", [wallet]),
    read(r, "CabalGate", "pleaBalance", [p.id]),
    read(r, "PleaHook", "latestPrice"),
  ])) as [bigint, bigint, bigint];
  const maxShare = BigInt(con(s, "CabalGate.MAX_SHARE_BPS")),
    maxSell = BigInt(con(s, "CabalGate.MAX_SELL"));
  const minimum = min(
    (min(balance, originalBalance || balance) *
      BigInt(con(s, "CabalGate.MIN_SHARE_BPS"))) /
      10000n,
    maxSell,
  );
  let amount = requested;
  if (automatic) {
    amount = min(p.amount, (balance * maxShare) / 10000n);
    if (originalBalance) {
      amount = min(amount, (balance * p.amount) / originalBalance);
      if (amount < minimum) amount = minimum;
    }
    // Run 9's immutable Letterbox MIN_SALE_VALUE is exactly twice the public wall-share constant.
    // This equality is source-bound to deployment-input.json's accepted source commit.
    const floorValue = BigInt(con(s, "CabalGate.APPEAL_POOL_SHARE")) * 2n;
    if (price > 0n) {
      const floor = ceil(floorValue * 2n ** 96n, price);
      if (amount < floor)
        amount = min(min(floor, p.amount), (balance * maxShare) / 10000n);
    }
  }
  let fact = Number(await read(r, "CabalGate", "factScore", [wallet, amount]));
  if (balance && originalBalance) {
    const share = ceil(amount * 10000n, balance),
      originalShare = ceil(p.amount * 10000n, originalBalance);
    fact += sharePoints(min(share, originalShare)) - sharePoints(share);
  }
  return {
    amount,
    fact,
    need: Number(con(s, "CabalGate.PASS_MARK")) - fact,
    minimum,
    maximum: min(p.amount, (balance * maxShare) / 10000n),
    balance,
  };
}
