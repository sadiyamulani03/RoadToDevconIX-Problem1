import { baseSepolia } from "viem/chains";

/** Base Sepolia testnet - the only network this app reads from or writes to. */
export const CHAIN_ID = 84532;
export const CHAIN_NAME = "Base Sepolia";
export const EXPLORER_URL = "https://sepolia.basescan.org";

export const TARGET_CHAIN = baseSepolia;

/**
 * Only used when the contract exposes a decimals getter that cannot be read,
 * and always surfaced in the UI as an assumption (never silently).
 */
export const FALLBACK_DECIMALS = 18;

/** Safety cap on how many markets are read per refresh. */
export const MAX_MARKETS = 200;

/** How many market structs are batched per multicall round trip. */
export const MARKET_READ_CHUNK = 25;

/** Block-range size for each eth_getLogs request in the fallback scan. */
export const LOG_CHUNK_SIZE = 50_000n;

/**
 * When no deployment block is configured, the event-log fallback scans only
 * this many recent blocks so a mobile device is never asked to replay the
 * whole chain.
 */
export const MAX_LOG_LOOKBACK_BLOCKS = 250_000n;

const CHAIN_LABELS: Record<number, string> = {
  84532: "Base Sepolia",
  8453: "Base",
  1: "Ethereum",
  11155111: "Sepolia",
};

export function chainLabel(chainId: number | undefined): string {
  if (chainId === undefined) return "Unknown network";
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
}
