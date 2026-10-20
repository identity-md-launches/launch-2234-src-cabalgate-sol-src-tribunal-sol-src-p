import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  encodePacked,
  keccak256,
  encodeAbiParameters,
  parseAbi,
} from "viem";
const out = path.resolve("test/scratch/mock-qa");
fs.mkdirSync(out, { recursive: true });
const root = path.resolve("dist");
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  const f = path.resolve(
    root,
    decodeURIComponent(new URL(req.url, "http://x").pathname).replace(
      /^\/preview\//,
      "",
    ) || "index.html",
  );
  if (
    !f.startsWith(root + path.sep) ||
    !fs.existsSync(f) ||
    fs.statSync(f).isDirectory()
  ) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    "content-type",
    mime[path.extname(f)] || "application/octet-stream",
  );
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const handoff = JSON.parse(fs.readFileSync("web/deployment-input.json")),
  network = JSON.parse(fs.readFileSync("web/network-input.json")).network;
const addrs = Object.fromEntries(
  handoff.contracts.map((c) => [c.name, c.address.toLowerCase()]),
);
Object.assign(addrs, {
  Letterbox: "0xbc335ae3dc12d4bf78f8e44a03f4fc62e3afd1d3",
  Tribunal: "0xcd6aac81882a6ae51041e8094bca0feabd3fc566",
  PleaHook: "0x07b4698506cf15b9a91805aa90010a47a04228cc",
  PairToken: "0x56bcf2a5f47710649a4091219ef0b56e2d1b58bf",
});
const abis = Object.fromEntries(
  Object.keys(addrs)
    .filter((n) => n !== "PairToken")
    .map((n) => [n, JSON.parse(fs.readFileSync(`web/public/abi/${n}.json`))]),
);
const erc = parseAbi([
  "function balanceOf(address) view returns(uint256)",
  "function symbol() view returns(string)",
  "function decimals() view returns(uint8)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
]);
abis.PairToken = erc;
const extra = parseAbi([
  "function balanceOf(address,uint256) view returns(uint256)",
  "struct Delegation { uint8 type; address to; address from; bytes32 rights; address contract_; uint256 tokenId; uint256 amount; }",
  "function getIncomingDelegations(address) view returns(Delegation[])",
]);
const swapAbi = parseAbi([
  "function swap((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,(bool zeroForOne,int256 amountSpecified,uint160 sqrtPriceLimitX96) params,(bool takeClaims,bool settleUsingBurn) testSettings,bytes hookData) payable returns(int256 delta)",
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256 amountOut,uint256 gasEstimate)",
]);
const allAbi = [...Object.values(abis).flat(), ...extra, ...swapAbi];
const captured = JSON.parse(
  fs.readFileSync("web/tests/fixtures/run9-reads.json"),
).calls;
const values = new Map(
  captured
    .filter((c) => c.method === "eth_call")
    .map((c) => [c.params[0].to.toLowerCase() + c.params[0].data, c.result]),
);
const block = structuredClone(
  captured.find((c) => c.method === "eth_getBlockByNumber").result,
);
const now = Math.floor(Date.now() / 1000);
block.timestamp = "0x" + now.toString(16);
const actor = "0x1111111111111111111111111111111111111111",
  other = "0x2222222222222222222222222222222222222222";
const E = 10n ** 18n,
  Z = "0x" + "0".repeat(40),
  B32 = "0x" + "0".repeat(64);
const state = {
  fact: 38,
  dead: false,
  unseeded: false,
  emptyRoot: false,
  allowances: new Map(),
  txs: [],
  chain: 1,
  recorded: new Set(),
  name: "mira_eth",
  revert: undefined,
  receipts: new Map(),
  pendingPlea: 0n,
};
const pleas = Array.from({ length: 11 }, (_, i) => {
  const id = i + 1;
  const statuses = [1, 2, 3, 6, 5, 4, 2, 3, 4, 4, 4];
  return {
    seller: [2, 3, 6, 7, 8].includes(id) ? actor : other,
    factScore: 38,
    need: 33,
    score: [1, 4].includes(id) ? 0 : id === 3 || id === 8 ? 30 : 36,
    status: statuses[i],
    appealed: false,
    isAppeal: [7, 8].includes(id),
    flags: [6, 9, 10, 11].includes(id) ? 3 : 0,
    amount: 1240000n * E,
    submittedAt: BigInt(now - (id === 1 ? 60 : 1800)),
    verdictAt:
      id === 1 ? 0n : BigInt(now - ([2, 3, 7, 8, 9].includes(id) ? 60 : 1300)),
    originalId: [7, 8].includes(id) ? 1n : 0n,
    intakeId: "0x" + id.toString(16).padStart(64, "0"),
    text:
      id === 1
        ? "Please weigh this case. I keep the rest."
        : id === 4
          ? "A very long case, written in plain words, with the widest stamp to check that every word still fits. ".repeat(
              2,
            )
          : `Case ${id}: I held my PLEA. I ask to sell a fifth for rent and keep the rest as my promise.`,
  };
});
pleas[3].text = "W".repeat(280);
pleas[4].flags = 2;
pleas[6].flags = 2;
pleas[6].text =
  "I have held my PLEA and ask to sell one fifth for a specific reason. I keep the remainder and my promise. "
    .repeat(4)
    .slice(0, 280);
const cashbackLogs = [
  "CashbackStacked",
  "CashbackPaidPlain",
  "CashbackPaidClaims",
  "CashbackPaidPlain",
].map((name, i) => ({
  address: addrs.PleaHook,
  topics: [
    keccak256("0x" + Buffer.from(`${name}(address,uint256)`).toString("hex")),
    "0x" + (i === 3 ? other : actor).slice(2).padStart(64, "0"),
  ],
  data: encodeAbiParameters(
    [{ type: "uint256" }],
    [BigInt(i === 3 ? 40 : i + 1) * E],
  ),
  blockNumber: "0x" + (11948819).toString(16),
  blockHash: block.hash,
  transactionHash: "0x" + (100 + i).toString(16).padStart(64, "0"),
  transactionIndex: "0x0",
  logIndex: "0x" + i.toString(16),
  removed: false,
}));
const entries = [
  { index: 0, account: actor, amount: (48210n * E).toString() },
  { index: 1, account: other, amount: (212500n * E).toString() },
];
const leaves = entries.map((c) =>
  keccak256(
    encodePacked(
      ["uint256", "address", "uint256"],
      [BigInt(c.index), c.account, BigInt(c.amount)],
    ),
  ),
);
const merkle = keccak256(
  "0x" +
    [...leaves]
      .sort()
      .map((x) => x.slice(2))
      .join(""),
);
entries.forEach((e, i) => (e.proof = [leaves[1 - i]]));
let claimed = false;
function def(t) {
  if (t.type.endsWith("[]")) return [];
  if (t.type === "tuple")
    return Object.fromEntries(
      t.components.map((c, i) => [c.name || i, def(c)]),
    );
  if (/^tuple\[/.test(t.type)) {
    const n = Number(t.type.match(/\[(\d+)\]/)[1]);
    return Array.from({ length: n }, () => def({ ...t, type: "tuple" }));
  }
  if (/^uint|^int/.test(t.type)) return 0n;
  if (t.type === "address") return Z;
  if (t.type === "bool") return false;
  if (t.type === "string") return "";
  if (t.type.startsWith("bytes"))
    return "0x" + "0".repeat(Number(t.type.slice(5) || 0) * 2);
  return 0n;
}
function callResult(req) {
  const to = req.to.toLowerCase(),
    abi = allAbi;
  let decoded;
  try {
    decoded = decodeFunctionData({ abi, data: req.data });
  } catch {
    return "0x";
  }
  const fn = decoded.functionName,
    args = decoded.args || [],
    name = Object.keys(addrs).find((n) => addrs[n] === to);
  if (state.revert?.fn === fn)
    throw {
      code: 3,
      message: "execution reverted",
      data: encodeErrorResult({
        abi: abis.CabalGate,
        errorName: state.revert.name,
        args: state.revert.args,
      }),
    };
  let v,
    custom = true;
  if (fn === "balanceOf")
    v =
      args.length === 2
        ? 2n * E
        : to === addrs.PLEA
          ? 6200000n * E
          : (41250n * E) / 100n;
  else if (fn === "allowance")
    v =
      state.allowances.get(
        to + args[0].toLowerCase() + args[1].toLowerCase(),
      ) || 0n;
  else if (fn === "getPlea")
    v = pleas[Number(args[0]) - 1] || { ...pleas[0], seller: Z };
  else if (fn === "nextId") v = name === "Tribunal" ? 4n : 12n;
  else if (fn === "seeded" || fn === "opened") v = !state.unseeded;
  else if (fn === "cabalAlive") v = !state.dead && !state.unseeded;
  else if (fn === "diedAt") v = state.dead ? BigInt(now - 10) : 0n;
  else if (fn === "startedAt" || fn === "launchedAt")
    v = state.unseeded ? 0n : BigInt(now - 7200);
  else if (fn === "lastVerdictAt")
    v = BigInt(state.dead ? now - 118810 : now - 60);
  else if (fn === "factScore") v = state.fact;
  else if (fn === "pendingOf") v = state.pendingPlea;
  else if (["lastExecutedAt", "lastDeniedAt", "lastLapsedAt"].includes(fn))
    v = 0n;
  else if (fn === "lastPleaOf") v = 3n;
  else if (fn === "nameOf")
    v = args[0].toLowerCase() === actor ? state.name : "case_writer";
  else if (fn === "nameOwner")
    v =
      args[0] === keccak256("0x" + Buffer.from(state.name).toString("hex"))
        ? actor
        : args[0] ===
            keccak256("0x" + Buffer.from("taken_name").toString("hex"))
          ? other
          : Z;
  else if (fn === "holdsSeat") v = args[0].toLowerCase() === actor;
  else if (fn === "pointsFor")
    v = Math.floor(
      Number(args[1]) * (args[0].toLowerCase() === actor ? 1.2 : 1),
    );
  else if (fn === "pointsOf") v = 43;
  else if (fn === "standing") {
    const id = Number(args[0]);
    v = [
      id === 9 || id === 2 || id === 7,
      id === 10,
      id === 10 ? 29 : id === 11 ? 34 : 36,
    ];
  } else if (fn === "recorded") v = state.recorded.has(String(args[0]));
  else if (fn === "escrowOf") {
    const p = pleas[Number(args[0]) - 1] || pleas[0];
    v = [p.seller, p.status !== 4, p.amount, p.status === 4 ? 17n * E : 0n];
  } else if (fn === "feesFor")
    v = [args[0] ? (110n * E) / 100n : (75n * E) / 100n, 60000n * E];
  else if (fn === "pleaBalance") v = 6200000n * E;
  else if (fn === "caseOf")
    v = {
      count: args[0] === 11n ? 1 : 0,
      lowest: 36,
      sustained: args[0] === 10n,
      lastObjector: other,
      pending: args[0] === 9n ? [1n, 0n] : [0n, 0n],
    };
  else if (fn === "objection") {
    const id = Number(args[0]);
    v = {
      pleaId: BigInt(id + 8),
      objector: other,
      ruling: id,
      newScore: id === 1 ? 0 : id === 2 ? 29 : 34,
      settled: false,
      filedAt: BigInt(now - 30),
      intakeId: "0x" + (50 + id).toString(16).padStart(64, "0"),
      text: "The original text asks for an outcome, rather than making a case.",
    };
  } else if (fn === "currentSeason") v = [!state.dead, 1n, BigInt(now + 3600)];
  else if (fn === "seasonBounds")
    v = [!state.unseeded, BigInt(now - 25000), BigInt(now - 7000), true];
  else if (fn === "nextToClose") v = 0n;
  else if (fn === "topOf")
    v = Array.from({ length: 25 }, (_, i) => ({
      wallet: i === 0 ? actor : i === 1 ? other : Z,
      points: i === 0 ? 116 : i === 1 ? 59 : 0,
      pleaId: BigInt(i + 1),
    }));
  else if (fn === "bestOf")
    v = args[1].toLowerCase() === actor ? [40, 39, 37] : [30, 29, 0];
  else if (fn === "excluded")
    v = state.excludedWallet?.toLowerCase() === args[0]?.toLowerCase();
  else if (fn === "closed") v = false;
  else if (fn === "finished") v = state.dead;
  else if (fn === "pot") v = (18420n * E) / 100n;
  else if (fn === "merkleRoot") v = state.emptyRoot ? B32 : merkle;
  else if (fn === "isClaimed") v = claimed;
  else if (fn === "getIncomingDelegations")
    v = [
      {
        type: 1,
        to: actor,
        from: other,
        rights: B32,
        contract_: Z,
        tokenId: 0n,
        amount: 0n,
      },
    ];
  else if (fn === "question") v = pleas[Number(args[0]) - 1]?.text || "";
  else if (fn === "status")
    v = "No open plea. Your wallet is ready to make its case.";
  else if (fn === "basisOf")
    v = [100n * E, 6200000n * E, BigInt(now - 3 * 86400)];
  else if (fn === "priceX96" || fn === "latestPrice" || fn === "price24hAgo")
    v = 2n ** 96n / 1000000n;
  else if (fn === "currentSqrtPriceX96") v = 1000n * 2n ** 96n;
  else if (fn === "market") v = [-887220, 887220, 10n ** 26n];
  else if (fn === "wall") v = [-100, 100, 0n];
  else if (fn === "quoteExactInputSingle") v = [0n, 100000n];
  else if (fn === "approve") v = true;
  else if (fn === "executeSell" || fn === "deliver") v = 17n * E;
  else if (
    fn === "submitSell" ||
    fn === "plead" ||
    fn === "appeal" ||
    fn === "appealAuto" ||
    fn === "object"
  )
    v = 12n;
  else custom = false;
  if (!custom) {
    const existing = values.get(to + req.data);
    if (existing !== undefined) return existing;
    const f = abi.find((f) => f.type === "function" && f.name === fn);
    v = f.outputs.length === 1 ? def(f.outputs[0]) : f.outputs.map(def);
  }
  return encodeFunctionResult({ abi, functionName: fn, result: v });
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
await context.exposeFunction("__sentToTestWallet", (tx) => {
  const decoded = decodeFunctionData({ abi: allAbi, data: tx.data });
  state.txs.push({ ...tx, ...decoded });
  if (decoded.functionName === "approve")
    state.allowances.set(
      tx.to.toLowerCase() + actor + decoded.args[0].toLowerCase(),
      decoded.args[1],
    );
  if (decoded.functionName === "record")
    state.recorded.add(String(decoded.args[0]));
  if (decoded.functionName === "claim") claimed = true;
  if (decoded.functionName === "setName") state.name = decoded.args[0];
  const hash = "0x" + state.txs.length.toString(16).padStart(64, "0");
  state.receipts.set(hash, tx);
  return hash;
});
await context.addInitScript(
  ({ actor }) => {
    window.__providerLog = [];
    let chain = localStorage.getItem("__fixture-chain") || "0x1",
      added = !!localStorage.getItem("__fixture-chain"),
      authorized = localStorage.getItem("__fixture-authorized") === "yes";
    const listeners = new Map();
    const provider = {
      on: (n, fn) => {
        if (!listeners.has(n)) listeners.set(n, new Set());
        listeners.get(n).add(fn);
      },
      removeListener: (n, fn) => listeners.get(n)?.delete(fn),
      request: async ({ method, params }) => {
        window.__providerLog.push({ method, params });
        if (method === "eth_requestAccounts") {
          authorized = true;
          localStorage.setItem("__fixture-authorized", "yes");
          return [actor];
        }
        if (method === "eth_accounts") return authorized ? [actor] : [];
        if (method === "eth_chainId") return chain;
        if (method === "wallet_getCapabilities") return {};
        if (method === "wallet_switchEthereumChain") {
          if (window.__rejectSwitch) {
            window.__rejectSwitch = false;
            const e = new Error("User rejected switch");
            e.code = 4001;
            throw e;
          }

          if (!added) {
            const e = new Error("Unknown chain");
            e.code = 4902;
            throw e;
          }
          chain = params[0].chainId;
          localStorage.setItem("__fixture-chain", chain);
          for (const f of listeners.get("chainChanged") || []) f(chain);
          return null;
        }
        if (method === "wallet_addEthereumChain") {
          window.__chainAdded = params[0];
          added = true;
          return null;
        }
        if (method === "eth_sendTransaction") {
          if (window.__rejectNext) {
            window.__rejectNext = false;
            const e = new Error("User rejected request");
            e.code = 4001;
            throw e;
          }
          return window.__sentToTestWallet(params[0]);
        }
        throw Error("Unsupported mock method " + method);
      },
    };
    window.ethereum = provider;
    const info = {
      uuid: "d3f1b900-2434-40a4-9eb0-e703cc3b6150",
      name: "Test Wallet",
      rdns: "test.plea.wallet",
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28"/></svg>',
    };
    const announce = () =>
      dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: { info, provider },
        }),
      );
    addEventListener("eip6963:requestProvider", announce);
    announce();
  },
  { actor },
);
await context.route(
  (url) => network.rpcUrls.some((u) => url.href.startsWith(u)),
  async (route) => {
    const body = JSON.parse(route.request().postData());
    const run = (call) => {
      try {
        if (
          state.rpcDown ||
          (state.failPrimary &&
            route.request().url().startsWith(network.rpcUrls[0]))
        )
          throw {
            code: -32005,
            message: "Fixture RPC temporarily unavailable",
          };
        if (
          state.failPrimary &&
          !route.request().url().startsWith(network.rpcUrls[0])
        )
          state.fallbackReads = (state.fallbackReads || 0) + 1;
        let result;
        if (call.method === "eth_chainId") result = "0xaa36a7";
        else if (call.method === "eth_getCode") result = "0x60006000";
        else if (call.method === "eth_blockNumber") result = block.number;
        else if (call.method === "eth_getBlockByNumber") result = block;
        else if (call.method === "eth_call")
          result = callResult(call.params[0]);
        else if (call.method === "eth_getLogs")
          result =
            BigInt(call.params[0].fromBlock) <= 11948819n &&
            BigInt(call.params[0].toBlock) >= 11948819n
              ? cashbackLogs
              : [];
        else if (call.method === "eth_estimateGas") result = "0x186a0";
        else if (call.method === "eth_getTransactionReceipt") {
          const tx = state.receipts.get(call.params[0]);
          result = tx
            ? {
                transactionHash: call.params[0],
                transactionIndex: "0x0",
                blockHash: block.hash,
                blockNumber: block.number,
                from: actor,
                to: tx.to,
                cumulativeGasUsed: "0x186a0",
                gasUsed: "0x186a0",
                contractAddress: null,
                logs: [],
                logsBloom: "0x" + "0".repeat(512),
                status: "0x1",
                effectiveGasPrice: "0x1",
                type: "0x2",
              }
            : null;
        } else throw Error("Unmocked RPC " + call.method);
        return { jsonrpc: "2.0", id: call.id, result };
      } catch (e) {
        if (!state.rpcDown && !state.failPrimary)
          console.log(
            "RPC fixture error",
            call.method,
            call.params?.[0]?.data?.slice(0, 10),
            e.message || e.code,
          );
        return {
          jsonrpc: "2.0",
          id: call.id,
          error: {
            code: e.code || -32000,
            message: e.message || "Fixture error",
            ...(e.data ? { data: e.data } : {}),
          },
        };
      }
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(Array.isArray(body) ? body.map(run) : run(body)),
    });
  },
);
await context.route("**/claims.json", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ claims: entries }),
  }),
);
await context.route("https://api.imd.fun/**", (route) => {
  const list = new URL(route.request().url()).pathname === "/oracle/requests";
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(
      list
        ? {
            requests: pleas.map((p, i) => ({
              id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
              question: p.text,
            })),
          }
        : {
            id: new URL(route.request().url()).pathname.split("/").at(-1),
            status: "attested",
            panelSize: 30,
            attestation: { agreed: 26 },
          },
    ),
  });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  if (m.type() === "warning") console.log("BROWSER WARNING", m.text());
});
const assertions = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  assertions.push(name);
  console.log("PASS", name);
};
const goto = async (route) => {
  await page.goto(base + "#/" + route, { waitUntil: "networkidle" });
  try {
    await page
      .getByText("Season 2", { exact: false })
      .first()
      .waitFor({ timeout: 20000 });
  } catch (e) {
    console.log("PAGE", await page.locator("body").innerText());
    console.log("ERRORS", errors);
    await page.screenshot({
      path: path.join(out, "failure.png"),
      fullPage: true,
    });
    throw e;
  }
};
const click = async (name) => {
  const n = state.txs.length;
  await page.getByRole("button", { name, exact: true }).click();
  const hash = "0x" + (n + 1).toString(16).padStart(64, "0");
  try {
    await page
      .locator(`a[href="${network.explorer}/tx/${hash}"]`)
      .filter({ hasText: "Confirmed on Sepolia" })
      .waitFor({ timeout: 15000 });
  } catch (e) {
    console.log(
      "TX FAILED",
      name,
      state.txs,
      await page.evaluate(() => window.__providerLog),
      await page.locator("body").innerText(),
      errors,
    );
    throw e;
  }
};
await goto("plead");
await page.getByRole("button", { name: "Connect", exact: true }).click();
await page.getByRole("button", { name: "Test Wallet", exact: false }).click();
await page
  .getByRole("button", { name: "Switch to Sepolia", exact: true })
  .waitFor();
check(
  "wrong chain blocks submit",
  await page
    .getByRole("button", { name: "Submit plea", exact: true })
    .isDisabled(),
);
await page.evaluate(() => {
  window.__rejectSwitch = true;
});
await page
  .getByRole("button", { name: "Switch to Sepolia", exact: true })
  .click();
await page
  .locator(".toasts")
  .getByText(/You declined the wallet request/)
  .first()
  .waitFor();
check(
  "chain-switch rejection is visible and retryable",
  !(await page
    .getByRole("button", { name: "Switch to Sepolia", exact: true })
    .isDisabled()),
);
await page
  .getByRole("button", { name: "Switch to Sepolia", exact: true })
  .click();
await page.getByRole("button", { name: /0x1111/ }).waitFor();
check(
  "unknown chain offers wallet_addEthereumChain with exact handoff",
  JSON.stringify(await page.evaluate(() => window.__chainAdded)) ===
    JSON.stringify(
      JSON.parse(fs.readFileSync("web/network-input.json")).walletAddChain,
    ),
);
await page.getByLabel("Amount", { exact: true }).fill("1240000");
await page
  .getByLabel("Your plea", { exact: true })
  .fill("I ask to sell a fifth and keep the rest.");
await page.getByRole("button", { name: "Submit plea", exact: true }).waitFor();
await page.waitForTimeout(200);
check(
  "automatic flow is default",
  await page
    .getByLabel("Sell automatically if approved", { exact: true })
    .isChecked(),
);
await page
  .getByLabel("Sell automatically if approved", { exact: true })
  .uncheck();
await click("Approve imdTEST");
await page.getByRole("button", { name: "Submit plea", exact: true }).waitFor();
await click("Submit plea");
check(
  "manual submit calls CabalGate.submitSell",
  state.txs.at(-1).functionName === "submitSell",
);
check(
  "every write sends estimate × 1.3 gas",
  state.txs.every((t) => BigInt(t.gas) === 130000n),
);
await page
  .getByLabel("Sell automatically if approved", { exact: true })
  .check();
await click("Submit plea");
check(
  "automatic submit calls Letterbox.plead",
  state.txs.at(-1).functionName === "plead",
);
await goto("wall");
await goto("plead");
await page
  .getByLabel("Your plea", { exact: true })
  .fill("A new case for the contract checks.");
state.fact = 20;
await page.getByLabel("Amount", { exact: true }).fill("1240001");
await page.getByText("This plea cannot pass", { exact: true }).waitFor();
check(
  "CannotPass disables before paying",
  await page
    .getByRole("button", { name: "Submit plea", exact: true })
    .isDisabled(),
);
state.fact = 38;
await page.getByLabel("Amount", { exact: true }).fill("1240000");
await page.waitForTimeout(250);
await page.evaluate(() => {
  window.__rejectNext = true;
});
await page.getByRole("button", { name: "Submit plea", exact: true }).click();
await page
  .getByText(/You declined the wallet request/)
  .first()
  .waitFor();
check(
  "wallet rejection explains fix and unlocks action",
  !(await page
    .getByRole("button", { name: "Submit plea", exact: true })
    .isDisabled()),
);
state.revert = { fn: "plead", name: "CannotPass", args: [50n] };
const before = state.txs.length;
await page.getByRole("button", { name: "Submit plea", exact: true }).click();
await page
  .getByText(/your need is above 45/)
  .first()
  .waitFor();
check("custom error decoded before wallet send", state.txs.length === before);
state.revert = undefined;
await goto("p/2");
await click("Approve PLEA");
await click("Sell now");
check(
  "manual sell uses positive executeSell(minOut)",
  state.txs.at(-1).functionName === "executeSell" &&
    state.txs.at(-1).args[0] > 0n,
);
await goto("p/3");
await page
  .getByLabel("Your appeal", { exact: true })
  .fill("I ask again with a more specific case, and keep the rest.");
await click("Submit appeal");
check(
  "automatic appeal calls appealAuto(originalId,text)",
  state.txs.at(-1).functionName === "appealAuto" &&
    state.txs.at(-1).args[0] === 3n,
);
await goto("claim");
await page.getByLabel("Address on the list", { exact: true }).fill(other);
await page.getByRole("button", { name: "Check", exact: true }).click();
await click("Claim 212,500 PLEA");
check(
  "claim uses typed recipient, not connected wallet",
  state.txs.at(-1).functionName === "claim" &&
    state.txs.at(-1).args[1].toLowerCase() === other,
);
check(
  "claim proof comes from claims.json",
  state.txs.at(-1).args[3][0] === entries[1].proof[0],
);
await goto("profile");
await page
  .locator(".checks")
  .getByText("This is your current name", { exact: true })
  .waitFor();
check(
  "profile shows own current name",
  await page
    .getByRole("button", { name: "Save name", exact: true })
    .isDisabled(),
);
await page.getByLabel("Display name", { exact: true }).fill("taken_name");
await page
  .getByText("That name belongs to another wallet. Choose another name.", {
    exact: true,
  })
  .first()
  .waitFor();
check(
  "taken name disables save",
  await page
    .getByRole("button", { name: "Save name", exact: true })
    .isDisabled(),
);
await page.getByLabel("Display name", { exact: true }).fill("case_file");
await click("Save name");
check(
  "profile saves through setName",
  state.txs.at(-1).functionName === "setName",
);
check(
  "profile reads ERC-6909 paired-token claims",
  (await page.getByText("2.00 imdTEST", { exact: true }).count()) > 0,
);
check(
  "cashback adds stacked, plain and claims events for this wallet only",
  (await page.getByText("6.00 imdTEST", { exact: true }).count()) > 0,
);
await goto("buy");
await page.getByLabel("You pay", { exact: true }).fill("1");
await page
  .getByRole("button", { name: "Approve imdTEST", exact: true })
  .waitFor();
await click("Approve imdTEST");
await click("Buy PLEA");
const buy = state.txs.at(-1);
check(
  "swap uses PoolSwapTest and abi.encode(buyer) hookData",
  buy.to.toLowerCase() === "0x9b6b46e2c869aa39918db7f52f5557fe577b6eee" &&
    buy.data.endsWith(
      encodeAbiParameters([{ type: "address" }], [actor]).slice(2),
    ),
);
check("ERC-20 buy sends no ETH", !buy.value || BigInt(buy.value) === 0n);
await goto("p/11");
await page
  .getByText("+34 points once recorded", { exact: true })
  .first()
  .waitFor();
check("overruled objections use the lowest panel score for points", true);
state.excludedWallet = other;
await page.reload({ waitUntil: "networkidle" });
await page
  .getByText("This seller is excluded from season points and prizes.", {
    exact: true,
  })
  .waitFor();
check(
  "excluded sellers cannot record points",
  await page
    .getByRole("button", { name: "Record my points", exact: true })
    .isDisabled(),
);
state.excludedWallet = undefined;
await page.reload({ waitUntil: "networkidle" });
await page
  .getByText("+34 points once recorded", { exact: true })
  .first()
  .waitFor();
await goto("objections?plea=9");
await page
  .getByLabel("Your objection", { exact: true })
  .fill("The plea asks the panel for an outcome, rather than giving a reason.");
await click("Approve imdTEST");
await click("Object");
check(
  "objections approve fee and stake then call Tribunal.object",
  state.txs.at(-1).functionName === "object" && state.txs.at(-1).args[0] === 9n,
);
await goto("p/7");
await click("Sell yourself");
check(
  "escrowed sale uses Letterbox.deliver",
  state.txs.at(-1).functionName === "deliver",
);
await goto("p/5");
await click("Return escrow and tip");
check(
  "final escrow can be settled",
  state.txs.at(-1).functionName === "settle",
);
await goto("p/6");
await click("Record my points");
check(
  "points require explicit Seasons.record",
  state.txs.at(-1).functionName === "record" && state.txs.at(-1).args[0] === 6n,
);
await goto("seasons");
await click("Close season 1");
check(
  "close season is available only after grace",
  state.txs.at(-1).functionName === "closeSeason",
);
await goto("share/7");
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const downloadWait = page.waitForEvent("download");
await page.getByRole("button", { name: "Download image", exact: true }).click();
const download = await downloadWait;
const pngPath = path.join(out, "download-7.png");
await download.saveAs(pngPath);
const png = fs.readFileSync(pngPath);
check(
  "browser produces an actual 1200 × 675 PNG",
  png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 675,
);
await page.getByRole("button", { name: "Copy image", exact: true }).click();
await page
  .getByText("Image copied. Paste it into your post.", { exact: true })
  .waitFor();
check("PNG clipboard copy works in supported browser", true);
const axe = fs.readFileSync("web/node_modules/axe-core/axe.min.js", "utf8");
const runs = [];
for (const theme of ["light", "dark"])
  for (const width of [320, 360, 768, 1280])
    for (const route of [
      "plead",
      "buy",
      "profile",
      "claim",
      "seasons",
      "objections",
      ...pleas.map((_, i) => `p/${i + 1}`),
      ...pleas.map((_, i) => `share/${i + 1}`),
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((t) => {
        localStorage.setItem("plea-theme", t);
        document.documentElement.dataset.theme = t;
      }, theme);
      await goto(route);
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
          resultTypes: ["violations"],
        });
        return r.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        }));
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      let shareFit;
      if (route.startsWith("share/")) {
        shareFit = await page
          .locator(".share-export .share-card")
          .evaluate((card) => {
            const text = card
                .querySelector(".share-card__text")
                .getBoundingClientRect(),
              foot = card
                .querySelector(".share-card__foot")
                .getBoundingClientRect(),
              stamp = card
                .querySelector(".share-card__stamp")
                .getBoundingClientRect();
            return {
              clearOfStamp: text.right < stamp.left,
              aboveFooter: text.bottom < foot.top,
            };
          });
        assert.ok(
          shareFit.clearOfStamp && shareFit.aboveFooter,
          `Share text overlaps for ${route}`,
        );
      }
      const run = { route, theme, width, overflow, violations, shareFit };
      runs.push(run);
      if (overflow || violations.length)
        console.log("FAIL", JSON.stringify(run));
      if (theme === "light" && width === 360 && route.startsWith("p/"))
        await page.screenshot({
          path: path.join(out, route.replace("/", "-") + ".png"),
          fullPage: true,
        });
      if (theme === "light" && width === 360 && route.startsWith("share/")) {
        const wait = page.waitForEvent("download");
        await page
          .getByRole("button", { name: "Download image", exact: true })
          .click();
        const download = await wait;
        await download.saveAs(path.join(out, route.replace("/", "-") + ".png"));
      }
    }
await goto("wall");
await page.clock.install();
pleas[0].status = 2;
pleas[0].score = 36;
pleas[0].verdictAt = BigInt(now);
await page.clock.fastForward(16000);
await page.locator('a[href="#/p/1"] .stamp--land').waitFor();
check("stamp lands once for a live verdict", true);
await page.emulateMedia({ reducedMotion: "reduce" });
check(
  "reduced motion disables the stamp animation",
  (await page
    .locator('a[href="#/p/1"] .stamp')
    .evaluate((e) => getComputedStyle(e).animationName)) === "none",
);
await page.clock.resume();
await goto("buy");
await goto("wall");
check(
  "revisiting a verdict does not replay its stamp",
  (await page.locator('a[href="#/p/1"] .stamp--land').count()) === 0,
);
state.dead = true;
await page.reload({ waitUntil: "networkidle" });
await page.getByText(/The Cabal is dead: no verdict/).waitFor();
check(
  "Cabal death banner appears on all routes",
  (await page
    .getByRole("status")
    .filter({ hasText: "The Cabal is dead" })
    .count()) > 0,
);
await goto("buy");
check(
  "Cabal death reveals free Sell control",
  (await page.getByRole("button", { name: "Sell", exact: true }).count()) > 0,
);
await goto("seasons");
await click("Send leftovers to buy wall");
check(
  "finished seasons can flush leftovers",
  state.txs.at(-1).functionName === "flushToWall",
);
state.failPrimary = true;
await page.reload({ waitUntil: "networkidle" });
await page.getByText("Season 2", { exact: false }).first().waitFor();
check("public RPC fallback preserves live reads", state.fallbackReads > 0);
state.failPrimary = false;
state.rpcDown = true;
await page.reload({ waitUntil: "networkidle" });
await page
  .getByText("Cannot read Sepolia", { exact: true })
  .waitFor({ timeout: 30000 });
check(
  "all-RPC failure is an actionable read error",
  (await page.getByRole("button", { name: "Try again", exact: true }).count()) >
    0,
);
state.rpcDown = false;
await page.getByRole("button", { name: "Try again", exact: true }).click();
await page
  .getByText("Season 2", { exact: false })
  .first()
  .waitFor({ timeout: 20000 });
check("read error recovers without reconnecting", true);
const report = {
  assertions,
  runs,
  errors,
  transactions: state.txs.map((t) => ({
    function: t.functionName,
    to: t.to,
    gas: t.gas,
  })),
  failures: runs.filter((r) => r.overflow || r.violations.length),
};
fs.writeFileSync(
  path.join(out, "report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    assertions: assertions.length,
    runs: runs.length,
    failures: report.failures.length,
    errors,
  }),
);
await browser.close();
await new Promise((r) => server.close(r));
if (report.failures.length || errors.length) process.exitCode = 1;
