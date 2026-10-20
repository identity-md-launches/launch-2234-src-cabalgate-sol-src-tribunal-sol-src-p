import { requestUuid } from "./oracle-id";
import { APP, type Runtime } from "./config";
import { read, type Plea } from "./chain";
export async function oracleRequest(r: Runtime, p: Plea, logs: any[]) {
  const event = logs.find(
    (l) => l.eventName === "Verdict" && l.args.id === p.id,
  );
  let id = event ? requestUuid(event.args.oracleRequestId) : undefined;
  if (!id) {
    const question = await read(r, "CabalGate", "question", [p.id]);
    const list = await fetch(`${APP.oracleApi}/oracle/requests`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!list.ok) throw Error("Oracle list unavailable");
    const body = await list.json();
    id = body.requests?.find((x: any) => x.question === question)?.id;
  }
  if (!id)
    throw Error("This request is not in the public API’s latest requests yet.");
  const result = await fetch(
    `${APP.oracleApi}/oracle/requests/${encodeURIComponent(id)}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!result.ok) throw Error("Oracle request unavailable");
  return result.json();
}
