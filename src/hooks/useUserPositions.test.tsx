import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Address } from "viem";
import type { MarketData } from "../lib/markets";
import {
  fetchClaimEligibility,
  fetchUserPositionsSnapshot,
} from "../lib/positions";
import { fetchMarketsByIds } from "../lib/markets";
import { useWalletAccount } from "../wallet/useWallet";
import { useReferenceContract } from "./useReferenceContract";
import { useUserPositions } from "./useUserPositions";
import { renderHookWithQuery, TEST_REFERENCE_ADDRESS as REF } from "../test/utils";

vi.mock("../wallet/useWallet", () => ({
  useWalletAccount: vi.fn(),
  useWalletActions: vi.fn(),
  useWalletSigner: vi.fn(),
}));
vi.mock("./useReferenceContract", () => ({
  useReferenceContract: vi.fn(),
}));
vi.mock("../lib/client", () => ({
  getBaseSepoliaClient: vi.fn(() => ({})),
}));
vi.mock("../lib/positions", () => ({
  fetchUserPositionsSnapshot: vi.fn(),
  fetchClaimEligibility: vi.fn(),
}));
vi.mock("../lib/markets", () => ({
  fetchMarketsByIds: vi.fn(),
}));

const USER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const USER_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

function marketFor(id: bigint): MarketData {
  return {
    id,
    question: `Question ${id}`,
    status: 0,
    winningOutcome: 0,
    totalYes: 0n,
    totalNo: 0n,
    endTime: 9_999_999_999n,
    resolutionTime: 0n,
  };
}

describe("useUserPositions - account isolation", () => {
  let currentUser: Address = USER_A;

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = USER_A;

    vi.mocked(useWalletAccount).mockImplementation(() => ({
      address: currentUser,
      isConnected: true,
      chainId: 84532,
      isOnBaseSepolia: true,
    }));
    vi.mocked(useReferenceContract).mockReturnValue({
      address: REF,
      source: "env",
    });

    vi.mocked(fetchUserPositionsSnapshot).mockImplementation(
      async (_client, _ref, user) => {
        const id = user === USER_A ? 1n : 2n;
        return {
          marketIds: [id],
          positions: new Map([
            [
              id,
              {
                yesShares: user === USER_A ? 10n : 20n,
                noShares: 0n,
                claimed: false,
                claimedPayout: 0n,
              },
            ],
          ]),
          costByMarket: new Map(),
          failedMarketIds: [],
          idSource: "contract" as const,
        };
      },
    );
    vi.mocked(fetchMarketsByIds).mockImplementation(async (_client, _ref, ids) =>
      ids.map((id) => marketFor(id)),
    );
    vi.mocked(fetchClaimEligibility).mockResolvedValue(new Map());
  });

  it("keys positions by wallet and evicts the previous account's cache on switch", async () => {
    const { result, rerender, queryClient } = renderHookWithQuery(() =>
      useUserPositions(),
    );

    await waitFor(() => {
      expect(result.current.data?.rows[0]?.marketId).toBe(1n);
    });
    expect(fetchUserPositionsSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      REF,
      USER_A,
      expect.anything(),
    );

    currentUser = USER_B;
    rerender();

    await waitFor(() => {
      expect(result.current.data?.rows[0]?.marketId).toBe(2n);
    });
    expect(fetchUserPositionsSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      REF,
      USER_B,
      expect.anything(),
    );
    expect(
      result.current.data?.rows[0]?.position?.yesShares,
    ).toBe(20n);

    await waitFor(() => {
      const keys = queryClient
        .getQueryCache()
        .findAll({ queryKey: ["user-positions"] });
      expect(keys).toHaveLength(1);
      expect(keys[0]?.queryKey[3]).toBe(USER_B);
    });
  });

  it("does not keep reading when no wallet is connected", async () => {
    vi.mocked(useWalletAccount).mockReturnValue({
      address: undefined,
      isConnected: false,
      chainId: undefined,
      isOnBaseSepolia: false,
    });

    const { result } = renderHookWithQuery(() => useUserPositions());

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });
    expect(fetchUserPositionsSnapshot).not.toHaveBeenCalled();
  });
});
