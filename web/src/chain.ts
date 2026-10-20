import { potFor, factParts, sharePoints, ceil, min } from "./models";
import {
  decodeEventLog,
  keccak256,
  encodePacked,
  isAddress,
  zeroAddress,
  type Address,
  type Abi,
} from "viem";
import { APP, erc20Abi, intakeAbi, type Runtime } from "./config";
export type Plea = {
  id: bigint;
  seller: Address;
  factScore: number;
  need: number;
  score: number;
  status: number;
  appealed: boolean;
  isAppeal: boolean;
  flags: number;
  amount: bigint;
  submittedAt: bigint;
  verdictAt: bigint;
  originalId: bigint;
  intakeId: `0x${string}`;
  text: string;
  standing?: readonly [boolean, boolean, number];
  recorded?: boolean;
  excluded?: boolean;
  points?: number;
  name?: string;
  seat?: boolean;
  escrow?: readonly [Address, boolean, bigint, bigint];
  objections?: any[];
  completed?: boolean;
  failure?: any;
  balance?: bigint;
  facts?: any;
  submittedLog?: any;
  verdictLog?: any;
};
export type Snapshot = {
  v: Record<string, any>;
  constants: Record<string, any>;
  logs: any[];
  pleas: Plea[];
  block: bigint;
  timestamp: number;
  historyError?: string;
};
export const read = (r: Runtime, name: string, fn: string, args: any[] = []) =>
  r.client.readContract({
    address: r.addresses[name],
    abi: r.abis[name] || erc20Abi,
    functionName: fn,
    args,
  }) as Promise<any>;
export async function readStatic(r: Runtime) {
  const c: Record<string, any> = {};
  await Promise.all(
    Object.entries(r.abis).flatMap(([name, abi]) =>
      abi
        .filter(
          (f: any) =>
            f.type === "function" &&
            f.inputs.length === 0 &&
            /^[A-Z][A-Z_0-9]*$/.test(f.name) &&
            f.stateMutability !== "nonpayable",
        )
        .map(async (f: any) => {
          c[`${name}.${f.name}`] = await read(r, name, f.name);
        }),
    ),
  );
  const [symbol, decimals, pairSymbol, pairDecimals] = await Promise.all([
    read(r, "PLEA", "symbol"),
    read(r, "PLEA", "decimals"),
    read(r, "PairToken", "symbol"),
    read(r, "PairToken", "decimals"),
  ]);
  return { ...c, symbol, decimals, pairSymbol, pairDecimals };
}
// Every request covers at most 10,000 blocks. Limit errors shrink the range, never discard it.
let logChunk = 10000n;
export async function scanLogs(
  r: Runtime,
  from: bigint,
  to: bigint,
): Promise<any[]> {
  if (from > to) return [];
  const logs: any[] = [];
  async function chunk(a: bigint, b: bigint): Promise<any[]> {
    try {
      return await r.client.getLogs({
        address: Object.entries(r.addresses)
          .filter(([n]) => n !== "PairToken")
          .map(([, a]) => a),
        fromBlock: a,
        toBlock: b,
      });
    } catch (e) {
      const error: any = e;
      const detail = [
        error?.shortMessage,
        error?.message,
        error?.details,
        error?.cause?.details,
        error?.body,
        error?.cause?.body,
      ].join(" ");
      const limit = detail.match(/limited to ([\d,]+) blocks/i);
      if (limit) logChunk = BigInt(limit[1].replaceAll(",", ""));
      if (
        a === b ||
        !/block range|too many results|range.*(?:limit|large)|query returned|response size|10,000|maximum.*block|exceed.*block|limited to .* blocks/i.test(
          detail,
        )
      )
        throw e;
      if (!limit) logChunk = (b - a + 1n) / 2n || 1n;
      const mid = (a + b) / 2n;
      return [...(await chunk(a, mid)), ...(await chunk(mid + 1n, b))];
    }
  }
  for (let a = from; a <= to;) {
    const end = a + logChunk - 1n > to ? to : a + logChunk - 1n;
    logs.push(...(await chunk(a, end)));
    a = end + 1n;
  }
  return logs.map((log) => {
    const name = Object.keys(r.addresses).find(
      (n) => r.addresses[n].toLowerCase() === log.address.toLowerCase(),
    );
    try {
      return {
        ...log,
        ...decodeEventLog({
          abi: r.abis[name!],
          data: log.data,
          topics: log.topics,
        }),
        contract: name,
      };
    } catch {
      return { ...log, contract: name, eventName: "Unknown", args: {} };
    }
  });
}
export async function getPlea(
  r: Runtime,
  id: bigint,
  logs: any[] = [],
): Promise<Plea> {
  const p = { ...(await readPlea(r, id)), id } as Plea;
  if (p.seller === zeroAddress)
    throw Error("This plea does not exist. Check the plea number.");
  const [standing, recorded, name, seat, escrow, excluded, balance] =
    await Promise.all([
      read(r, "Tribunal", "standing", [id]),
      read(r, "Seasons", "recorded", [id]),
      read(r, "Letterbox", "nameOf", [p.seller]),
      read(r, "Seasons", "holdsSeat", [p.seller]),
      read(r, "Letterbox", "escrowOf", [id]),
      read(r, "Seasons", "excluded", [p.seller]),
      read(r, "CabalGate", "pleaBalance", [id]),
    ]);
  const objectionIds = logs
    .filter((l) => l.eventName === "Objected" && l.args.pleaId === id)
    .map((l) => l.args.id);
  const objections = await Promise.all(
    objectionIds.map(async (id: bigint) => ({
      ...(await read(r, "Tribunal", "objection", [id])),
      id,
      reason: logs
        .find((l) => l.eventName === "ObjectionVoid" && l.args.id === id)
        ?.args.reason?.startsWith("0x7374616c65")
        ? "stale"
        : "split",
    })),
  );
  return {
    ...p,
    balance,
    facts: await historicalFacts(r, p, balance, logs),
    submittedLog: logs.find(
      (l) => l.eventName === "PleaSubmitted" && l.args.id === id,
    ),
    verdictLog: logs.find((l) => l.eventName === "Verdict" && l.args.id === id),
    standing,
    recorded,
    points: recorded
      ? await read(r, "Seasons", "pointsOf", [id])
      : excluded || standing[1]
        ? 0
        : await read(r, "Seasons", "pointsFor", [
            p.seller,
            Math.min(p.score, Number(standing[2])),
          ]),
    excluded,
    name,
    seat,
    escrow,
    objections,
    failure: logs.find((l) => l.eventName === "PleaFailed" && l.args.id === id)
      ?.args,
  };
}
export async function readSnapshot(
  r: Runtime,
  constants: Record<string, any>,
  previous?: Snapshot,
): Promise<Snapshot> {
  const block = await r.client.getBlock();
  const v: Record<string, any> = {};
  const calls: Record<string, string[]> = {
    PleaHook: [
      "seeded",
      "launchedAt",
      "poolKey",
      "priceX96",
      "latestPrice",
      "price24hAgo",
      "inventoryCap",
      "totalBurned",
      "totalCashback",
      "retainedImd",
      "retainClaims",
      "pleaClaims",
      "pendingRebalance",
      "wall",
      "market",
      "pleaInMarket",
      "imdInMarket",
      "pleaInWall",
      "launchExtraBps",
      "wallGuardTick",
      "currentSqrtPriceX96",
      "stacker",
    ],
    CabalGate: [
      "startedAt",
      "lastVerdictAt",
      "cabalAlive",
      "diedAt",
      "nextId",
      "intake",
    ],
    Seasons: [
      "currentSeason",
      "pot",
      "nextToClose",
      "rollover",
      "bonusBurned",
      "finished",
      "seat",
    ],
    PleaDistributor: ["merkleRoot"],
    PLEA: ["totalSupply", "owner"],
    Tribunal: ["nextId"],
  };
  await Promise.all(
    Object.entries(calls).flatMap(([name, fns]) =>
      fns.map(async (fn) => {
        try {
          v[`${name}.${fn}`] = await read(r, name, fn);
        } catch (e) {
          if (!["wallGuardTick", "priceX96", "pendingRebalance"].includes(fn))
            throw e;
        }
      }),
    ),
  );
  if (v["PleaHook.seeded"]) {
    v.fees = await read(r, "Letterbox", "feesFor", [false]);
    v.appealFees = await read(r, "Letterbox", "feesFor", [true]);
  }
  const started = BigInt(v["CabalGate.startedAt"]),
    died = BigInt(v["CabalGate.diedAt"]);
  const season =
    died && started
      ? (died - 1n - started) / BigInt(constants["Seasons.SEASON"])
      : BigInt(v["Seasons.currentSeason"][1]);
  v.displayedSeason = season;
  v.seasons = {};
  await Promise.all(
    [...new Set([String(season), String(v["Seasons.nextToClose"])])].map(
      async (k) => {
        const [bounds, fees, top, closed] = await Promise.all([
          read(r, "Seasons", "seasonBounds", [BigInt(k)]),
          read(r, "Seasons", "seasonFees", [BigInt(k)]),
          read(r, "Seasons", "topOf", [BigInt(k)]),
          read(r, "Seasons", "closed", [BigInt(k)]),
        ]);
        v.seasons[k] = {
          bounds,
          fees,
          top,
          closed,
          pot: potFor(
            fees,
            BigInt(k),
            BigInt(v["Seasons.nextToClose"]),
            v["Seasons.rollover"],
          ),
        };
      },
    ),
  );
  v.top = v.seasons[String(season)].top;
  v.bounds = v.seasons[String(v["Seasons.nextToClose"])].bounds;
  v.closed = v.seasons[String(v["Seasons.nextToClose"])].closed;
  v.shares = await Promise.all(
    Array.from({ length: Number(constants["Seasons.TOP"]) }, (_, i) =>
      read(r, "Seasons", "shareBps", [BigInt(i)]),
    ),
  );
  let logs = previous?.logs || [],
    historyError: string | undefined;
  try {
    logs = [
      ...logs,
      ...(await scanLogs(
        r,
        previous ? previous.block + 1n : APP.eventStart,
        block.number,
      )),
    ];
  } catch {
    historyError =
      "History could not be read completely. Try again; cashback totals are hidden until the scan completes.";
  }
  const next = v["CabalGate.nextId"];
  const ids = Array.from(
    { length: Math.min(Number(next - 1n), 24) },
    (_, i) => next - 1n - BigInt(i),
  );
  const pleas = await Promise.all(ids.map((id) => getPlea(r, id, logs)));
  const objectionCount = Number(v["Tribunal.nextId"] - 1n);
  const objections = await Promise.all(
    Array.from({ length: Math.min(objectionCount, 64) }, async (_, i) => {
      const id = BigInt(objectionCount - i);
      return { ...(await read(r, "Tribunal", "objection", [id])), id };
    }),
  );
  for (const o of objections as any[])
    o.reason = logs
      .find((l) => l.eventName === "ObjectionVoid" && l.args.id === o.id)
      ?.args.reason?.startsWith("0x7374616c65")
      ? "stale"
      : "split";
  v.objections = objections;
  for (const p of pleas)
    p.objections = objections.filter((o) => o.pleaId === p.id).reverse();
  for (const p of pleas)
    p.failure = logs.find(
      (l) => l.eventName === "PleaFailed" && l.args.id === p.id,
    )?.args;
  return {
    v,
    constants,
    logs,
    pleas,
    block: historyError
      ? (previous?.block ?? APP.eventStart - 1n)
      : block.number,
    timestamp: Number(block.timestamp),
    historyError,
  };
}
export const val = (s: Snapshot | undefined, name: string) => s?.v[name];
export const con = (s: Snapshot | undefined, name: string) =>
  s?.constants[name];
export const short = (s: string) =>
  s.length > 16 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
export function amount(
  v: bigint | undefined,
  decimals = 18,
  digits = 0,
  mode: "down" | "up" = "down",
) {
  if (v === undefined) return "—";
  decimals = Number(decimals);
  digits = Math.min(digits, decimals);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const divisor = 10n ** BigInt(decimals - digits);
  const truncated = abs / divisor + (mode === "up" && abs % divisor ? 1n : 0n);
  const scale = 10n ** BigInt(digits);
  return (
    (negative ? "−" : "") +
    (truncated / scale).toLocaleString("en-US") +
    (digits ? "." + (truncated % scale).toString().padStart(digits, "0") : "")
  );
}
export function smallAmount(v: bigint | undefined, s: Snapshot | undefined) {
  return v && v < 10n ** 16n
    ? `< 0.01 ${s?.constants.pairSymbol}`
    : tokenAmount(v, s, true);
}
export const tokenAmount = (
  v: bigint | undefined,
  s: Snapshot | undefined,
  pair = false,
  digits = pair ? 2 : 0,
  mode: "down" | "up" = "down",
) =>
  `${amount(v, s?.constants[pair ? "pairDecimals" : "decimals"] ?? 18, digits, mode)} ${s?.constants[pair ? "pairSymbol" : "symbol"] ?? (pair ? "fee token" : "PLEA")}`;
export function duration(seconds: number) {
  seconds = Math.max(0, Math.floor(seconds));
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
export const utc = (s: number | bigint) =>
  new Date(Number(s) * 1000).toISOString().slice(0, 16).replace("T", " ") +
  " UTC";
export function pleaState(p: Plea, now: number, s: Snapshot) {
  if (p.status === 1)
    return p.completed ||
      now > Number(p.submittedAt) + Number(con(s, "CabalGate.PENDING_EXPIRY"))
      ? "NO VERDICT"
      : "PENDING";
  if (
    p.status === 2 &&
    now > Number(p.verdictAt) + Number(con(s, "CabalGate.EXECUTE_WINDOW"))
  )
    return "LAPSED";
  if ([2, 4].includes(p.status) && p.isAppeal) return "OVERTURNED";
  if (p.status === 3 && p.isAppeal) return "UPHELD";
  return (
    (
      {
        2: "APPROVED",
        3: "DENIED",
        4: "SOLD",
        5: "LAPSED",
        6: "NO VERDICT",
      } as Record<number, string>
    )[p.status] || "NO VERDICT"
  );
}
export function cashback(logs: any[], wallet: string) {
  return logs
    .filter(
      (l) =>
        ["CashbackStacked", "CashbackPaidPlain", "CashbackPaidClaims"].includes(
          l.eventName,
        ) && l.args.trader?.toLowerCase() === wallet.toLowerCase(),
    )
    .reduce((n, l) => n + BigInt(l.args.amount), 0n);
}
export function normalizeClaims(data: any): any[] {
  if (!data || typeof data !== "object") return [];
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data.claims)
      ? data.claims
      : Object.entries(data.claims || data).map(([account, c]: any) => ({
          ...c,
          account,
        }));
  return list.flatMap((c: any) => {
    try {
      if (
        typeof c.index !== "string" ||
        typeof c.amount !== "string" ||
        !/^(?:0x[\da-fA-F]+|\d+)$/.test(c.index) ||
        !/^(?:0x[\da-fA-F]+|\d+)$/.test(c.amount)
      )
        return [];
      const index = BigInt(c.index),
        value = BigInt(c.amount),
        account = c.account || c.address;
      if (
        index < 0n ||
        value <= 0n ||
        !isAddress(account) ||
        !Array.isArray(c.proof) ||
        !c.proof.every((x: any) => /^0x[0-9a-fA-F]{64}$/.test(x))
      )
        return [];
      return [
        { ...c, account, index: index.toString(), amount: value.toString() },
      ];
    } catch {
      return [];
    }
  });
}
export function verifyClaim(c: any, root: string) {
  let hash = keccak256(
    encodePacked(
      ["uint256", "address", "uint256"],
      [BigInt(c.index), c.account, BigInt(c.amount)],
    ),
  );
  for (const proof of c.proof)
    hash = keccak256(
      (hash.toLowerCase() < proof.toLowerCase()
        ? hash + proof.slice(2)
        : proof + hash.slice(2)) as `0x${string}`,
    );
  return hash.toLowerCase() === root.toLowerCase();
}
export const countdown = duration;
export const deadman = (s: number) =>
  `${Math.floor(Math.max(s, 0) / 3600)}h ${Math.floor((Math.max(s, 0) % 3600) / 60)}m`;
export function span(s: number, adjective?: "adj") {
  const unit =
    s >= 172800 && s % 86400 === 0
      ? [s / 86400, "day"]
      : s >= 3600 && s % 3600 === 0
        ? [s / 3600, "hour"]
        : s >= 60 && s % 60 === 0
          ? [s / 60, "minute"]
          : [s, "second"];
  return adjective
    ? `${unit[0]}-${unit[1]}`
    : `${unit[0]} ${unit[1]}${unit[0] === 1 ? "" : "s"}`;
}
export const ago = (s: number) =>
  s < 60
    ? `${Math.max(0, Math.floor(s))} s ago`
    : s < 3600
      ? `${Math.floor(s / 60)} min ago`
      : s < 86400
        ? `${Math.floor(s / 3600)} h ago`
        : `${Math.floor(s / 86400)} d ago`;
export function clock(t: number | bigint, seconds = false) {
  const date =
    new Date(Number(t) * 1000)
      .toISOString()
      .slice(0, seconds ? 19 : 16)
      .replace("T", " ") + " UTC";
  return date.slice(0, 10) === new Date().toISOString().slice(0, 10)
    ? date.slice(11)
    : date;
}
export const heldTime = (s: number) =>
  s < 3600 ? `${Math.max(0, Math.floor(s / 60))} min` : duration(s);
export const elapsed = (s: number) =>
  s < 60 ? `${Math.max(0, s)}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
export function words(s: number) {
  s = Math.max(0, Math.floor(s));
  const units = [
    [Math.floor(s / 86400), "day"],
    [Math.floor((s % 86400) / 3600), "hour"],
    [Math.floor((s % 3600) / 60), "minute"],
    [s % 60, "second"],
  ] as const;
  return (
    units
      .filter(([n]) => n > 0)
      .map(([n, u]) => `${n} ${u}${n === 1 ? "" : "s"}`)
      .join(" ") || "0 seconds"
  );
}
export function seasonState(s: Snapshot | undefined, now: number) {
  if (!s || !val(s, "CabalGate.startedAt")) return undefined;
  const displayed = BigInt(s.v.displayedSeason),
    next = BigInt(s.v["Seasons.nextToClose"]),
    current = s.v.seasons[String(displayed)],
    waiting = s.v.seasons[String(next)];
  return {
    displayed,
    next,
    current,
    dead: !!s.v["CabalGate.diedAt"],
    awaiting:
      waiting?.bounds[0] && now >= Number(waiting.bounds[2]) && !waiting.closed
        ? next
        : undefined,
    closeFrom:
      Number(waiting?.bounds[2]) + Number(con(s, "Seasons.CLOSE_GRACE")),
    pot: current?.pot || 0n,
  };
}
export const potOf = (s: Snapshot | undefined, k?: bigint) =>
  !s ? 0n : s.v.seasons?.[String(k ?? s.v.displayedSeason)]?.pot || 0n;
export function objectionLine(o: any, p: Plea) {
  if (o.ruling === 1) return "pending";
  if (o.ruling === 4)
    return `#${o.id}: ${o.reason === "stale" ? "no answer within 20 minutes" : "the panel split"}: nothing changes`;
  return `#${o.id}: ${o.newScore} vs need ${p.need}${o.ruling === 3 ? ` · counts ${p.points || 0} points` : ""}`;
}
export function soldFor(p: Plea, s: Snapshot) {
  return (
    p.escrow?.[3] ||
    s.logs.find((l) => l.eventName === "SellExecuted" && l.args.id === p.id)
      ?.args.imdOut
  );
}

const factCache = new Map<string, Promise<any>>();
async function historicalFacts(
  r: Runtime,
  p: Plea,
  balance: bigint,
  logs: any[],
) {
  const event = logs.find(
      (l) => l.eventName === "PleaSubmitted" && l.args.id === p.id,
    ),
    key = `${p.id}:${event?.blockNumber}`;
  if (!event) return undefined;
  if (!factCache.has(key))
    factCache.set(
      key,
      (async () => {
        try {
          const at = event.blockNumber - 1n,
            call = (name: string, fn: string, args: any[] = []) =>
              r.client.readContract({
                address: r.addresses[name],
                abi: r.abis[name],
                functionName: fn,
                args,
                blockNumber: at,
              }) as Promise<any>;
          const [basis, latest, ago, started] = await Promise.all([
            call("PleaHook", "basisOf", [p.seller]),
            call("PleaHook", "latestPrice"),
            call("PleaHook", "price24hAgo"),
            call("CabalGate", "startedAt"),
          ]);
          const parts = factParts(
            balance,
            p.amount,
            basis,
            latest,
            ago,
            Number(started),
            Number(p.submittedAt),
          );
          if (p.isAppeal) {
            const original = await read(r, "CabalGate", "getPlea", [
                p.originalId,
              ]),
              originalBalance = await read(r, "CabalGate", "pleaBalance", [
                p.originalId,
              ]);
            const share = sharePoints(
              min(
                ceil(p.amount * 10000n, balance),
                ceil(original.amount * 10000n, originalBalance),
              ),
            );
            parts.total += share - parts.share;
            parts.share = share;
          }
          return parts;
        } catch {
          return {
            share: balance ? sharePoints(ceil(p.amount * 10000n, balance)) : 0,
            total: -1,
          };
        }
      })(),
    );
  return factCache.get(key);
}

export async function readPlea(r: Runtime, id: bigint, intake?: Address) {
  const p = { ...(await read(r, "CabalGate", "getPlea", [id])) };
  if (p.status === 1) {
    const address = intake || (await read(r, "CabalGate", "intake"));
    const result = await r.client.readContract({
      address,
      abi: intakeAbi,
      functionName: "requests",
      args: [p.intakeId],
    });
    p.completed = result[3];
  }
  return p;
}
