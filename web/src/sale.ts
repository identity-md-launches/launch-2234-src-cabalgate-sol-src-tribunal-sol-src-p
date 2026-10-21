import { useAccount } from "wagmi";
import { useApp, useRead } from "./context";
import { read, type Plea } from "./chain";
import { poolQuote } from "./pages-trade";
export function useSaleQuote(p?: Plea) {
  const { r, s } = useApp(),
    { address } = useAccount();
  return useRead(
    async () => {
      if (!p) return 0n;
      const allowance = address
        ? await read(r, "PLEA", "allowance", [address, r.addresses.CabalGate])
        : 0n;
      if (
        address?.toLowerCase() === p.seller.toLowerCase() &&
        allowance >= p.amount &&
        !(p.flags & 2)
      ) {
        const result = await r.client.simulateContract({
          address: r.addresses.CabalGate,
          abi: r.abis.CabalGate,
          functionName: "executeSell",
          args: [0n],
          account: address,
        });
        return result.result as bigint;
      }
      return (await poolQuote(r, s!, p.amount, true)).out;
    },
    [p?.id, address, p?.status],
    !!s && !!p && p.status === 2,
  );
}
