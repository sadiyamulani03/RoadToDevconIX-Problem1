import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { baseSepolia } from "viem/chains";
import { DEFAULT_RPC_URL, isSafeRpcUrl, readEnv } from "../lib/env";

/**
 * Wallet connectivity is limited to what the challenge needs:
 *   - an injected provider (browser wallet / mobile wallet browser);
 *   - Coinbase Wallet (works as a phone-friendly fallback).
 *
 * WalletConnect is deliberately NOT enabled: it requires shipping a project
 * id that would be a tracked third-party credential, which this project
 * avoids. Writes only ever target Base Sepolia via `baseSepolia`.
 */

function resolveRpcUrl(): string {
  const { rpcUrl } = readEnv();
  return isSafeRpcUrl(rpcUrl) ? rpcUrl : DEFAULT_RPC_URL;
}

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: "The Chai-Stall Terminal" }),
  ],
  transports: {
    [baseSepolia.id]: http(resolveRpcUrl(), {
      retryCount: 2,
      retryDelay: 300,
      timeout: 15_000,
    }),
  },
  multiInjectedProviderDiscovery: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
