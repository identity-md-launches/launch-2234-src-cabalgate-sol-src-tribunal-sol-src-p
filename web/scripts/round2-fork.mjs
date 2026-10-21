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
            overflowNodes: [...document.querySelectorAll("main *, .toasts *")]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.right > innerWidth + 1 && r.width > 0 && r.left >= 0;
              })
              .slice(0, 10)
              .map((el) => ({
                tag: el.tagName,
                class: el.className,
                text: el.textContent.slice(0, 100),
                right: el.getBoundingClientRect().right,
              })),
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
// Isolated round-2 states, restored on exit. Run after the primary scenario, before death.
async function at(timestamp) {
  await request("evm_setNextBlockTimestamp", [
    Math.max(
      timestamp,
      Number((await client.getBlock({ cacheTime: 0 })).timestamp) + 1,
    ),
  ]);
  await request("evm_mine");
}
async function approve(from, spender) {
  const hash = await request("eth_sendTransaction", [
    {
      from,
      to: pair,
      data: encodeFunctionData({
        abi: parseAbi(["function approve(address,uint256) returns(bool)"]),
        functionName: "approve",
        args: [spender, 10n ** 21n],
      }),
      gas: "0x989680",
    },
  ]);
  await receiptOf(hash, "approve");
}
async function holder() {
  const a = privateKeyToAccount(generatePrivateKey()).address;
  await request("anvil_impersonateAccount", [a]);
  await request("anvil_setBalance", [a, toHex(10n ** 20n)]);
  await request("anvil_setStorageAt", [
    pair,
    keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [a, 0n]),
    ),
    pad(toHex(1000n * 10n ** 18n), { size: 32 }),
  ]);
  await request("anvil_impersonateAccount", [addresses.PleaDistributor]);
  await request("anvil_setBalance", [
    addresses.PleaDistributor,
    toHex(10n ** 20n),
  ]);
  await send(addresses.PleaDistributor, "PLEA", "transfer", [
    a,
    1000000n * 10n ** 18n,
  ]);
  await approve(a, addresses.CabalGate);
  return a;
}
async function submit(a, score) {
  const id = await read("CabalGate", "nextId");
  await send(a, "CabalGate", "submitSell", [
    200000n * 10n ** 18n,
    "I ask to sell one fifth for rent and keep the rest.",
  ]);
  if (score !== undefined) await verdict("CabalGate", id, score);
  return id;
}
async function fresh(page, route) {
  await page.goto(base + route);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.locator("#main").waitFor();
  await page
    .locator(".page-loading")
    .waitFor({ state: "detached", timeout: 60000 });
}
try {
  const start = Number(await read("CabalGate", "startedAt")),
    length = Number(await read("Seasons", "SEASON")),
    current = Number((await read("Seasons", "currentSeason"))[1]),
    target = current + 1;
  await at(start + target * length + 10);
  const a = await holder(),
    seat = await read("Seasons", "seat");
  await request("anvil_setStorageAt", [
    seat,
    keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [a, 3n]),
    ),
    pad(toHex(1n), { size: 32 }),
  ]);
  const first = await submit(a, 40),
    page = await wallet(a);
  await fresh(page, "#/");
  await page
    .getByText(`Plea #${first}`, { exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  await page
    .locator(".hero .plea__summary")
    .getByText(/Sells.*≈/)
    .waitFor({ timeout: 30000 });
  assert.match(
    await page.locator(".hero .plea__summary").innerText(),
    /Sells[\s\S]*≈[\s\S]*\+48 points held/,
  );
  const firstP = await read("CabalGate", "getPlea", [first]);
  await at(Number(firstP.verdictAt) + 14401);
  await send(a, "Seasons", "record", [first]);
  const second = await submit(a, 45),
    secondP = await read("CabalGate", "getPlea", [second]);
  await at(Number(secondP.verdictAt) + 1201);
  await fresh(page, `#/p/${second}`);
  const record = page.getByRole("button", {
    name: "Record my points",
    exact: true,
  });
  await record.waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) =>
        b.textContent === "Record my points" &&
        b.getAttribute("aria-disabled") === "false",
    ),
  );
  await record.click();
  await page
    .getByText("+54 points recorded.", { exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  await fresh(page, "#/seasons");
  await page
    .getByText("45 · 40", { exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  assert.doesNotMatch(
    await page.locator(".lb__row .lb__best").innerText(),
    /\?| · 0/,
  );
  results.seatBestThree = true;
  await at(Number(secondP.verdictAt) + 14401);
  const third = await submit(a, 45);
  const b = await holder(),
    fourth = await submit(b, 40);
  await request("evm_increaseTime", [421]);
  await request("evm_mine");
  await approve(testers[0], addresses.Tribunal);
  await approve(testers[1], addresses.Tribunal);
  let oid = await read("Tribunal", "nextId");
  await send(testers[0], "Tribunal", "object", [
    fourth,
    "The score is too high for this reason.",
  ]);
  await verdict("Tribunal", oid, 40);
  const voidId = await read("Tribunal", "nextId");
  await send(testers[1], "Tribunal", "object", [
    fourth,
    "Please have a second panel review the score.",
  ]);
  const voidO = await read("Tribunal", "objection", [voidId]);
  await send(intake, "Tribunal", "onObjectionFailure", [
    voidO.intakeId,
    1,
    pad("0x", { size: 32 }),
    0,
    0,
    "0x",
  ]);
  const other = await wallet(testers[1]);
  await fresh(other, `#/p/${fourth}`);
  await other
    .getByText(/1 of 2 filed/)
    .first()
    .waitFor({ timeout: 30000 });
  results.voidCount = true;
  const lastOid = await read("Tribunal", "nextId");
  await send(testers[1], "Tribunal", "object", [
    fourth,
    "The earlier request was refused; please review the score.",
  ]);
  await fresh(other, `#/p/${fourth}`);
  await other
    .getByText(/points held until the second panel rules/)
    .waitFor({ timeout: 30000 });
  await verdict(
    "Tribunal",
    lastOid,
    Number((await read("CabalGate", "getPlea", [fourth])).need) - 3,
  );
  await fresh(other, `#/p/${fourth}`);
  await other
    .getByText(/Objections closed: objection #.*was sustained/)
    .first()
    .waitFor({ timeout: 30000 });
  assert.doesNotMatch(
    await other.locator(".status__sell").innerText(),
    /points still count/,
  );
  await request("evm_increaseTime", [421]);
  await request("evm_mine");
  await fresh(other, `#/p/${fourth}`);
  await other
    .getByText(/No points for this plea. Nothing was sold./)
    .first()
    .waitFor({ timeout: 30000 });
  const seller = await wallet(b);
  await fresh(seller, `#/objections?plea=${fourth}`);
  await seller
    .getByText(/Objections closed: objection #.*was sustained/)
    .first()
    .waitFor({ timeout: 30000 });
  assert.equal(
    await seller
      .getByText("Anyone else may ask a second panel. The sale stands.", {
        exact: true,
      })
      .count(),
    0,
  );
  results.sustained = true;
  await at(start + (target + 2) * length + 10);
  await fresh(page, "#/seasons");
  await page
    .getByText(/Seasons .*wait to be closed, oldest first/)
    .waitFor({ timeout: 30000 });
  assert.equal(await page.locator("#seat").count(), 1);
  const waiting = page
    .locator(".waiting-season")
    .filter({ hasText: `your plea #${third} to record` });
  await waiting.locator("summary").waitFor({ timeout: 30000 });
  await waiting.locator("summary").click();
  await waiting
    .getByRole("button", {
      name: new RegExp(`Record my points for plea #${third}`),
    })
    .waitFor({ timeout: 30000 });
  results.twoWaitingSeasons = true;
  await fresh(page, "#/profile/0x1234");
  await page.getByText("That is not an address.", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Save name", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByLabel("Any address").getAttribute("aria-invalid"),
    "true",
  );
  results.invalidProfile = true;
  const anon = await reader(`#/p/${fourth}`);
  await anon.context().route("https://api.imd.fun/**", (route) => {
    const id = route.request().url().split("/").at(-1);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id,
        panelSize: { bad: 1 },
        attestation: { agreed: {} },
        comment: { bad: 1 },
      }),
    });
  });
  await fresh(anon, `#/p/${third}`);
  await anon
    .getByRole("heading", { name: "The judges", exact: true })
    .waitFor();
  await anon.waitForTimeout(200);
  assert.equal(
    await anon.getByText("Can’t show this page", { exact: true }).count(),
    0,
  );
  results.malformedOracle = true;
  for (const width of [320, 768, 1280])
    for (const [route, id] of [
      ["#/how", "how"],
      ["#/contracts", "contracts"],
      ["#/seasons?seat=1", "seat"],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + route);
      await page.locator("#" + id).waitFor({ timeout: 30000 });
      await page.waitForTimeout(150);
      assert.ok(
        Math.abs(
          await page
            .locator("#" + id)
            .evaluate((el) => el.getBoundingClientRect().top),
        ) < 2,
        route + " at " + width,
      );
    }
  results.anchors = true;
  // Loaded pages retain state and focus as older pending pleas change on chain.
  const pendingIds = [];
  for (let i = 0; i < 32; i++) pendingIds.push(await submit(await holder()));
  await fresh(page, "#/wall");
  await page.waitForFunction(
    (count) =>
      document
        .querySelector(".wall-tools .chip")
        ?.textContent.replace(/\s/g, "") ===
      "All" + count,
    Number(await read("CabalGate", "nextId")) - 1,
  );
  await page
    .getByRole("button", { name: "Load older pleas", exact: true })
    .click();
  const oldLink = page.locator(`.wall-card > a[href="#/p/${pendingIds[0]}"]`);
  await oldLink.waitFor({ timeout: 30000 });
  await oldLink.focus();
  const scroll = await page.evaluate(() => scrollY);
  await verdict("CabalGate", pendingIds[0], 45);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await oldLink
    .locator("..")
    .locator(".stamp")
    .filter({ hasText: "APPROVED" })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await oldLink.evaluate((el) => el === document.activeElement),
    true,
  );
  assert.ok(Math.abs((await page.evaluate(() => scrollY)) - scroll) < 2);
  await send(testers[0], "Tribunal", "object", [
    pendingIds[0],
    "Please review this older approval.",
  ]);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await oldLink
    .locator("..")
    .locator(".stamp--objection")
    .waitFor({ timeout: 30000 });
  results.olderWallRefresh = true;
  await verdict("CabalGate", pendingIds[1], 0);
  await fresh(page, "#/");
  await page
    .locator(".hero .stamp")
    .filter({ hasText: "DENIED" })
    .waitFor({ timeout: 30000 });
  assert.match(
    await page.locator(".hero .plea__summary").innerText(),
    /no points/,
  );
  assert.doesNotMatch(
    await page.locator(".hero .plea__summary").innerText(),
    /Sells|Sold|\+0 points/,
  );
  results.deniedHero = true;
  await audit(
    [page, anon],
    ["#/seasons", `#/p/${third}`, `#/p/${fourth}`, "#/profile/0x1234"],
    "round2",
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, matrixRuns: matrix.length }));
} finally {
  fs.writeFileSync(
    path.join(out, "round2.json"),
    JSON.stringify({ results, errors, matrix }, null, 2),
  );
  for (const [i, c] of contexts.slice(-3).entries())
    for (const p of c.pages()) {
      try {
        fs.writeFileSync(
          path.join(out, `round2-last-${i}.txt`),
          await p.locator("main").innerText(),
        );
        await p.screenshot({
          path: path.join(out, `round2-last-${i}.png`),
          fullPage: true,
        });
      } catch {}
    }
  await browser.close();
  await new Promise((r) => server.close(r));
  await request("evm_revert", [snapshot]);
}
