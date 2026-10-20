import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  keccak256,
  toHex,
  parseAbi,
  type Abi,
  type Address,
} from "viem";
import { createConfig } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
export const APP = {
  eventStart: 11948819n,
  oracleApi: "https://api.imd.fun",
  claimsPath: "claims.json",
  expected: {
    Letterbox: "0xbc335ae3dc12d4bf78f8e44a03f4fc62e3afd1d3",
    Tribunal: "0xcd6aac81882a6ae51041e8094bca0feabd3fc566",
    PleaHook: "0x07b4698506cf15b9a91805aa90010a47a04228cc",
  },
  swapRouter: "0x9b6b46e2c869aa39918db7f52f5557fe577b6eee" as Address,
  delegateRegistry: "0x00000000000000447e69651d841bd8d104bed493" as Address,
};
export const erc20Abi = parseAbi([
  "function symbol() view returns(string)",
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
]);
export const claimsAbi = parseAbi([
  "function balanceOf(address,uint256) view returns(uint256)",
  "function transfer(address,uint256,uint256) returns(bool)",
]);
export const registryAbi = parseAbi([
  "struct Delegation { uint8 type; address to; address from; bytes32 rights; address contract_; uint256 tokenId; uint256 amount; }",
  "function getIncomingDelegations(address) view returns(Delegation[])",
]);
export const poolTuple =
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export const swapAbi = parseAbi([
  `function swap(${poolTuple} key,(bool zeroForOne,int256 amountSpecified,uint160 sqrtPriceLimitX96) params,(bool takeClaims,bool settleUsingBurn) testSettings,bytes hookData) payable returns(int256 delta)`,
]);
export const quoterAbi = parseAbi([
  `function quoteExactInputSingle((${poolTuple} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256 amountOut,uint256 gasEstimate)`,
]);
const canonical = (v: any): any =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
export async function loadConfig() {
  const response = await fetch("./imd-deployment.json");
  if (!response.ok)
    throw Error("The deployment file could not be loaded. Reload this page.");
  const manifest = await response.json();
  const n = manifest.network;
  if (n.chainId !== manifest.chainId)
    throw Error("Deployment and network disagree. Transactions are disabled.");
  const chain = defineChain({
    id: manifest.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: "Etherscan", url: n.explorer } },
    testnet: n.testnet,
  });
  const transport = () =>
    fallback(
      n.rpcUrls.map((url: string) =>
        http(url, { timeout: 12000, retryCount: 1, batch: { wait: 20 } }),
      ),
      { rank: false, retryCount: 1 },
    );
  const client = createPublicClient({ chain, transport: transport() });
  const abis: Record<string, Abi> = {};
  const addresses: Record<string, Address> = {};
  await Promise.all(
    [
      ...manifest.contracts.map((c: any) => c.name),
      "Letterbox",
      "Tribunal",
      "PleaHook",
    ].map(async (name) => {
      const entry = manifest.contracts.find((c: any) => c.name === name);
      const r = await fetch("./" + (entry?.abiPath || `abi/${name}.json`));
      if (!r.ok) throw Error(`Cannot load ${name}'s interface.`);
      const abi = await r.json();
      if (
        entry &&
        keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2) !==
          entry.abiHash
      )
        throw Error(`${name}'s interface does not match the deployment.`);
      abis[name] = abi;
      if (entry) addresses[name] = entry.address;
    }),
  );
  const walletConfig = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({ appName: "PLEA", preference: "all" }),
    ],
    transports: { [chain.id]: transport() },
  });
  return { manifest, network: n, chain, client, abis, addresses, walletConfig };
}
export type Runtime = Awaited<ReturnType<typeof loadConfig>>;
export async function discover(r: Runtime) {
  if ((await r.client.getChainId()) !== r.chain.id)
    throw Error("The RPC answered for another network. Try again.");
  for (const [name, method] of [
    ["Letterbox", "letterbox"],
    ["Tribunal", "tribunal"],
    ["PleaHook", "hook"],
  ]) {
    const address = (await r.client.readContract({
      address: r.addresses.PleaLaunch,
      abi: r.abis.PleaLaunch,
      functionName: method,
    })) as Address;
    if (
      address.toLowerCase() !== APP.expected[name as keyof typeof APP.expected]
    )
      throw Error(
        `${name} differs from the run 9 address. Transactions are disabled.`,
      );
    r.addresses[name] = address;
  }
  const token = (await r.client.readContract({
    address: r.addresses.PleaLaunch,
    abi: r.abis.PleaLaunch,
    functionName: "imd",
  })) as Address;
  r.addresses.PairToken = token;
  const pm = await r.client.readContract({
    address: r.addresses.PleaLaunch,
    abi: r.abis.PleaLaunch,
    functionName: "poolManager",
  });
  if (
    String(pm).toLowerCase() !== r.network.uniswapV4.poolManager.toLowerCase()
  )
    throw Error("PoolManager differs from the network handoff.");
  await Promise.all(
    [...Object.values(r.addresses), APP.swapRouter].map(async (a) => {
      const code = await r.client.getCode({ address: a });
      if (!code || code === "0x")
        throw Error(`A required contract has no code: ${a}`);
    }),
  );
  return r;
}
