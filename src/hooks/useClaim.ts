import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { getBaseSepoliaClient } from "../lib/client";
import { executeClaim, type ClaimStage } from "../lib/claimExecution";
import { useWalletSigner } from "../wallet/useWallet";

export interface ClaimController {
  stage: ClaimStage;
  claim: () => Promise<void>;
  isBusy: boolean;
}

const BUSY_STAGES: ReadonlySet<ClaimStage["kind"]> = new Set([
  "simulating",
  "awaiting-signature",
  "submitted",
  "confirming",
]);

/**
 * Thin React wrapper around the pure claim state machine. One instance is
 * used per position card (the card is keyed by market id, so no stale state
 * can leak between markets).
 */
export function useClaim(
  referenceAddress: Address | undefined,
  marketId: bigint,
): ClaimController {
  const { walletClient, address } = useWalletSigner();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<ClaimStage>({ kind: "idle" });

  const claim = useCallback(async () => {
    if (!referenceAddress) {
      setStage({
        kind: "failed",
        message:
          "The reference contract is not configured, so a claim cannot be sent.",
      });
      return;
    }
    if (!walletClient || !address) {
      setStage({ kind: "failed", message: "Connect your wallet first." });
      return;
    }

    const finalStage = await executeClaim(
      {
        publicClient: getBaseSepoliaClient(),
        walletClient,
        account: address,
        referenceAddress,
        marketId,
      },
      setStage,
    );

    if (finalStage.kind === "confirmed") {
      void queryClient.invalidateQueries({ queryKey: ["user-positions"] });
    }
  }, [address, marketId, queryClient, referenceAddress, walletClient]);

  return {
    stage,
    claim,
    isBusy: BUSY_STAGES.has(stage.kind),
  };
}
