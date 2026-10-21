/** All writes in this harness are to a locally running anvil Sepolia fork, never a public RPC. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  createPublicClient,
  http,
  encodeFunctionData,
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
      assert.equal(args.params[0].from.toLowerCase(), account.toLowerCase());
      assert.ok(args.params[0].gas, "Explicit gas limit");
    }
    return request(args.method, args.params || []);
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
  assert.equal(await page.locator("#pay").getAttribute("aria-invalid"), null);
  await page
    .getByRole("button", { name: "Make another trade", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("You pay", { exact: true }).inputValue(),
    "",
  );
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
try {
  const ownerPage = await wallet(owner);
  if (!(await read("PleaHook", "seeded"))) {
    await action(ownerPage, "Seed trading");
    await ownerPage
      .getByText("Trading is open. Make your opening buy now.", { exact: true })
      .waitFor({ timeout: 30000 });
    assert.equal(
      await ownerPage.getByLabel("You pay", { exact: true }).inputValue(),
      "2",
    );
    assert.equal(
      await ownerPage
        .getByLabel("You pay", { exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );

    steps.push("T2: owner seeds before START; opening amount and focus set");
    await buy(ownerPage, 2);

    steps.push(
      "T1/T3: first buy at the exact seed tick, exact approval and receipt fill",
    );
  }
  const p1 = await wallet(testers[0], "0x1");
  assert.equal(
    await p1.getByRole("button", { name: "Seed trading", exact: true }).count(),
    0,
  );
  await buy(p1, 10);
  const p2 = await wallet(testers[1]);
  await buy(p2, 10);
  const p3 = await wallet(testers[2]);
  await buy(p3, 10);

  steps.push("Non-owner wallets buy during launch window");
  await p1.goto(base + "#/buy");
  await p1.getByLabel("You pay", { exact: true }).fill("100");
  await p1
    .getByText(/Until .*one buy can take at most/)
    .first()
    .waitFor({ timeout: 20000 });
  assert.equal(
    await p1
      .getByRole("button", { name: "Approve imdTEST", exact: true })
      .getAttribute("aria-disabled"),
    "true",
  );

  assert.equal(
    await p1
      .getByLabel("You pay", { exact: true })
      .getAttribute("aria-invalid"),
    "true",
  );
  assert.equal(await p1.locator("#pay-hint").count(), 1);
  steps.push("T4: launch cap blocks approval and marks its field invalid once");
  await warp(91 * 60);
  await p1.reload();
  await p1.getByRole("heading", { name: /Swap imdTEST/ }).waitFor();
  await buy(p1, 30);

  steps.push(
    "T3: 30 imdTEST fills fully after launch, with post-trade price limit",
  );
  const manual = await plea(p1, { auto: false });
  await p1.goto(base + "#/");
  await p1
    .locator(".hero .stamp")
    .filter({ hasText: "PENDING" })
    .waitFor({ timeout: 30000 });
  assert.doesNotMatch(
    await p1.locator(".hero .plea__summary").innerText(),
    /Sells|Sold|points/,
  );
  assert.match(await p1.locator(".hero .plea__summary").innerText(), /need/);
  steps.push(
    "Round-2 X2: pending hero shows amount and need, with no sale or points",
  );
  await verdict("CabalGate", manual, 40);
  await p1.goto(base + `#/p/${manual}`);
  await p1.reload();
  await p1
    .getByRole("button", { name: "Approve PLEA", exact: true })
    .waitFor({ timeout: 60000 });
  await action(p1, "Approve PLEA");
  const sell = p1.getByRole("button", { name: /^Sell now/ });
  await sell.waitFor();
  await pageReady(p1, sell);
  await sell.click();
  await p1
    .getByText(/Sold .*PLEA for .*imdTEST\./)
    .first()
    .waitFor({ timeout: 30000 });

  steps.push("C2/C14: live manual sale estimate, exact approval, ink Sell now");
  await p2.goto(base + "#/plead");
  await p2.getByRole("button", { name: "1%", exact: true }).click();
  await p2
    .getByLabel("Your plea", { exact: true })
    .fill("An honest case for the rent.");
  await p2
    .getByText(/may take at most 10%/)
    .first()
    .waitFor();
  steps.push(
    "C3: auto-sell floor and 10% balance rule block a small wallet before sending",
  );
  await buy(p2, 20);
  const auto = await plea(p2);
  await verdict("CabalGate", auto, 30);
  await p2.goto(base + `#/p/${auto}`);
  await p2.reload();
  await p2
    .getByRole("heading", { name: "One appeal", exact: true })
    .waitFor({ timeout: 60000 });
  const amount = await p2
    .locator("section")
    .filter({
      has: p2.getByRole("heading", { name: "One appeal", exact: true }),
    })
    .last()
    .innerText();
  assert.match(amount, /open escrow/);
  await p2
    .getByLabel("Your appeal", { exact: true })
    .fill("I ask a second hearing. I still keep the rest.");
  const appealButton = p2.getByRole("button", { name: /^Appeal/ }).first();
  await pageReady(p2, appealButton);
  await appealButton.click();
  const appealId = auto + 1n;
  await p2
    .getByText(new RegExp(`Appeal #${appealId} of plea #${auto} sent`))
    .first()
    .waitFor({ timeout: 30000 });
  await verdict("CabalGate", appealId, 42);
  await p2.goto(base + `#/p/${appealId}`);
  await p2.reload();
  await p2
    .getByRole("button", { name: /^Sell yourself/ })
    .waitFor({ timeout: 60000 });
  const deliverButton = p2.getByRole("button", { name: /^Sell yourself/ });
  await pageReady(p2, deliverButton);
  await deliverButton.click();
  await p2
    .getByText(/Sold .*PLEA for .*imdTEST\./)
    .first()
    .waitFor({ timeout: 30000 });
  await p2
    .locator(".stamp")
    .filter({ hasText: "OVERTURNED" })
    .first()
    .waitFor({ timeout: 30000 });

  steps.push(
    "C4/C7: denied auto escrow returns before appeal; sold appeal remains OVERTURNED",
  );
  const lapse = await plea(p3, { auto: false });
  await verdict("CabalGate", lapse, 42);
  await warp(8 * 60);
  await p3.goto(base + "#/plead");
  await p3.reload();
  await p3
    .getByText(/Cooldown until/)
    .first()
    .waitFor({ timeout: 60000 });
  await p3.goto(base + `#/p/${lapse}`);
  assert.equal(
    await p3
      .getByRole("button", { name: "Mark plea lapsed", exact: true })
      .count(),
    0,
  );
  await warp(4 * 3600);
  await p3.goto(base + "#/plead");
  await p3.reload();
  const retry = await plea(p3, { auto: false });

  steps.push(
    "C1: lapsed approval clears after verdict cooldown; seller pleads again",
  );
  await warp(21 * 60);
  await p3.reload();
  const retry2 = await plea(p3, { auto: false });
  assert.ok(retry2 > retry);

  steps.push("C1: unanswered pending plea expires and next submit clears it");
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        steps,
        errors,
        writes: writes.length,
        ids: {
          manual: String(manual),
          auto: String(auto),
          appeal: String(appealId),
          lapsed: String(lapse),
        },
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ steps, errors, writes: writes.length }));
} finally {
  fs.writeFileSync(
    path.join(out, "partial.json"),
    JSON.stringify({ steps, errors, writes: writes.length }, null, 2),
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
async function pageReady(page, button) {
  await button.waitFor();
  await button.evaluate(
    (el) =>
      new Promise((resolve, reject) => {
        let n = 0;
        const timer = setInterval(() => {
          if (el.getAttribute("aria-disabled") !== "true") {
            clearInterval(timer);
            resolve();
          } else if (++n > 200) {
            clearInterval(timer);
            reject(
              Error("Action stayed disabled: " + el.parentElement.textContent),
            );
          }
        }, 50);
      }),
  );
}
