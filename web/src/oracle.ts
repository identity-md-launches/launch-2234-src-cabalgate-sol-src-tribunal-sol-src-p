import { requestUuid } from "./oracle-id";
import { APP, type Runtime } from "./config";
import { read, type Plea } from "./chain";
export async function oracleRequest(r: Runtime, p: Plea, logs: any[]) {
  const event = logs.find(
      (l) => l.eventName === "Verdict" && l.args.id === p.id,
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
  if (id) return get(id);
  const question = await read(r, "CabalGate", "question", [p.id]),
    list = await fetch(`${APP.oracleApi}/oracle/requests`, {
      signal: AbortSignal.timeout(10000),
    });
  if (!list.ok) throw Error("Oracle list unavailable");
  const body = await list.json(),
    matches = (body.requests || [])
      .filter((x: any) => x.question === question)
      .slice(0, 3);
  for (const match of matches) {
    try {
      const detail = await get(match.id),
        consumer =
          detail.consumer || detail.request?.consumer || detail.body?.consumer;
      if (
        consumer?.verifyingContract?.toLowerCase() ===
          r.addresses.CabalGate.toLowerCase() &&
        Number(consumer.chainId) === r.chain.id
      )
        return detail;
    } catch {}
  }
  throw Error("This request is not in the public API’s latest requests yet.");
}
