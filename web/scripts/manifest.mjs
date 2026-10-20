import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = new URL("../../dist/", import.meta.url),
  handoff = JSON.parse(
    fs.readFileSync(new URL("../deployment-input.json", import.meta.url)),
  ),
  net = JSON.parse(
    fs.readFileSync(new URL("../network-input.json", import.meta.url)),
  );
const files = [];
function walk(p = "") {
  for (const f of fs.readdirSync(new URL(p, root), { withFileTypes: true })) {
    const n = p + f.name;
    if (f.isDirectory()) walk(n + "/");
    else if (n !== "imd-deployment.json") files.push(n);
  }
}
walk();
const m = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts: handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
    abiPath: `abi/${name}.json`,
  })),
  assets: files.sort().map((p) => ({
    path: p,
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(new URL(p, root)))
      .digest("hex"),
  })),
  network: net.network,
  walletAddChain: net.walletAddChain,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
};
if (files.length > 128) throw Error("Too many assets");
fs.writeFileSync(
  new URL("imd-deployment.json", root),
  JSON.stringify(m, null, 2) + "\n",
);
console.log(
  `Manifest: ${files.length} assets, ${files.reduce((s, p) => s + fs.statSync(new URL(p, root)).size, 0)} bytes`,
);
