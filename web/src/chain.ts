import {
  decodeEventLog,
  formatUnits,
  isAddress,
  zeroAddress,
  type Address,
  type Abi,
} from "viem";
import { APP, erc20Abi, type Runtime } from "./config";
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
  failure?: any;
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
      if (
        a === b ||
        !/block range|too many results|range.*(?:limit|large)|query returned|response size|10,000|maximum.*block|exceed.*block/i.test(
          String((e as any)?.shortMessage || (e as any)?.message || e),
        )
      )
        throw e;
      const mid = (a + b) / 2n;
      return [...(await chunk(a, mid)), ...(await chunk(mid + 1n, b))];
    }
  }
  for (let a = from; a <= to; a += 10000n)
    logs.push(...(await chunk(a, a + 9999n > to ? to : a + 9999n)));
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
  const p = { ...(await read(r, "CabalGate", "getPlea", [id])), id } as Plea;
  if (p.seller === zeroAddress)
    throw Error("This plea does not exist. Check the plea number.");
  const [standing, recorded, name, seat, escrow, excluded] = await Promise.all([
    read(r, "Tribunal", "standing", [id]),
    read(r, "Seasons", "recorded", [id]),
    read(r, "Letterbox", "nameOf", [p.seller]),
    read(r, "Seasons", "holdsSeat", [p.seller]),
    read(r, "Letterbox", "escrowOf", [id]),
    read(r, "Seasons", "excluded", [p.seller]),
  ]);
  const objectionIds = logs
    .filter((l) => l.eventName === "Objected" && l.args.pleaId === id)
    .map((l) => l.args.id);
  const objections = await Promise.all(
    objectionIds.map(async (id: bigint) => ({
      ...(await read(r, "Tribunal", "objection", [id])),
      id,
    })),
  );
  return {
    ...p,
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
    ],
    CabalGate: ["startedAt", "lastVerdictAt", "cabalAlive", "diedAt", "nextId"],
    Seasons: [
      "currentSeason",
      "pot",
      "nextToClose",
      "rollover",
      "bonusBurned",
      "finished",
    ],
    PleaDistributor: ["merkleRoot"],
    PLEA: ["totalSupply"],
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
  const season = v["Seasons.currentSeason"][1];
  v.top = await read(r, "Seasons", "topOf", [season]);
  v.bounds = await read(r, "Seasons", "seasonBounds", [
    v["Seasons.nextToClose"],
  ]);
  v.closed = await read(r, "Seasons", "closed", [v["Seasons.nextToClose"]]);
  v.shares = await Promise.all(
    Array.from({ length: Number(constants["Seasons.TOP"]) }, (_, i) =>
      read(r, "Seasons", "shareBps", [BigInt(i)]),
    ),
  );
  const next = v["CabalGate.nextId"];
  const ids = Array.from(
    { length: Math.min(Number(next - 1n), 24) },
    (_, i) => next - 1n - BigInt(i),
  );
  const pleas = await Promise.all(ids.map((id) => getPlea(r, id)));
  const objectionCount = Number(v["Tribunal.nextId"] - 1n);
  const objections = await Promise.all(
    Array.from({ length: Math.min(objectionCount, 64) }, async (_, i) => {
      const id = BigInt(objectionCount - i);
      return { ...(await read(r, "Tribunal", "objection", [id])), id };
    }),
  );
  for (const p of pleas)
    p.objections = objections.filter((o) => o.pleaId === p.id).reverse();
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
export function amount(v: bigint | undefined, decimals = 18, digits = 0) {
  if (v === undefined) return "—";
  return Number(formatUnits(v, decimals)).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
export const tokenAmount = (
  v: bigint | undefined,
  s: Snapshot | undefined,
  pair = false,
  digits = pair ? 2 : 0,
) =>
  `${amount(v, s?.constants[pair ? "pairDecimals" : "decimals"] ?? 18, digits)} ${s?.constants[pair ? "pairSymbol" : "symbol"] ?? (pair ? "fee token" : "PLEA")}`;
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
    return now >=
      Number(p.submittedAt) + Number(con(s, "CabalGate.PENDING_EXPIRY"))
      ? "NO VERDICT"
      : "PENDING";
  if (
    p.status === 2 &&
    now >= Number(p.verdictAt) + Number(con(s, "CabalGate.EXECUTE_WINDOW"))
  )
    return "LAPSED";
  if (p.status === 2 && p.isAppeal) return "OVERTURNED";
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
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data.claims)
      ? data.claims
      : Object.entries(data.claims || data).map(([account, c]: any) => ({
          ...c,
          account,
        }));
  return list
    .map((c: any) => ({ ...c, account: c.account || c.address }))
    .filter(
      (c: any) =>
        isAddress(c.account) &&
        c.index !== undefined &&
        /^\d+$/.test(String(c.amount)) &&
        Array.isArray(c.proof) &&
        c.proof.every((x: any) => /^0x[0-9a-fA-F]{64}$/.test(x)),
    );
}
