import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CHAIN_ID } from "../config/chain";
import { getBaseSepoliaClient } from "../lib/client";
import { isRetryableReadError } from "../lib/errors";
import { derivePhase, winningShares } from "../lib/eligibility";
import { fetchMarketsByIds, type MarketData, type PositionStruct } from "../lib/markets";
import { readEnv } from "../lib/env";
import {
  fetchClaimEligibility,
  fetchUserPositionsSnapshot,
  type ClaimEligibility,
  type EventCostBasis,
} from "../lib/positions";
import { useReferenceContract } from "./useReferenceContract";
import { useWalletAccount } from "../wallet/useWallet";

export interface PositionView {
  marketId: bigint;
  position?: PositionStruct;
  market?: MarketData;
  cost?: EventCostBasis;
}

export interface UserPositionsView {
  rows: PositionView[];
  failedMarketIds: bigint[];
  eventsWarning?: string;
  idSource: "contract" | "events";
  eligibility: Map<bigint, ClaimEligibility>;
}

const POSITIONS_STALE_MS = 15_000;

/**
 * Positions for the CONNECTED wallet only, discovered via
 * getUserMarketIds(address) (or the address-filtered log fallback), never by
 * scanning all markets. React Query keys are account-scoped
 * ("user-positions", chain, contract, address), so switching wallets cannot
 * surface another account's cached rows, and the extra effect below evicts
 * other accounts' cached rows as soon as the account changes (shared-device
 * hygiene).
 */
export function useUserPositions() {
  const { address: referenceAddress } = useReferenceContract();
  const { address: user, isConnected } = useWalletAccount();
  const queryClient = useQueryClient();

  const query = useQuery<UserPositionsView>({
    queryKey: [
      "user-positions",
      CHAIN_ID,
      referenceAddress ?? "unconfigured",
      user ? user.toLowerCase() : "no-wallet",
    ],
    enabled: Boolean(referenceAddress && user),
    staleTime: POSITIONS_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: (failureCount, error) =>
      isRetryableReadError(error) && failureCount < 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
    queryFn: async (): Promise<UserPositionsView> => {
      if (!referenceAddress || !user) {
        throw new Error("Wallet not connected or contract not configured.");
      }
      const client = getBaseSepoliaClient();
      const { deploymentBlock } = readEnv();

      const snapshot = await fetchUserPositionsSnapshot(
        client,
        referenceAddress,
        user,
        { deploymentBlock },
      );

      const markets = await fetchMarketsByIds(
        client,
        referenceAddress,
        snapshot.marketIds,
      );
      const marketById = new Map<bigint, MarketData>(
        markets.map((market) => [market.id, market]),
      );

      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      const claimCandidates: bigint[] = [];
      for (const marketId of snapshot.marketIds) {
        const market = marketById.get(marketId);
        const position = snapshot.positions.get(marketId);
        if (!market || !position || position.claimed) continue;
        if (derivePhase(market, nowSeconds) !== "resolved") continue;
        if (winningShares(market.winningOutcome, position) > 0n) {
          claimCandidates.push(marketId);
        }
      }

      const eligibility = await fetchClaimEligibility(
        client,
        referenceAddress,
        user,
        claimCandidates,
      );

      const rows: PositionView[] = snapshot.marketIds.map((marketId) => {
        const position = snapshot.positions.get(marketId);
        const market = marketById.get(marketId);
        const cost = snapshot.costByMarket.get(marketId);
        return {
          marketId,
          ...(position ? { position } : {}),
          ...(market ? { market } : {}),
          ...(cost ? { cost } : {}),
        };
      });

      return {
        rows,
        failedMarketIds: snapshot.failedMarketIds,
        ...(snapshot.eventsWarning ? { eventsWarning: snapshot.eventsWarning } : {}),
        idSource: snapshot.idSource,
        eligibility,
      };
    },
  });

  useEffect(() => {
    if (!user) return;
    const currentKey = user.toLowerCase();
    const cache = queryClient.getQueryCache();
    for (const cached of cache.findAll({ queryKey: ["user-positions"] })) {
      const key = cached.queryKey;
      const keyUser = typeof key[3] === "string" ? key[3] : "";
      if (keyUser !== currentKey && keyUser !== "no-wallet") {
        void queryClient.removeQueries({ queryKey: key });
      }
    }
  }, [user, queryClient]);

  return {
    ...query,
    isConfigured: Boolean(referenceAddress),
    isConnected,
    referenceAddress,
    user,
  };
}
