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
  keccak256,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const { chromium } = await import(process.env.IMD_PLAYWRIGHT || "playwright");
const rpc = process.env.PLEA_FORK_RPC || "http://127.0.0.1:8545";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(rpc))
  throw Error("Fork tests require a loopback anvil endpoint.");
const client = createPublicClient({
    pollingInterval: 25,
    transport: http(rpc, { timeout: 15000 }),
  }),
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
const snapshot = await request("evm_snapshot");
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
  return receiptOf(hash, fn);
}
async function receiptOf(hash, label) {
  for (let i = 0; i < 40; i++) {
    const receipt = await request("eth_getTransactionReceipt", [hash]);
    if (receipt) {
      assert.equal(receipt.status, "0x1", label);
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(`No mined receipt for ${label}: ${hash}`);
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
const fixed = process.env.PLEA_EXPECT_OLD !== "1";
const results = {};
const matrix = [];
async function audit(pages, routes, label) {
  if (process.env.PLEA_REVISION_MATRIX !== "1") return;
  for (const [wallet, page] of pages.entries()) {
    for (const route of routes) {
      await page.goto(base + route);
      await page.locator("main h1").waitFor({ timeout: 60000 });
      for (const theme of ["light", "dark"]) {
        await page.evaluate((theme) => {
          localStorage.setItem("plea-theme", theme);
          document.documentElement.dataset.theme = theme;
        }, theme);
        for (const width of [320, 360, 390, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          if (!(await page.evaluate(() => !!window.axe)))
            await page.addScriptTag({
              path:
                process.env.PLEA_AXE ||
                new URL("../node_modules/axe-core/axe.min.js", import.meta.url)
                  .pathname,
            });
          const result = await page.evaluate(async () => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            violations: (
              await window.axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21aa"],
                },
              })
            ).violations.map((v) => ({
              id: v.id,
              targets: v.nodes.map((n) => n.target),
            })),
          }));
          matrix.push({
            label,
            wallet:
              (await page.getByRole("link", { name: /your profile/ }).count()) >
              0,
            route,
            theme,
            width,
            ...result,
          });
          assert.equal(result.overflow, false, JSON.stringify(matrix.at(-1)));
          assert.deepEqual(
            result.violations,
            [],
            JSON.stringify(matrix.at(-1)),
          );
          if (width === 390 || width === 1280)
            await page.screenshot({
              path: path.join(
                out,
                `revision-${label}-${route.replace(/\W/g, "_")}-${wallet}-${theme}-${width}.png`,
              ),
              fullPage: true,
            });
        }
      }
    }
  }
}
async function reader(route) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  contexts.push(context);
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
      body: '{"requests":[]}',
    }),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(base + route);
  await page
    .getByRole("link", { name: "Buy", exact: true })
    .first()
    .waitFor({ timeout: 60000 });
  await page.waitForFunction(
    () =>
      !document
        .querySelector("main")
        ?.textContent.includes("Reading the deployment"),
  );
  return page;
}
try {
  assert.equal(
    await read("CabalGate", "nextId"),
    7n,
    "run primary fork scenario first",
  );
  await request("anvil_impersonateAccount", [addresses.PleaDistributor]);
  await request("anvil_setBalance", [
    addresses.PleaDistributor,
    toHex(10n ** 20n),
  ]);
  for (let i = 0; i < 26; i++) {
    const holder = privateKeyToAccount(generatePrivateKey()).address;
    await request("anvil_impersonateAccount", [holder]);
    await request("anvil_setBalance", [holder, toHex(10n ** 20n)]);
    await request("anvil_setStorageAt", [
      pair,
      keccak256(
        encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }],
          [holder, 0n],
        ),
      ),
      pad(toHex(100n * 10n ** 18n), { size: 32 }),
    ]);
    await send(addresses.PleaDistributor, "PLEA", "transfer", [
      holder,
      1000000n * 10n ** 18n,
    ]);
    const hash = await request("eth_sendTransaction", [
      {
        from: holder,
        to: pair,
        data: encodeFunctionData({
          abi: parseAbi(["function approve(address,uint256) returns(bool)"]),
          functionName: "approve",
          args: [addresses.CabalGate, 100n * 10n ** 18n],
        }),
        gas: "0x989680",
      },
    ]);
    await receiptOf(hash, "approve oracle fee");
    await send(holder, "CabalGate", "submitSell", [
      200000n * 10n ** 18n,
      "I ask to sell one fifth for rent and keep the rest.",
    ]);
    console.log(`Created plea #${i + 7}`);
  }
  await verdict("CabalGate", 7n, 45);
  assert.equal((await read("CabalGate", "getPlea", [7n])).need, 40);
  const page = await reader("#/objections");
  await page
    .getByText(/approved pleas? · closing soonest first/)
    .waitFor({ timeout: 60000 });
  const openText = await page.locator("main").innerText();
  results.openSeven =
    openText.includes("Plea #7") && openText.includes("1 approved plea");
  assert.equal(results.openSeven, fixed);
  await page.goto(base + "#/objections?plea=7");
  await page
    .getByRole("heading", { name: "Plea #7", exact: true })
    .waitFor({ timeout: 60000 });
  results.directSeven = (await page.locator("main").innerText()).includes(
    "45 vs need 40",
  );
  await page.goto(base + "#/");
  await page
    .getByText(/4 approved, 1 denied/)
    .first()
    .waitFor({ timeout: 60000 });
  results.homeSummary = await page
    .getByText(/4 approved, 1 denied/)
    .first()
    .innerText();
  const hero = page.locator(".hero");
  results.latestVerdictSeven = (await hero.innerText()).includes("Plea #7");
  assert.equal(results.latestVerdictSeven, fixed);
  assert.match(
    results.homeSummary,
    fixed ? /1 no verdict, 26 pending/ : /3 no verdict, 24 pending/,
  );
  await page.screenshot({
    path: path.join(out, `revision-${fixed ? "after" : "before"}-home.png`),
    fullPage: true,
  });
  await page.goto(base + "#/wall");
  await page
    .getByRole("group", { name: "Show pleas by verdict" })
    .waitFor({ timeout: 60000 });
  results.wallCounts = await page
    .getByRole("group", { name: "Show pleas by verdict" })
    .innerText();
  assert.match(
    results.wallCounts,
    fixed ? /Pending\s*26\s*No verdict\s*1/ : /Pending\s*24\s*No verdict\s*3/,
  );
  results.initialCards = await page.locator(".wall-grid .wall-card").count();
  assert.equal(results.initialCards, 24);
  await page
    .getByRole("button", { name: "Load older pleas", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".wall-grid .wall-card").length === 32,
  );
  results.loadedCards = await page.locator(".wall-grid .wall-card").count();
  // A connected seat holder with no plea or leaderboard entry.
  const seatWallet = testers[5],
    seat = await read("Seasons", "seat");
  await request("anvil_setStorageAt", [
    seat,
    keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [seatWallet, 3n],
      ),
    ),
    pad(toHex(1n), { size: 32 }),
  ]);
  assert.equal(await read("Seasons", "holdsSeat", [seatWallet]), true);
  const seatPage = await wallet(seatWallet);
  await seatPage.goto(base + "#/seasons");
  await seatPage
    .getByRole("heading", { name: "The seat multiplier", exact: true })
    .first()
    .waitFor({ timeout: 60000 });
  await seatPage
    .getByText("0 + 0 + 0 = 0", { exact: true })
    .first()
    .waitFor({ timeout: 60000 });
  if (fixed)
    await seatPage
      .getByText("Seat held: every recorded plea earns × 1.2.", { exact: true })
      .first()
      .waitFor({ timeout: 30000 });
  results.seatNotice = await seatPage
    .getByText("Seat held: every recorded plea earns × 1.2.", { exact: true })
    .count();
  assert.equal(results.seatNotice > 0, fixed);
  const openSeller = await wallet(testers[0]);
  await openSeller.goto(base + "#/p/1");
  await openSeller
    .getByText("+40 points once recorded", { exact: true })
    .waitFor({ timeout: 60000 });
  assert.equal(
    await openSeller
      .getByRole("button", { name: /^Record (my|the) points/, exact: true })
      .getAttribute("aria-disabled"),
    "false",
  );
  await client.simulateContract({
    address: addresses.Seasons,
    abi: abis.Seasons,
    functionName: "record",
    args: [1n],
    account: testers[0],
  });
  results.openSeasonRecordAllowed = true;
  await audit(
    [page, seatPage],
    ["#/", "#/wall", "#/objections", "#/p/7", "#/seasons"],
    "open",
  );
  // Move to the grace boundary and close, deliberately omitting approved plea #1.
  const bounds = await read("Seasons", "seasonBounds", [0n]),
    grace = await read("Seasons", "CLOSE_GRACE");
  await request("evm_setNextBlockTimestamp", [
    Math.max(
      Number(bounds[2]) + Number(grace),
      Number((await client.getBlock({ cacheTime: 0 })).timestamp) + 1,
    ),
  ]);
  await request("evm_mine");
  await send(testers[0], "Seasons", "closeSeason", [[]]);
  assert.equal(await read("Seasons", "closed", [0n]), true);
  assert.equal(await read("Seasons", "recorded", [1n]), false);
  const sellerPage = await wallet(testers[0]);
  await sellerPage.goto(base + "#/p/1");
  await sellerPage
    .getByRole("button", { name: /^Record (my|the) points/, exact: true })
    .waitFor({ timeout: 60000 });
  const record = sellerPage.getByRole("button", {
    name: /^Record (my|the) points/,
    exact: true,
  });
  if (fixed)
    await sellerPage
      .getByText("Season 1 is closed; these points were not recorded.", {
        exact: true,
      })
      .first()
      .waitFor({ timeout: 30000 });
  results.recordDisabled = await record.getAttribute("aria-disabled");
  assert.equal(results.recordDisabled, String(fixed));
  results.closedMessage = (
    await sellerPage.locator("main").innerText()
  ).includes("Season 1 is closed; these points were not recorded.");
  assert.equal(results.closedMessage, fixed);
  if (!fixed) {
    const before = writes.length;
    await record.click();
    await sellerPage
      .getByText(
        "This season has already closed. Its points can no longer change.",
        { exact: true },
      )
      .first()
      .waitFor({ timeout: 20000 });
    assert.equal(
      writes.length,
      before,
      "failed simulation sent no transaction",
    );
  }
  await sellerPage.screenshot({
    path: path.join(out, `revision-${fixed ? "after" : "before"}-closed.png`),
    fullPage: true,
  });
  if (fixed)
    for (const id of [3, 4]) {
      await sellerPage.goto(base + `#/p/${id}`);
      await sellerPage
        .getByText("Season 1 is closed; these points were not recorded.", {
          exact: true,
        })
        .first()
        .waitFor({ timeout: 30000 });
      assert.doesNotMatch(
        await sellerPage.locator("main").innerText(),
        /points still count|once recorded/,
      );
      assert.equal(
        await sellerPage
          .getByRole("button", { name: /^Record (my|the) points/, exact: true })
          .getAttribute("aria-disabled"),
        "true",
      );
    }
  await audit(
    [page, sellerPage],
    ["#/p/1", "#/p/3", "#/p/4", "#/seasons"],
    "closed",
  );
  results.matrixRuns = matrix.length;
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  fs.writeFileSync(
    path.join(out, `revision-${fixed ? "after" : "before"}.json`),
    JSON.stringify({ fixed, results, errors, matrix }, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await request("evm_revert", [snapshot]);
}
