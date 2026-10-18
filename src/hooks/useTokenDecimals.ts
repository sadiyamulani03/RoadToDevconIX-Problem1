import { useQuery } from "@tanstack/react-query";
import { referenceAbi } from "../config/abi";
import { CHAIN_ID, FALLBACK_DECIMALS } from "../config/chain";
import { getBaseSepoliaClient } from "../lib/client";
import { coerceBigInt, readOne } from "../lib/markets";
import { useReferenceContract } from "./useReferenceContract";

export interface TokenDecimals {
  decimals: number;
  source: "contract" | "assumed";
}

/**
 * Play-token decimals, read from the contract (tokenDecimals() or
 * decimals()). This value is REQUIRED before any raw uint256 can be rendered
 * as a human-readable amount. If the contract does not expose a readable
 * getter, the hook returns an explicit `source: "assumed"` result and the UI
 * must surface that assumption - it is never silent.
 */
export function useTokenDecimals() {
  const { address } = useReferenceContract();

  return useQuery<TokenDecimals>({
    queryKey: ["token-decimals", CHAIN_ID, address ?? "unconfigured"],
    enabled: Boolean(address),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TokenDecimals> => {
      const client = getBaseSepoliaClient();
      for (const functionName of ["tokenDecimals", "decimals"] as const) {
        try {
          const raw = await readOne(client, {
            address: address as `0x${string}`,
            abi: referenceAbi,
            functionName,
            args: [],
          });
          const decimalsCount = coerceBigInt(raw);
          if (decimalsCount !== undefined && decimalsCount <= 36n) {
            return { decimals: Number(decimalsCount), source: "contract" };
          }
        } catch {
          /* probe the next getter spelling */
        }
      }
      return { decimals: FALLBACK_DECIMALS, source: "assumed" };
    },
  });
}
