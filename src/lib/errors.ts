import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  TimeoutError as ViemTimeoutError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from "viem";

/**
 * Error normalization: converts raw viem / wallet errors into short, safe,
 * user-facing messages. Raw RPC URLs are scrubbed so no endpoint (which could
 * contain an API key on a custom provider) ever reaches the DOM or a log.
 */

export interface UserFacingError {
  title: string;
  message: string;
  detail?: string;
}

export class ContractNotConfiguredError extends Error {
  constructor() {
    super(
      "The reference prediction-market contract is not configured yet.",
    );
    this.name = "ContractNotConfiguredError";
  }
}

export class WrongChainError extends Error {
  constructor(actual?: number) {
    super(
      actual === undefined
        ? "Your wallet is not connected to Base Sepolia."
        : `Your wallet is connected to chain ${actual}; this app writes only to Base Sepolia (84532).`,
    );
    this.name = "WrongChainError";
  }
}

export class ContractInterfaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractInterfaceError";
  }
}

function scrub(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "[rpc endpoint]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

/**
 * Deterministic failures (bad interface, unconfigured contract) are NOT worth
 * retrying - retrying them just burns a mobile device's battery and data.
 */
export function isRetryableReadError(error: unknown): boolean {
  if (error instanceof ContractNotConfiguredError) return false;
  if (error instanceof ContractInterfaceError) return false;
  if (error instanceof WrongChainError) return false;
  return true;
}

export function toUserFacingError(error: unknown): UserFacingError {
  if (error instanceof ContractNotConfiguredError) {
    return {
      title: "Contract not configured",
      message: error.message,
    };
  }
  if (error instanceof WrongChainError) {
    return { title: "Wrong network", message: error.message };
  }
  if (error instanceof ContractInterfaceError) {
    return { title: "Contract read failed", message: error.message };
  }

  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return {
        title: "Transaction cancelled",
        message: "You rejected the request in your wallet. Nothing was sent.",
      };
    }

    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null;
    if (revert) {
      const reason =
        revert.reason ??
        revert.data?.errorName ??
        undefined;
      return {
        title: "Contract rejected the transaction",
        message: reason
          ? `The contract reverted: ${reason}.`
          : "The contract reverted without giving a reason. The position may not be eligible for a claim.",
        detail: scrub(error.shortMessage),
      };
    }

    if (error.walk((e) => e instanceof HttpRequestError)) {
      return {
        title: "Network problem",
        message:
          "Could not reach the Base Sepolia RPC endpoint. Check your connection and try again.",
        detail: scrub(error.shortMessage),
      };
    }

    if (error.walk((e) => e instanceof ViemTimeoutError)) {
      return {
        title: "Network timeout",
        message:
          "The RPC endpoint took too long to respond. Check your connection and try again.",
      };
    }

    return {
      title: "Request failed",
      message: scrub(error.shortMessage) || "An unexpected error occurred.",
      detail: scrub(error.message),
    };
  }

  if (error instanceof Error) {
    const isTimeout =
      error.name === "WaitForTransactionReceiptTimeoutError" ||
      error instanceof WaitForTransactionReceiptTimeoutError;
    if (isTimeout) {
      return {
        title: "Still pending",
        message:
          "The transaction was submitted but has not been mined yet. You can check the hash; nothing needs to be resubmitted.",
      };
    }
    return {
      title: "Something went wrong",
      message: scrub(error.message) || "An unexpected error occurred.",
    };
  }

  return {
    title: "Something went wrong",
    message: "An unexpected error occurred.",
  };
}
