import { getAddress, isAddress, type Address } from "viem";
import { readEnv } from "../lib/env";

/**
 * Reference-contract address resolution.
 *
 * Order of precedence:
 *   1. Runtime override  (user pastes the verified address on their device;
 *      stored in localStorage only - never transmitted anywhere)
 *   2. Build-time env    (VITE_REFERENCE_CONTRACT_ADDRESS)
 *   3. Unconfigured      (explicit UI state - no mock contract is substituted)
 */

export const ADDRESS_OVERRIDE_KEY = "chai-stall.reference-contract-address";
export const ADDRESS_CHANGED_EVENT = "chai-stall:reference-contract-changed";

export type AddressSource = "override" | "env" | "none";

export interface ReferenceContractState {
  address?: Address;
  source: AddressSource;
}

/** Returns a checksummed address, or undefined for anything invalid. */
export function normalizeAddress(value: unknown): Address | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!isAddress(trimmed)) return undefined;
  const checksummed = getAddress(trimmed);
  if (/^0x0{40}$/i.test(checksummed)) return undefined;
  return checksummed;
}

function readOverride(): Address | undefined {
  try {
    return normalizeAddress(window.localStorage.getItem(ADDRESS_OVERRIDE_KEY));
  } catch {
    return undefined;
  }
}

export function getReferenceContract(): ReferenceContractState {
  const override = readOverride();
  if (override) return { address: override, source: "override" };

  const fromEnv = normalizeAddress(readEnv().referenceContractAddress);
  if (fromEnv) return { address: fromEnv, source: "env" };

  return { source: "none" };
}

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(ADDRESS_CHANGED_EVENT));
  } catch {
    /* non-browser environments: nothing to notify */
  }
}

export interface SetOverrideResult {
  ok: boolean;
  error?: string;
}

/**
 * Persists (or clears, with null) the runtime address override.
 * Returns an explicit error for invalid input instead of silently ignoring it.
 */
export function setAddressOverride(value: string | null): SetOverrideResult {
  if (value === null || value.trim().length === 0) {
    try {
      window.localStorage.removeItem(ADDRESS_OVERRIDE_KEY);
      notify();
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not access local storage." };
    }
  }

  const normalized = normalizeAddress(value);
  if (!normalized) {
    return {
      ok: false,
      error:
        "That does not look like a valid EVM contract address (expected 0x + 40 hex characters).",
    };
  }

  try {
    window.localStorage.setItem(ADDRESS_OVERRIDE_KEY, normalized);
    notify();
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not access local storage." };
  }
}

export function subscribeReferenceContract(listener: () => void): () => void {
  const onLocal = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === ADDRESS_OVERRIDE_KEY) listener();
  };
  window.addEventListener(ADDRESS_CHANGED_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ADDRESS_CHANGED_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}
