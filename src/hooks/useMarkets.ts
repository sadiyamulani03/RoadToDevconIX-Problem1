import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { CHAIN_ID } from "../config/chain";
import { getBaseSepoliaClient } from "../lib/client";
import { isRetryableReadError } from "../lib/errors";
import { fetchMarkets, type MarketFeed } from "../lib/markets";
import { useReferenceContract } from "./useReferenceContract";

const MARKETS_STALE_MS = 30_000;

export function useMarkets() {
  const { address, source } = useReferenceContract();

  const query = useQuery<MarketFeed>({
    queryKey: ["markets", CHAIN_ID, address ?? "unconfigured"],
    enabled: Boolean(address),
    staleTime: MARKETS_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: (failureCount, error) =>
      isRetryableReadError(error) && failureCount < 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
    queryFn: () => {
      if (!address) {
        throw new Error("Reference contract is not configured.");
      }
      return fetchMarkets(getBaseSepoliaClient(), address as Address);
    },
  });

  return {
    ...query,
    isConfigured: Boolean(address),
    referenceAddress: address,
    addressSource: source,
  };
}
