/**
 * Typed, validated access to build-time environment variables.
 *
 * All VITE_* values are PUBLIC - they end up in the client bundle. This module
 * deliberately reads `import.meta.env` lazily (per call) so tests can stub
 * values before reading, and so a missing value never crashes module import.
 */

export const DEFAULT_RPC_URL = "https://sepolia.base.org";

export interface AppEnv {
  /** Base Sepolia JSON-RPC endpoint. Falls back to the public endpoint. */
  rpcUrl: string;
  /** Raw reference-contract address from the environment ("" when unset). */
  referenceContractAddress: string;
  /** Optional deployment block used to bound event-log scans. */
  deploymentBlock?: bigint;
}

export function readEnv(): AppEnv {
  const rawRpc = (import.meta.env.VITE_BASE_SEPOLIA_RPC ?? "").trim();
  const referenceContractAddress = (
    import.meta.env.VITE_REFERENCE_CONTRACT_ADDRESS ?? ""
  ).trim();
  const rawBlock = (import.meta.env.VITE_CONTRACT_DEPLOYMENT_BLOCK ?? "").trim();

  let deploymentBlock: bigint | undefined;
  if (/^\d+$/.test(rawBlock)) {
    deploymentBlock = BigInt(rawBlock);
  }

  return {
    rpcUrl: rawRpc.length > 0 ? rawRpc : DEFAULT_RPC_URL,
    referenceContractAddress,
    deploymentBlock,
  };
}

/**
 * Rejects non-HTTPS remote RPC URLs (an http:// endpoint would be both
 * insecure and blocked by browsers as mixed content). localhost is allowed
 * for local development nodes.
 */
export function isSafeRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}
