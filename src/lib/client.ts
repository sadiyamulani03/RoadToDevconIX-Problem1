import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { readEnv, isSafeRpcUrl, DEFAULT_RPC_URL } from "./env";

/**
 * A single read-only client pinned to Base Sepolia.
 *
 * All reads deliberately go through this client (not the wallet's current
 * network) so that:
 *   - the dashboard works without a wallet connected;
 *   - a wallet being on the wrong chain can never silently redirect reads to
 *     a different network;
 *   - one client instance serves every query (connection reuse on mobile).
 *
 * Only write paths consult the connected wallet, and they are chain-guarded.
 */

function buildBaseSepoliaClient(url: string) {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(url, {
      retryCount: 2,
      retryDelay: 300,
      timeout: 15_000,
    }),
  });
}

export type BaseSepoliaClient = ReturnType<typeof buildBaseSepoliaClient>;

let cached: BaseSepoliaClient | undefined;
let cachedUrl: string | undefined;

export function getBaseSepoliaClient(rpcUrl?: string): BaseSepoliaClient {
  let url = rpcUrl ?? readEnv().rpcUrl;
  if (!isSafeRpcUrl(url)) {
    url = DEFAULT_RPC_URL;
  }
  if (!cached || cachedUrl !== url) {
    cached = buildBaseSepoliaClient(url);
    cachedUrl = url;
  }
  return cached;
}

/** Test seam. */
export function resetBaseSepoliaClient(): void {
  cached = undefined;
  cachedUrl = undefined;
}
