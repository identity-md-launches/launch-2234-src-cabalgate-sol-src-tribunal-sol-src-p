/** Optional fork-only seat fixture. The endpoint is deliberately loopback only. */
import fs from "node:fs";
import {
  createPublicClient,
  http,
  parseAbi,
  keccak256,
  encodeAbiParameters,
  toHex,
  pad,
} from "viem";
const c = createPublicClient({ transport: http("http://127.0.0.1:8545") }),
  a = JSON.parse(fs.readFileSync("test/scratch/fork/accounts.json")),
  abi = JSON.parse(fs.readFileSync("web/public/abi/Seasons.json")),
  seat = await c.readContract({
    address: a.addresses.Seasons,
    abi,
    functionName: "seat",
  }),
  wallet = a.testers[1];
const erc = parseAbi(["function balanceOf(address) view returns(uint256)"]);
let found;
for (let i = 0; i < 25; i++) {
  const key = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [wallet, BigInt(i)],
      ),
    ),
    snapshot = await c.request({ method: "evm_snapshot" });
  await c.request({
    method: "anvil_setStorageAt",
    params: [seat, key, pad(toHex(1n), { size: 32 })],
  });
  const value = await c
    .readContract({
      address: seat,
      abi: erc,
      functionName: "balanceOf",
      args: [wallet],
    })
    .catch(() => 0n);
  await c.request({ method: "evm_revert", params: [snapshot] });
  if (value === 1n) {
    found = { slot: i, key };
    break;
  }
}
if (!found) throw Error("No seat balance slot found");
await c.request({
  method: "anvil_setStorageAt",
  params: [seat, found.key, pad(toHex(1n), { size: 32 })],
});
console.log({
  seat,
  wallet,
  slot: found.slot,
  holdsSeat: await c.readContract({
    address: a.addresses.Seasons,
    abi,
    functionName: "holdsSeat",
    args: [wallet],
  }),
});
