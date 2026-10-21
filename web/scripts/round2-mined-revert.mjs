/** All writes in this harness are to a locally running anvil Sepolia fork, never a public RPC. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeFunctionData,
  encodeAbiParameters,
  parseAbi,
  toHex,
  pad,
  decodeEventLog,
  keccak256,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright");
const rpc = process.env.PLEA_FORK_RPC || "http://127.0.0.1:8545";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(rpc))
  throw Error("Fork tests require a loopback anvil endpoint.");
const client = createPublicClient({ transport: http(rpc, { timeout: 15000 }) }),
  request = (method, params = []) => client.request({ method, params });
const root = path.resolve("dist"),
  out = path.resolve("test/scratch/fork");
fs.mkdirSync(out, { recursive: true });
const accounts = JSON.parse(fs.readFileSync(path.join(out, "accounts.json"))),
  { owner, testers, pair, hook, addresses } = accounts,
  abis = Object.fromEntries(
    [
      "PLEA",
      "CabalGate",
      "Seasons",
      "PleaLaunch",
      "PleaDistributor",
      "Letterbox",
      "Tribunal",
      "PleaHook",
    ].map((n) => [n, JSON.parse(fs.readFileSync(`web/public/abi/${n}.json`))]),
  );
for (const n of ["Letterbox", "Tribunal"])
  addresses[n] = await client.readContract({
    address: addresses.PleaLaunch,
    abi: abis.PleaLaunch,
    functionName: n.toLowerCase(),
  });
addresses.PleaHook = hook;
const signer = privateKeyToAccount(generatePrivateKey());
for (const name of ["CabalGate", "Tribunal"])
  await request("anvil_setStorageAt", [
    addresses[name],
    toHex(2, { size: 32 }),
    pad(signer.address, { size: 32 }),
  ]);
const intake = await client.readContract({
  address: addresses.CabalGate,
  abi: abis.CabalGate,
  functionName: "intake",
});
await request("anvil_impersonateAccount", [intake]);
await request("anvil_setBalance", [intake, toHex(10n ** 20n)]);
const read = (name, fn, args = []) =>
  client.readContract({
    address: addresses[name],
    abi: abis[name],
    functionName: fn,
    args,
  });
async function send(from, name, fn, args = []) {
  const hash = await request("eth_sendTransaction", [
    {
      from,
      to: addresses[name],
      data: encodeFunctionData({ abi: abis[name], functionName: fn, args }),
      gas: "0x989680",
    },
  ]);
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", fn);
  return receipt;
}
async function warp(seconds) {
  await request("evm_increaseTime", [seconds]);
  await request("evm_mine");
}
const fields =
  "requestId:bytes32 chainId:uint256 questionHash:bytes32 answerType:uint8 answer:bytes figure:uint256 fromBlock:uint64 toBlock:uint64 blockHash:bytes32 panelJobId:bytes32 panelSize:uint16 quorum:uint16 agreed:uint16 issuedAt:uint64 expiresAt:uint64"
    .split(" ")
    .map((f) => {
      const [name, type] = f.split(":");
      return { name, type };
    });
async function verdict(name, id, score) {
  const p = await read(name, name === "CabalGate" ? "getPlea" : "objection", [
      id,
    ]),
    block = await client.getBlock(),
    uuid =
      pad(toHex(id + BigInt(name === "CabalGate" ? 100 : 1000)), { size: 16 }) +
      "0".repeat(32);
  const attestation = {
    requestId: uuid,
    chainId: BigInt(await read(name, "QUESTION_CHAIN")),
    questionHash: keccak256(stringToHex("fork QA only")),
    answerType: 3,
    answer: encodeAbiParameters([{ type: "uint256" }], [BigInt(score)]),
    figure: BigInt(score),
    fromBlock: block.number,
    toBlock: block.number,
    blockHash: block.hash,
    panelJobId: uuid,
    panelSize: 30,
    quorum: 17,
    agreed: 26,
    issuedAt: block.timestamp,
    expiresAt: block.timestamp + 3600n,
  };
  const signature = await signer.signTypedData({
    domain: {
      name: "IdentityMD Oracle",
      version: "2",
      chainId: 11155111,
      verifyingContract: addresses[name],
    },
    types: { OracleAttestation: fields },
    primaryType: "OracleAttestation",
    message: attestation,
  });
  await send(intake, name, "onOracleResult", [
    p.intakeId,
    attestation,
    signature,
  ]);
}
const mime = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  },
  server = createServer((req, res) => {
    const file = path.resolve(
      root,
      decodeURIComponent(new URL(req.url, "http://x").pathname).replace(
        /^\/preview\//,
        "",
      ) || "index.html",
    );
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "content-type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/preview/`,
  network = JSON.parse(fs.readFileSync("web/network-input.json")).network;
const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  }),
  errors = [],
  steps = [],
  contexts = [],
  writes = [];
const router = fs
  .readFileSync("web/src/config.ts", "utf8")
  .match(/swapRouter: "([^"]+)"/)[1];
const tradeAbi = parseAbi([
  "function swap((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,(bool zeroForOne,int256 amountSpecified,uint160 sqrtPriceLimitX96) params,(bool takeClaims,bool settleUsingBurn) testSettings,bytes hookData) payable returns(int256 delta)",
]);
let injectPriceMove = false,
  competingHash,
  userHash;
const oldPush = steps.push.bind(steps);
steps.push = (...values) => {
  console.log(...values);
  return oldPush(...values);
};
async function wallet(account, chain = "0xaa36a7") {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  contexts.push(context);
  await context.exposeFunction("forkRequest", async (args) => {
    if (args.method === "eth_sendTransaction") {
      writes.push(args.params[0]);
      const transaction = args.params[0];
      if (
        injectPriceMove &&
        transaction.to.toLowerCase() === router.toLowerCase()
      ) {
        injectPriceMove = false;
        const { args: trade } = decodeFunctionData({
          abi: tradeAbi,
          data: transaction.data,
        });
        trade[1].amountSpecified = -1000n * 10n ** 18n;
        trade[3] = encodeAbiParameters([{ type: "address" }], [testers[1]]);
        competingHash = await request("eth_sendTransaction", [
          {
            from: testers[1],
            to: router,
            data: encodeFunctionData({
              abi: tradeAbi,
              functionName: "swap",
              args: trade,
            }),
            gas: "0x989680",
          },
        ]);
        assert.equal(
          (await client.waitForTransactionReceipt({ hash: competingHash }))
            .status,
          "success",
        );
        steps.push(
          "Competitor exhausted the visitor’s price limit with a 1,000 imdTEST request between the visitor simulation and broadcast",
        );
      }
      assert.equal(args.params[0].from.toLowerCase(), account.toLowerCase());
      assert.ok(args.params[0].gas, "Explicit gas limit");
    }
    const result = await request(args.method, args.params || []);
    if (
      args.method === "eth_sendTransaction" &&
      args.params[0].to.toLowerCase() === router.toLowerCase()
    )
      userHash = result;
    return result;
  });
  await context.addInitScript(
    ({ account, chain }) => {
      const events = new Map();
      let currentChain = sessionStorage.getItem("qa-chain") || chain;
      const provider = {
        isMetaMask: true,
        on(n, fn) {
          events.set(n, [...(events.get(n) || []), fn]);
        },
        removeListener() {},
        async request({ method, params }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts")
            return [account];
          if (method === "wallet_requestPermissions")
            return [{ parentCapability: "eth_accounts" }];
          if (method === "wallet_getPermissions") return [];
          if (method === "eth_chainId") return currentChain;
          if (method === "wallet_switchEthereumChain") {
            currentChain = params[0].chainId;
            sessionStorage.setItem("qa-chain", currentChain);
            (events.get("chainChanged") || []).forEach((fn) =>
              fn(currentChain),
            );
            return null;
          }
          if (method === "wallet_addEthereumChain") return null;
          return window.forkRequest({ method, params });
        },
      };
      window.ethereum = provider;
      const announce = () =>
        dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "08678783-1bd8-4776-bc06-215ad85b6d01",
                name: "Fork wallet",
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: "test.plea.fork",
              },
              provider,
            },
          }),
        );
      addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { account, chain },
  );
  await context.route(
    (u) => network.rpcUrls.some((r) => u.href.startsWith(r)),
    async (route) => {
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: route.request().postData(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: await response.text(),
      });
    },
  );
  await context.route("https://api.imd.fun/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requests: [] }),
    }),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base + "#/buy", { waitUntil: "domcontentloaded" });
  await page.locator(".wallet-btn").waitFor({ timeout: 60000 });
  if (
    await page.getByRole("button", { name: "Connect", exact: true }).count()
  ) {
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page
      .getByRole("button", { name: "Fork wallet", exact: true })
      .click();
  }
  if (chain !== "0xaa36a7") {
    await page
      .getByRole("button", { name: "Switch to Sepolia", exact: true })
      .click();

    steps.push("Wrong-chain switch through wallet provider");
  }
  await page
    .getByRole("link", { name: /your profile/ })
    .waitFor({ timeout: 60000 });
  await page
    .getByRole("heading", { name: /Swap imdTEST/ })
    .waitFor({ timeout: 90000 });
  return page;
}
async function action(page, name) {
  const button = page.getByRole("button", { name, exact: true });
  await button.waitFor();
  try {
    await page.waitForFunction(
      (label) => {
        const b = [...document.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === label,
        );
        return b && b.getAttribute("aria-disabled") !== "true";
      },
      name,
      { timeout: 20000 },
    );
  } catch (e) {
    console.log("ACTION DEBUG", name, await page.locator("main").innerText());
    await page.screenshot({
      path: path.join(out, "action-failed.png"),
      fullPage: true,
    });
    throw e;
  }
  await button.click();
}
async function buy(page, value) {
  await page.goto(base + "#/buy");
  await page.getByLabel("You pay", { exact: true }).fill(String(value));
  const account = await page.evaluate(() =>
    window.ethereum.request({ method: "eth_accounts" }),
  );
  const allowance = await client.readContract({
    address: pair,
    abi: parseAbi([
      "function allowance(address,address) view returns(uint256)",
    ]),
    functionName: "allowance",
    args: [account[0], "0x9b6b46e2c869aa39918db7f52f5557fe577b6eee"],
  });
  if (allowance < BigInt(value) * 10n ** 18n) {
    await action(page, "Approve imdTEST");
    await page
      .getByRole("button", { name: "Buy PLEA", exact: true })
      .waitFor({ timeout: 30000 });
  }
  await action(page, "Buy PLEA");
  await page
    .getByText(/Bought .* PLEA for .* imdTEST\./)
    .first()
    .waitFor({ timeout: 30000 });
}
async function plea(
  page,
  {
    auto = true,
    chip = "20%",
    text = "This fifth pays the rent. I keep the rest.",
  } = {},
) {
  await page.goto(base + "#/plead");
  await page
    .getByLabel("Sell automatically if approved", { exact: true })
    .setChecked(auto);
  await page.getByRole("button", { name: chip, exact: true }).click();
  await page.getByLabel("Your plea", { exact: true }).fill(text);
  if (!auto) {
    const account = await page.evaluate(() =>
      window.ethereum.request({ method: "eth_accounts" }),
    );
    const allowance = await client.readContract({
      address: pair,
      abi: parseAbi([
        "function allowance(address,address) view returns(uint256)",
      ]),
      functionName: "allowance",
      args: [account[0], addresses.CabalGate],
    });
    if (allowance < (await read("CabalGate", "ORACLE_FEE"))) {
      await action(page, "Approve imdTEST");
      await page
        .getByRole("button", { name: /^Submit plea/ })
        .waitFor({ timeout: 30000 });
    }
  }
  const before = await read("CabalGate", "nextId"),
    button = page.getByRole("button", { name: /^Submit plea/ });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) =>
        b.textContent.startsWith("Submit plea") &&
        b.getAttribute("aria-disabled") !== "true",
    ),
  );
  await button.click();
  await page
    .getByText(`Plea #${before} sent. The Cabal is deliberating.`, {
      exact: true,
    })
    .waitFor({ timeout: 30000 });
  return before;
}
const restore = await request("evm_snapshot");
try {
  const approval = await request("eth_sendTransaction", [
    {
      from: testers[1],
      to: pair,
      data: encodeFunctionData({
        abi: parseAbi(["function approve(address,uint256) returns(bool)"]),
        functionName: "approve",
        args: [router, 1000n * 10n ** 18n],
      }),
      gas: "0x100000",
    },
  ]);
  await client.waitForTransactionReceipt({ hash: approval });
  const p = await wallet(testers[0]);
  await p.getByLabel("You pay", { exact: true }).fill("50");
  await action(p, "Approve imdTEST");
  await p.getByRole("button", { name: "Buy PLEA", exact: true }).waitFor();
  injectPriceMove = true;
  await action(p, "Buy PLEA");
  await p
    .getByText("The price moved more than 1%.", { exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  await p
    .getByRole("link", { name: "View the failed transaction", exact: true })
    .waitFor({ timeout: 30000 });
  const receipt = await client.waitForTransactionReceipt({ hash: userHash });
  assert.equal(receipt.status, "reverted");
  assert.match(
    await p.locator("main").innerText(),
    /Nothing was bought; your imdTEST stays in your wallet/,
  );
  assert.equal(
    await p
      .locator("main b")
      .filter({ hasText: "The price moved more than 1%." })
      .count(),
    1,
  );
  assert.deepEqual(errors, []);
  steps.push(
    "T1: mined PriceLimitAlreadyExceeded replay shows the slippage title and body, failed receipt link and hash",
  );
  fs.writeFileSync(
    path.join(out, "round2-mined-revert.json"),
    JSON.stringify(
      { steps, errors, hash: userHash, status: receipt.status },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ steps, errors, status: receipt.status }));
} finally {
  await request("evm_revert", [restore]);
  fs.writeFileSync(
    path.join(out, "round2-mined-revert-partial.json"),
    JSON.stringify({ steps, errors, writes: writes.length }, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
