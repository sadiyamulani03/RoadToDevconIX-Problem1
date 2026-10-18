import { useSyncExternalStore } from "react";
import {
  getReferenceContract,
  subscribeReferenceContract,
  type ReferenceContractState,
} from "../config/contract";

let cachedSnapshot: ReferenceContractState | undefined;

function getSnapshot(): ReferenceContractState {
  const next = getReferenceContract();
  if (
    !cachedSnapshot ||
    cachedSnapshot.address !== next.address ||
    cachedSnapshot.source !== next.source
  ) {
    cachedSnapshot = next;
  }
  return cachedSnapshot;
}

/**
 * Live view of the resolved reference-contract address, subscribed to the
 * runtime override (including changes made from another browser tab). The
 * snapshot is cached so React sees a stable reference between changes.
 */
export function useReferenceContract(): ReferenceContractState {
  return useSyncExternalStore(
    subscribeReferenceContract,
    getSnapshot,
    getSnapshot,
  );
}
