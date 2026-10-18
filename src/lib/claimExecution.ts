import {
  AbiFunctionNotFoundError,
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { referenceAbi } from "../config/abi";
import { CHAIN_ID } from "../config/chain";
import { WrongChainError, toUserFacingError } from "./errors";
import type { BaseSepoliaClient } from "./client";

/**
 * Claim execution state machine.
 *
 * Guarantees implemented here (and unit-tested):
 *   - chain guard: refuses to simulate/send unless BOTH the read client and
 *     the connected wallet are on Base Sepolia (84532);
 *   - the sender is re-validated against the wallet client right before the
 *     write, so a mid-flow account switch cannot misattribute a claim;
 *   - the contract is asked first (simulateContract) and remains the final
 *     authority - a rejected simulation is surfaced, never bypassed;
 *   - success is reported ONLY after a transaction receipt with
 *     status === "success"; mined-but-reverted receipts are reported as
 *     failures with the hash preserved;
 *   - a pending timeout keeps the hash so the user is told the truth instead
 *     of being invited to resubmit blindly.
 */

export type ClaimStage =
  | { kind: "idle" }
  | { kind: "simulating" }
  | { kind: "awaiting-signature" }
  | { kind: "submitted"; hash: Hex }
  | { kind: "confirming"; hash: Hex }
  | { kind: "confirmed"; hash: Hex }
  | { kind: "reverted"; hash: Hex }
  | { kind: "timeout"; hash: Hex }
  | { kind: "failed"; message: string; rejected?: boolean; hash?: Hex };

export const CLAIM_FUNCTIONS = ["claimWinnings", "claim"] as const;
export type ClaimFunctionName = (typeof CLAIM_FUNCTIONS)[number];

export interface ClaimParams {
  publicClient: BaseSepoliaClient;
  walletClient: WalletClient;
  account: Address;
  referenceAddress: Address;
  marketId: bigint;
}

export type ClaimStageListener = (stage: ClaimStage) => void;

function functionLooksUnavailable(error: unknown): boolean {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof AbiFunctionNotFoundError)) return true;
    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;
    if (revert && !revert.reason && !revert.data) return true;
    return false;
  }
  return false;
}

interface SimulatedClaim {
  request: unknown;
  functionName: ClaimFunctionName;
}

/**
 * Simulates claimWinnings(marketId), falling back to a claim(marketId)
 * spelling ONLY when the first call looks like "function does not exist"
 * (viem AbiFunctionNotFoundError, or a revert carrying no reason and no data).
 * A real business revert (e.g. "nothing to claim") is never papered over.
 */
export async function simulateClaimWithFallback(
  params: Pick<
    ClaimParams,
    "publicClient" | "account" | "referenceAddress" | "marketId"
  >,
): Promise<SimulatedClaim> {
  const simulate = params.publicClient.simulateContract as unknown as (args: {
    address: Address;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    account: Address;
  }) => Promise<{ request: unknown }>;

  let unavailableError: unknown;

  for (const functionName of CLAIM_FUNCTIONS) {
    try {
      const { request } = await simulate({
        address: params.referenceAddress,
        abi: referenceAbi,
        functionName,
        args: [params.marketId],
        account: params.account,
      });
      return { request, functionName };
    } catch (error) {
      if (!functionLooksUnavailable(error)) throw error;
      unavailableError ??= error;
    }
  }

  throw unavailableError ?? new Error("No claim function found on the contract.");
}

function assertTargetChain(params: ClaimParams): void {
  const publicChainId = params.publicClient.chain?.id;
  if (publicChainId !== CHAIN_ID) {
    throw new WrongChainError(publicChainId);
  }
  const walletChainId = params.walletClient.chain?.id;
  if (walletChainId !== CHAIN_ID) {
    throw new WrongChainError(walletChainId);
  }
}

function assertSameAccount(params: ClaimParams): void {
  const walletAccount = params.walletClient.account?.address;
  if (
    walletAccount &&
    walletAccount.toLowerCase() !== params.account.toLowerCase()
  ) {
    throw new WrongChainError(params.walletClient.chain?.id);
  }
}

export async function executeClaim(
  params: ClaimParams,
  onStage: ClaimStageListener,
): Promise<ClaimStage> {
  let lastHash: Hex | undefined;

  const settle = (stage: ClaimStage): ClaimStage => {
    onStage(stage);
    return stage;
  };

  try {
    assertTargetChain(params);
    assertSameAccount(params);

    onStage({ kind: "simulating" });
    const { request } = await simulateClaimWithFallback(params);

    onStage({ kind: "awaiting-signature" });
    const write = params.walletClient.writeContract as unknown as (
      request: unknown,
    ) => Promise<Hex>;
    const hash = await write(request);
    lastHash = hash;
    onStage({ kind: "submitted", hash });
    onStage({ kind: "confirming", hash });

    const receipt = await params.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      pollingInterval: 2_000,
      timeout: 120_000,
    });

    if (receipt.status !== "success") {
      return settle({ kind: "reverted", hash });
    }
    return settle({ kind: "confirmed", hash });
  } catch (error) {
    if (error instanceof BaseError) {
      if (error.walk((e) => e instanceof UserRejectedRequestError)) {
        return settle({
          kind: "failed",
          message: "You rejected the request in your wallet. Nothing was sent.",
          rejected: true,
        });
      }
    }

    const isTimeout =
      error instanceof WaitForTransactionReceiptTimeoutError ||
      (error instanceof Error &&
        error.name === "WaitForTransactionReceiptTimeoutError");

    if (isTimeout && lastHash) {
      return settle({ kind: "timeout", hash: lastHash });
    }

    const friendly = toUserFacingError(error);
    return settle({
      kind: "failed",
      message: friendly.message,
      hash: lastHash,
    });
  }
}
