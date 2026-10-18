import { describe, expect, it, vi } from "vitest";
import {
  AbiFunctionNotFoundError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  encodeErrorResult,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { referenceAbi } from "../config/abi";
import type { BaseSepoliaClient } from "./client";
import type { ClaimParams, ClaimStage } from "./claimExecution";
import { executeClaim } from "./claimExecution";
import { fakeClient, fakeWalletClient } from "../test/utils";

const REF = "0x1111111111111111111111111111111111111111" as Address;
const ACCOUNT = "0x2222222222222222222222222222222222222222" as Address;
const HASH = `0x${"ab".repeat(32)}` as Hex;

function buildParams(overrides?: {
  publicClient?: BaseSepoliaClient;
  walletClient?: ReturnType<typeof fakeWalletClient>;
}): {
  params: ClaimParams;
  publicClient: BaseSepoliaClient;
  walletClient: ReturnType<typeof fakeWalletClient>;
} {
  const publicClient = overrides?.publicClient ?? fakeClient({});
  const walletClient =
    overrides?.walletClient ??
    fakeWalletClient({ account: { address: ACCOUNT } });
  return {
    params: {
      publicClient,
      walletClient,
      account: ACCOUNT,
      referenceAddress: REF,
      marketId: 7n,
    },
    publicClient,
    walletClient,
  };
}

function collect(): { stages: ClaimStage[]; onStage: (s: ClaimStage) => void } {
  const stages: ClaimStage[] = [];
  return { stages, onStage: (stage) => stages.push(stage) };
}

describe("executeClaim - success requires a successful receipt", () => {
  it("reports confirmed only after the receipt resolves with status success", async () => {
    let resolveReceipt: (value: unknown) => void = () => undefined;
    const receiptPromise = new Promise((resolve) => {
      resolveReceipt = resolve;
    });
    const request = { to: REF, data: "0xdeadbeef" as Hex };
    const simulateContract = vi.fn(async () => ({ request }));
    const waitForTransactionReceipt = vi.fn(() => receiptPromise);
    const writeContract = vi.fn(async () => HASH);

    const { params } = buildParams({
      publicClient: fakeClient({ simulateContract, waitForTransactionReceipt }),
      walletClient: fakeWalletClient({
        account: { address: ACCOUNT },
        writeContract,
      }),
    });
    const { stages, onStage } = collect();

    const run = executeClaim(params, onStage);

    await vi.waitFor(() => {
      expect(stages.at(-1)?.kind).toBe("confirming");
    });
    expect(stages.some((stage) => stage.kind === "confirmed")).toBe(false);
    expect(writeContract).toHaveBeenCalledWith(request);

    resolveReceipt({ status: "success" });
    const final = await run;

    expect(final).toEqual({ kind: "confirmed", hash: HASH });
    expect(stages.map((stage) => stage.kind)).toEqual([
      "simulating",
      "awaiting-signature",
      "submitted",
      "confirming",
      "confirmed",
    ]);
  });

  it("reports a mined-but-reverted transaction as a failure, not a success", async () => {
    const simulateContract = vi.fn(async () => ({ request: { to: REF } }));
    const waitForTransactionReceipt = vi.fn(async () => ({
      status: "reverted",
    }));
    const writeContract = vi.fn(async () => HASH);

    const { params } = buildParams({
      publicClient: fakeClient({ simulateContract, waitForTransactionReceipt }),
      walletClient: fakeWalletClient({
        account: { address: ACCOUNT },
        writeContract,
      }),
    });
    const { stages, onStage } = collect();

    const final = await executeClaim(params, onStage);

    expect(final).toEqual({ kind: "reverted", hash: HASH });
    expect(stages.some((stage) => stage.kind === "confirmed")).toBe(false);
  });

  it("keeps the hash when the receipt wait times out", async () => {
    const simulateContract = vi.fn(async () => ({ request: { to: REF } }));
    const waitForTransactionReceipt = vi.fn(async () => {
      throw new WaitForTransactionReceiptTimeoutError({ hash: HASH });
    });
    const writeContract = vi.fn(async () => HASH);

    const { params } = buildParams({
      publicClient: fakeClient({ simulateContract, waitForTransactionReceipt }),
      walletClient: fakeWalletClient({
        account: { address: ACCOUNT },
        writeContract,
      }),
    });
    const { stages, onStage } = collect();

    const final = await executeClaim(params, onStage);

    expect(final).toEqual({ kind: "timeout", hash: HASH });
    expect(stages.at(-1)?.kind).toBe("timeout");
  });
});

describe("executeClaim - chain and account guards", () => {
  it("refuses to simulate or write when the wallet is on the wrong chain", async () => {
    const simulateContract = vi.fn(async () => ({ request: {} }));
    const writeContract = vi.fn(async () => HASH);

    const { params } = buildParams({
      walletClient: fakeWalletClient({
        chain: { id: 1 },
        account: { address: ACCOUNT },
        writeContract,
      }),
      publicClient: fakeClient({ simulateContract }),
    });
    const { onStage } = collect();

    const final = await executeClaim(params, onStage);

    expect(final.kind).toBe("failed");
    if (final.kind === "failed") {
      expect(final.message).toContain("Base Sepolia");
    }
    expect(simulateContract).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("refuses when the read client is not pinned to Base Sepolia", async () => {
    const simulateContract = vi.fn(async () => ({ request: {} }));
    const wrongChainClient = {
      chain: { id: 1 },
      simulateContract,
      waitForTransactionReceipt: vi.fn(),
    } as unknown as BaseSepoliaClient;

    const { params } = buildParams({ publicClient: wrongChainClient });
    const { stages, onStage } = collect();

    const final = await executeClaim(params, onStage);
    expect(final.kind).toBe("failed");
    expect(simulateContract).not.toHaveBeenCalled();
    expect(stages).toHaveLength(1);
  });

  it("refuses when the wallet account changed mid-flow", async () => {
    const simulateContract = vi.fn(async () => ({ request: {} }));

    const { params } = buildParams({
      walletClient: fakeWalletClient({
        account: { address: "0x4444444444444444444444444444444444444444" },
      }),
      publicClient: fakeClient({ simulateContract }),
    });
    const { onStage } = collect();

    const final = await executeClaim(params, onStage);
    expect(final.kind).toBe("failed");
    expect(simulateContract).not.toHaveBeenCalled();
  });
});

describe("executeClaim - function selection and errors", () => {
  it("falls back from claimWinnings to claim when the first function does not exist", async () => {
    const claimRequest = { to: REF, functionName: "claim" };
    const simulateContract = vi.fn(async (args: { functionName: string }) => {
      if (args.functionName === "claimWinnings") {
        throw new AbiFunctionNotFoundError("claimWinnings");
      }
      return { request: claimRequest };
    });
    const writeContract = vi.fn(async () => HASH);
    const waitForTransactionReceipt = vi.fn(async () => ({
      status: "success",
    }));

    const { params } = buildParams({
      publicClient: fakeClient({ simulateContract, waitForTransactionReceipt }),
      walletClient: fakeWalletClient({
        account: { address: ACCOUNT },
        writeContract,
      }),
    });
    const { onStage } = collect();

    const final = await executeClaim(params, onStage);

    expect(final.kind).toBe("confirmed");
    expect(simulateContract).toHaveBeenCalledTimes(2);
    const names = simulateContract.mock.calls.map(
      ([args]) => (args as { functionName: string }).functionName,
    );
    expect(names).toEqual(["claimWinnings", "claim"]);
    expect(writeContract).toHaveBeenCalledWith(claimRequest);
  });

  it("does not switch functions on a real business revert", async () => {
    const revertData = encodeErrorResult({
      abi: parseAbi(["error Error(string)"]),
      errorName: "Error",
      args: ["nothing to claim"],
    });
    const simulateContract = vi.fn(async () => {
      throw new ContractFunctionRevertedError({
        abi: referenceAbi,
        functionName: "claimWinnings",
        data: revertData,
      });
    });
    const writeContract = vi.fn(async () => HASH);

    const { params } = buildParams({
      publicClient: fakeClient({ simulateContract }),
      walletClient: fakeWalletClient({
        account: { address: ACCOUNT },
        writeContract,
      }),
    });
    const { onStage } = collect();

    const final = await executeClaim(params, onStage);

    expect(final.kind).toBe("failed");
    if (final.kind === "failed") {
      expect(final.message).toContain("nothing to claim");
    }
    expect(simulateContract).toHaveBeenCalledTimes(1);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("surfaces a wallet rejection as cancelled and never writes twice", async () => {
    const simulateContract = vi.fn(async () => ({ request: { to: REF } }));
    const writeContract = vi.fn(async () => {
      throw new UserRejectedRequestError(new Error("user rejected"));
    });

    const { params } = buildParams({
      publicClient: fakeClient({ simulateContract }),
      walletClient: fakeWalletClient({
        account: { address: ACCOUNT },
        writeContract,
      }),
    });
    const { stages, onStage } = collect();

    const final = await executeClaim(params, onStage);

    expect(final).toMatchObject({ kind: "failed", rejected: true });
    expect(stages.some((stage) => stage.kind === "confirmed")).toBe(false);
    expect(writeContract).toHaveBeenCalledTimes(1);
  });
});
