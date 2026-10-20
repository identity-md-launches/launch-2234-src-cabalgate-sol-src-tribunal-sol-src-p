import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodeFunctionData,
  keccak256,
  encodeAbiParameters,
  toHex,
  pad,
} from "viem";
const rpc = "http://127.0.0.1:8545",
  c = createPublicClient({ transport: http(rpc) }),
  m = JSON.parse(fs.readFileSync("dist/imd-deployment.json")),
  addresses = Object.fromEntries(m.contracts.map((c) => [c.name, c.address])),
  abis = Object.fromEntries(
    Object.keys(addresses).map((n) => [
      n,
      JSON.parse(fs.readFileSync(`web/public/abi/${n}.json`)),
    ]),
  );
const request = (method, params = []) => c.request({ method, params });
const owner = await c.readContract({
    address: addresses.PLEA,
    abi: abis.PLEA,
    functionName: "owner",
  }),
  hook = await c.readContract({
    address: addresses.PleaLaunch,
    abi: abis.PleaLaunch,
    functionName: "hook",
  }),
  pair = await c.readContract({
    address: addresses.PleaLaunch,
    abi: abis.PleaLaunch,
    functionName: "imd",
  }),
  testers = [...(await request("eth_accounts"))].slice(2, 8);
const erc = parseAbi(["function balanceOf(address) view returns(uint256)"]);
let slot;
for (let i = 0; i < 20; i++) {
  const key = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [owner, BigInt(i)],
      ),
    ),
    before = await request("eth_getStorageAt", [pair, key, "latest"]),
    snapshot = await request("evm_snapshot"),
    marker = 123456789000000000000n;
  await request("anvil_setStorageAt", [
    pair,
    key,
    pad(toHex(marker), { size: 32 }),
  ]);
  if (
    (await c.readContract({
      address: pair,
      abi: erc,
      functionName: "balanceOf",
      args: [owner],
    })) === marker
  )
    slot = i;
  await request("evm_revert", [snapshot]);
  if (slot !== undefined) break;
}
if (slot === undefined)
  throw Error("Could not locate fork token balance storage");
for (const a of [owner, ...testers]) {
  await request("anvil_impersonateAccount", [a]);
  await request("anvil_setBalance", [a, toHex(100n * 10n ** 18n)]);
  await request("anvil_setStorageAt", [
    pair,
    keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [a, BigInt(slot)],
      ),
    ),
    pad(toHex(10000n * 10n ** 18n), { size: 32 }),
  ]);
}
fs.mkdirSync("test/scratch/fork", { recursive: true });
fs.writeFileSync(
  "test/scratch/fork/accounts.json",
  JSON.stringify({ owner, testers, pair, hook, addresses }, null, 2),
);
console.log({ owner, testers, pair, hook, balanceSlot: slot });
