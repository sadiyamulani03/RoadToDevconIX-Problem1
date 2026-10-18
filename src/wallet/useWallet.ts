import { useCallback, useState } from "react";
import type { Address, WalletClient } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { CHAIN_ID } from "../config/chain";

/**
 * The only module that imports wagmi hooks for wallet state. Everything else
 * consumes these small wrappers, which keeps components testable without a
 * live wallet and keeps the "wrong chain never writes" rule auditable in one
 * place.
 */

export interface WalletAccount {
  address?: Address;
  isConnected: boolean;
  chainId?: number;
  isOnBaseSepolia: boolean;
}

export function useWalletAccount(): WalletAccount {
  const { address, isConnected, chainId } = useAccount();
  return {
    address,
    isConnected,
    chainId,
    isOnBaseSepolia: chainId === CHAIN_ID,
  };
}

export interface WalletActions {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchToBaseSepolia: () => Promise<void>;
  isConnecting: boolean;
  isSwitching: boolean;
  error?: string;
}

export function useWalletActions(): WalletActions {
  const { connectors, connectAsync, isPending: isConnecting, error: connectError } =
    useConnect();
  const { disconnectAsync } = useDisconnect();
  const {
    switchChainAsync,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain();

  const [actionError, setActionError] = useState<string | undefined>();

  const connect = useCallback(async () => {
    setActionError(undefined);
    const preferred =
      connectors.find((connector) => connector.id === "injected") ??
      connectors[0];
    if (!preferred) {
      setActionError(
        "No wallet found. Open this page in a wallet browser or install a browser wallet.",
      );
      return;
    }
    try {
      await connectAsync({ connector: preferred });
    } catch (error) {
      setActionError(
        error instanceof Error && error.name === "UserRejectedRequestError"
          ? "Connection request was rejected."
          : "Could not connect. No wallet found or the connection was cancelled.",
      );
    }
  }, [connectAsync, connectors]);

  const disconnect = useCallback(async () => {
    setActionError(undefined);
    try {
      await disconnectAsync();
    } catch {
      setActionError("Could not disconnect cleanly. Try reloading the page.");
    }
  }, [disconnectAsync]);

  const switchToBaseSepolia = useCallback(async () => {
    setActionError(undefined);
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch {
      setActionError(
        "Could not switch networks. Use your wallet to select Base Sepolia (chain 84532).",
      );
    }
  }, [switchChainAsync]);

  const rawError =
    actionError ??
    (connectError
      ? "Could not connect. No wallet found or the connection was cancelled."
      : undefined) ??
    (switchError ? "Could not switch networks." : undefined);

  return {
    connect,
    disconnect,
    switchToBaseSepolia,
    isConnecting,
    isSwitching,
    error: rawError,
  };
}

export interface WalletSigner {
  walletClient?: WalletClient;
  address?: Address;
  chainId?: number;
}

/** The signing client used exclusively by the claim flow. */
export function useWalletSigner(): WalletSigner {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  return {
    walletClient: walletClient ?? undefined,
    address,
    chainId,
  };
}
