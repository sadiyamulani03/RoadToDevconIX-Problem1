import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMarkets } from "../hooks/useMarkets";
import { useNowSeconds } from "../hooks/useNowSeconds";
import { useReferenceContract } from "../hooks/useReferenceContract";
import { useTokenDecimals } from "../hooks/useTokenDecimals";
import { ContractInterfaceError } from "../lib/errors";
import type { MarketData } from "../lib/markets";
import { MarketList } from "./MarketList";
import { renderWithQuery, TEST_REFERENCE_ADDRESS as REF } from "../test/utils";

vi.mock("../hooks/useMarkets", () => ({ useMarkets: vi.fn() }));
vi.mock("../hooks/useNowSeconds", () => ({ useNowSeconds: vi.fn() }));
vi.mock("../hooks/useReferenceContract", () => ({
  useReferenceContract: vi.fn(),
}));
vi.mock("../hooks/useTokenDecimals", () => ({
  useTokenDecimals: vi.fn(),
}));

const NOW = 1_000_000n;

function market(overrides: Partial<MarketData>): MarketData {
  return {
    id: 1n,
    question: "Will chai cost more next week?",
    status: 0,
    winningOutcome: 0,
    totalYes: 100n,
    totalNo: 50n,
    endTime: NOW + 3_600n,
    resolutionTime: 0n,
    ...overrides,
  };
}

function configureList(
  query: Record<string, unknown>,
  contract: Record<string, unknown> = { source: "env", address: REF },
): void {
  vi.mocked(useMarkets).mockReturnValue({
    isConfigured: true,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    data: undefined,
    dataUpdatedAt: Date.now(),
    refetch: vi.fn(),
    ...query,
  } as unknown as ReturnType<typeof useMarkets>);
  vi.mocked(useNowSeconds).mockReturnValue(NOW);
  vi.mocked(useReferenceContract).mockReturnValue(
    contract as unknown as ReturnType<typeof useReferenceContract>,
  );
  vi.mocked(useTokenDecimals).mockReturnValue({
    data: { decimals: 18, source: "contract" },
  } as unknown as ReturnType<typeof useTokenDecimals>);
}

describe("MarketList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows only markets that are open for participation", () => {
    configureList({
      data: {
        markets: [
          market({ id: 1n, question: "Open: chai price up?" }),
          market({
            id: 2n,
            question: "Resolved: lecture on time?",
            status: 2,
            winningOutcome: 1,
            resolutionTime: NOW - 100n,
          }),
          market({
            id: 3n,
            question: "Expired: deadline passed?",
            endTime: NOW - 5n,
          }),
        ],
        latestId: 3n,
        truncated: false,
      },
    });

    renderWithQuery(<MarketList />);

    expect(screen.getByText("Open: chai price up?")).toBeInTheDocument();
    expect(screen.queryByText("Resolved: lecture on time?")).not.toBeInTheDocument();
    expect(screen.queryByText("Expired: deadline passed?")).not.toBeInTheDocument();
    expect(screen.getByText("1 open market")).toBeInTheDocument();
    expect(
      screen.getByText(/2 closed or resolved markets are hidden/i),
    ).toBeInTheDocument();
  });

  it("surfaces a failed read with a visible retry action", async () => {
    const refetch = vi.fn();
    configureList({
      isError: true,
      error: new ContractInterfaceError(
        "The configured contract does not answer the reference market interface.",
      ),
      refetch,
    });

    renderWithQuery(<MarketList />);

    expect(screen.getByText(/Contract read failed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not answer the reference market interface/i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps cached markets visible when a refresh fails, with a warning", () => {
    configureList({
      isError: true,
      error: new ContractInterfaceError("boom"),
      data: {
        markets: [market({ id: 9n, question: "Cached open market" })],
        latestId: 9n,
        truncated: false,
      },
    });

    renderWithQuery(<MarketList />);

    expect(screen.getByText("Cached open market")).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it("asks for configuration instead of inventing data when no contract is set", () => {
    configureList({}, { source: "none" });
    vi.mocked(useMarkets).mockReturnValue({
      isConfigured: false,
      isPending: true,
      isError: false,
      isFetching: false,
      error: null,
      data: undefined,
      dataUpdatedAt: 0,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useMarkets>);

    renderWithQuery(<MarketList />);

    expect(
      screen.getByText(/Point the terminal at the chai-stall contract/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/will not substitute mock data/i),
    ).toBeInTheDocument();
  });

  it("shows an empty state when the contract has no open markets", () => {
    configureList({
      data: { markets: [], latestId: 0n, truncated: false },
    });

    renderWithQuery(<MarketList />);
    expect(screen.getByText(/No markets are open right now/i)).toBeInTheDocument();
  });
});
