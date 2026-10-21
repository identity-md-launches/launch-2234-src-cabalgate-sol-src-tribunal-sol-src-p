import { requestUuid } from "./oracle-id";
import { APP, type Runtime } from "./config";
import { read, type Plea } from "./chain";
export type OracleData = {
  id: string;
  panelSize?: number;
  agreed?: number;
  comment?: string;
};
export function sanitizeOracle(data: any, id: string): OracleData {
  if (!data || data.id !== id)
    throw Error("Oracle request identity does not match.");
  const result: OracleData = { id },
    size = data.panelSize,
    agreed = data.attestation?.agreed ?? data.agreement?.agreed ?? data.agreed;
  if (Number.isSafeInteger(size) && size >= 0 && size <= 1000) {
    result.panelSize = size;
    if (Number.isSafeInteger(agreed) && agreed >= 0 && agreed <= size)
      result.agreed = agreed;
  }
  if (typeof data.comment === "string")
    result.comment = Array.from(data.comment).slice(0, 280).join("");
  return result;
}
export async function oracleRequest(
  r: Runtime,
  p: Plea,
  logs: any[],
  objection?: any,
): Promise<OracleData> {
  const event = logs.find((l) =>
      objection
        ? l.eventName === "Ruled" && l.args.id === objection.id
        : l.eventName === "Verdict" && l.args.id === p.id,
    ),
    id = event ? requestUuid(event.args.oracleRequestId) : undefined;
  const get = async (id: string) => {
    const response = await fetch(
      `${APP.oracleApi}/oracle/requests/${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) throw Error("Oracle request unavailable");
    return response.json();
  };
  if (id) return sanitizeOracle(await get(id), id);
  const question = await read(
    r,
    objection ? "Tribunal" : "CabalGate",
    "question",
    [objection?.id ?? p.id],
  );
  const list = await fetch(`${APP.oracleApi}/oracle/requests`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!list.ok) throw Error("Oracle list unavailable");
  const body = await list.json();
  const matches = (Array.isArray(body.requests) ? body.requests : [])
    .filter((x: any) => x.question === question && typeof x.id === "string")
    .slice(0, 3);
  for (const match of matches)
    try {
      const detail = await get(match.id),
        consumer =
          detail.consumer || detail.request?.consumer || detail.body?.consumer;
      if (
        typeof consumer?.verifyingContract === "string" &&
        consumer.verifyingContract.toLowerCase() ===
          r.addresses[objection ? "Tribunal" : "CabalGate"].toLowerCase() &&
        Number(consumer.chainId) === r.chain.id
      )
        return sanitizeOracle(detail, match.id);
    } catch {}
  throw Error("This request is not in the public API’s latest requests yet.");
}
