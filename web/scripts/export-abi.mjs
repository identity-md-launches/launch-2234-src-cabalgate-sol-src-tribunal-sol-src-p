import fs from "node:fs";
import { keccak256, toHex } from "viem";
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const handoff = JSON.parse(
  fs.readFileSync(new URL("../deployment-input.json", import.meta.url)),
);
for (const name of [
  "PLEA",
  "CabalGate",
  "Seasons",
  "PleaDistributor",
  "PleaLaunch",
  "Letterbox",
  "Tribunal",
  "PleaHook",
]) {
  const abi = JSON.parse(
    fs.readFileSync(
      new URL(`../../out/${name}.sol/${name}.json`, import.meta.url),
    ),
  ).abi;
  const hash = keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2);
  const expected = handoff.contracts.find((c) => c.name === name)?.abiHash;
  if (expected && hash !== expected)
    throw Error(`${name} ABI mismatch: ${hash}`);
  fs.writeFileSync(
    new URL(`../public/abi/${name}.json`, import.meta.url),
    JSON.stringify(abi),
  );
  console.log(`${name}: ${hash}${expected ? " verified" : ""}`);
}
