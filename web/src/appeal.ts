import { con, read, readPlea, type Plea, type Snapshot } from "./chain";
import type { Runtime } from "./config";
import {
  LETTERBOX,
  clampAppeal,
  ceil,
  min,
  sharePoints,
  pendingState,
  Q96,
} from "./models";
export async function returnedEscrow(
  r: Runtime,
  s: Snapshot,
  wallet: `0x${string}`,
  now: number,
) {
  const [id] = await read(r, "Letterbox", "openOf", [wallet]);
  if (!id) return { returned: 0n, blocked: "" };
  const [escrow, plea] = await Promise.all([
    read(r, "Letterbox", "escrowOf", [id]),
    readPlea(r, id, s.v["CabalGate.intake"]),
  ]);
  const state = pendingState(
    plea,
    now,
    Number(con(s, "CabalGate.EXECUTE_WINDOW")),
    Number(con(s, "CabalGate.PENDING_EXPIRY")),
  );
  return {
    returned: escrow[1] && state.settleable ? BigInt(escrow[2]) : 0n,
    blocked:
      escrow[1] && !state.settleable
        ? `Plea #${id} is still open: one plea at a time.`
        : "",
  };
}
export async function appealPreview(
  r: Runtime,
  s: Snapshot,
  p: Plea,
  wallet: `0x${string}`,
  automatic: boolean,
  requested: bigint,
) {
  const [held, originalBalance, price, escrow] = await Promise.all([
    read(r, "PLEA", "balanceOf", [wallet]),
    read(r, "CabalGate", "pleaBalance", [p.id]),
    read(r, "PleaHook", "latestPrice"),
    automatic
      ? returnedEscrow(r, s, wallet, s.timestamp)
      : { returned: 0n, blocked: "" },
  ]);
  const balance = BigInt(held) + escrow.returned;
  const result = clampAppeal(
    p.amount,
    balance,
    originalBalance,
    BigInt(con(s, "CabalGate.MAX_SELL")),
    price,
    automatic,
    requested,
  );
  let fact = Number(
    await read(r, "CabalGate", "factScore", [wallet, result.amount]),
  );
  if (held && balance && originalBalance)
    fact +=
      sharePoints(
        min(
          ceil(result.amount * 10000n, balance),
          ceil(p.amount * 10000n, originalBalance),
        ),
      ) - sharePoints(ceil(result.amount * 10000n, held));
  const fee = BigInt(s.v.appealFees?.[1] || 0n);
  const reason =
    escrow.blocked ||
    (automatic &&
    price &&
    (result.amount * price) / Q96 < LETTERBOX.MIN_SALE_VALUE
      ? "Auto-sell needs a sale worth at least 0.70 imdTEST. Untick auto-sell to appeal manually."
      : automatic &&
          ((fee * 10n > balance && fee * 10000n > p.amount * 11000n) ||
            result.amount + fee > balance)
        ? "The auto-sell fee exceeds this appeal’s balance or fee cap. Untick auto-sell to pay from your imdTEST."
        : "");
  return {
    ...result,
    fact,
    need: Number(con(s, "CabalGate.PASS_MARK")) - fact,
    balance,
    returned: escrow.returned,
    reason,
  };
}
