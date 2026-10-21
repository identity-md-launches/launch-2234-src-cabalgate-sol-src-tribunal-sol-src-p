/** Classify causes, never the URL embedded in viem's formatted message. */
export function rpcDetail(error: any) {
  const nodes: any[] = [],
    seen = new Set();
  for (let e = error; e && !seen.has(e); e = e.cause || e.error) {
    seen.add(e);
    nodes.push(e);
  }
  return {
    nodes,
    text: nodes
      .map((e) =>
        [e.details, e.shortMessage, e.message, e.body]
          .filter(Boolean)
          .join(" "),
      )
      .join(" "),
  };
}
export const rangePattern =
  /limited to [\d,]+ blocks|query returned more than|too many results|response size|block range (is )?too (large|wide)|exceeds? (the )?max(imum)? block range/i;
export const headPattern =
  /beyond (current head|the latest) block|extends beyond current head block|retry later|header not found|unknown block/i;
export function classifyRpc(error: any): "request" | "answer" | "transport" {
  const { nodes, text } = rpcDetail(error);
  if (
    /execution reverted|revert data/i.test(text) ||
    nodes.some(
      (e) => typeof e.data === "string" && /^0x[\da-f]{8}/i.test(e.data),
    ) ||
    rangePattern.test(text)
  )
    return "request";
  if (headPattern.test(text)) return "answer";
  const codes = nodes.map((e) => e.code).filter((c) => typeof c === "number");
  if (
    codes.some((c) => c === -32005 || c === 429) ||
    /rate limit|too many requests/i.test(text)
  )
    return "transport";
  if (codes.some((c) => c !== -1)) return "answer";
  if (
    nodes.some(
      (e) =>
        e.name === "TimeoutError" ||
        e.name === "TypeError" ||
        e.name === "HttpRequestError" ||
        e.status === 429 ||
        e.status >= 500,
    )
  )
    return "transport";
  return "answer";
}
const resets = new Set<() => void>();
export function registerHealthReset(reset: () => void) {
  resets.add(reset);
}
export function resetHealth() {
  resets.forEach((reset) => reset());
}
export async function rpcFetch(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, init);
  if (res.ok) return res;
  const text = (await res.clone().text()).slice(0, 2000);
  try {
    if (typeof JSON.parse(text).error?.code === "number") return res;
  } catch {}
  throw Object.assign(new Error(`HTTP ${res.status}: ${text}`), {
    status: res.status,
    details: text,
  });
}
