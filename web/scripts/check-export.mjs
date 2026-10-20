import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { keccak256, toHex } from "viem";
const root = path.resolve("dist");
const m = JSON.parse(fs.readFileSync(path.join(root, "imd-deployment.json"))),
  handoff = JSON.parse(fs.readFileSync("web/deployment-input.json")),
  net = JSON.parse(fs.readFileSync("web/network-input.json"));
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
const allowed = [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
  "contracts",
  "assets",
  "network",
  "walletAddChain",
  ...(handoff.poolKey ? ["poolKey"] : []),
].sort();
assert.deepEqual(Object.keys(m).sort(), allowed);
for (const k of ["launchId", "chainId", "sourceCommit", "attestationHash"])
  assert.equal(m[k], handoff[k]);
assert.equal(m.version, 1);
assert.deepEqual(m.network, net.network);
assert.deepEqual(m.walletAddChain, net.walletAddChain);
if (handoff.poolKey) assert.deepEqual(m.poolKey, handoff.poolKey);
assert.equal(m.contracts.length, handoff.contracts.length);
for (const [i, c] of m.contracts.entries()) {
  const h = handoff.contracts[i];
  assert.deepEqual(c, {
    name: h.name,
    address: h.address,
    abiHash: h.abiHash,
    abiPath: `abi/${h.name}.json`,
  });
  const abi = JSON.parse(fs.readFileSync(path.join(root, c.abiPath)));
  assert.ok(Array.isArray(abi));
  assert.equal(
    keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2),
    c.abiHash,
  );
}
const files = [];
function walk(p = "") {
  for (const f of fs.readdirSync(path.join(root, p), { withFileTypes: true })) {
    const n = path.posix.join(p, f.name);
    if (f.isDirectory()) walk(n);
    else if (n !== "imd-deployment.json") files.push(n);
  }
}
walk();
assert.ok(m.assets.length <= 128);
assert.deepEqual(m.assets.map((a) => a.path).sort(), files.sort());
let bytes = 0;
for (const a of m.assets) {
  assert.ok(!path.isAbsolute(a.path) && !a.path.split("/").includes(".."));
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  const data = fs.readFileSync(path.join(root, a.path));
  assert.ok(data.length <= 8388608);
  bytes += data.length;
  assert.equal(
    crypto.createHash("sha256").update(data).digest("hex"),
    a.sha256,
  );
}
assert.ok(
  fs.readFileSync(path.join(root, "index.html"), "utf8").includes("./assets/"),
);
const og = fs.readFileSync(path.join(root, "og.png"));
assert.equal(og.readUInt32BE(16), 1200);
assert.equal(og.readUInt32BE(20), 675);
console.log(
  `Export verified: ${files.length} assets, ${bytes} bytes; exact handoff/network and five canonical ABI hashes match.`,
);
