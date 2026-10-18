import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useClaim } from "../hooks/useClaim";
import { useNowSeconds } from "../hooks/useNowSeconds";
import { useReferenceContract } from "../hooks/useReferenceContract";
import { useTokenDecimals } from "../hooks/useTokenDecimals";
import { useUserPositions } from "../hooks/useUserPositions";
import { ContractInterfaceError } from "../lib/errors";
import type { MarketData, PositionStruct } from "../lib/markets";
import { useWalletAccount, useWalletActions } from "../wallet/useWallet";
import { PositionsView } from "./PositionsView";
import { renderWithQuery, TEST_REFERENCE_ADDRESS as REF } from "../test/utils";

vi.mock("../hooks/useUserPositions", () => ({ useUserPositions: vi.fn() }));
vi.mock("../hooks/useNowSeconds", () => ({ useNowSeconds: vi.fn() }));
vi.mock("../hooks/useReferenceContract", () => ({
  useReferenceContract: vi.fn(),
}));
vi.mock("../hooks/useTokenDecimals", () => ({
  useTokenDecimals: vi.fn(),
}));
vi.mock("../hooks/useClaim", () => ({ useClaim: vi.fn() }));
vi.mock("../wallet/useWallet", () => ({
  useWalletAccount: vi.fn(),
  useWalletActions: vi.fn(),
  useWalletSigner: vi.fn(),
}));

const NOW = 1_000_000n;
const USER = "0x2222222222222222222222222222222222222222";

const RESOLVED_WIN: MarketData = {
  id: 1n,
  question: "Did the chai stall sell out?",
  status: 2,
  winningOutcome: 1,
  totalYes: 200n,
  totalNo: 80n,
  endTime: NOW - 7_200n,
  resolutionTime: NOW - 3_600n,
};

const OPEN_MARKET: MarketData = {
  id: 2n,
  question: "Will it rain at the stall?",
  status: 0,
  winningOutcome: 0,
  totalYes: 10n,
  totalNo: 20n,
  endTime: NOW + 7_200n,
  resolutionTime: 0n,
};

function position(overrides: Partial<PositionStruct> = {}): PositionStruct {
  return {
    yesShares: 100n,
    noShares: 0n,
    claimed: false,
    claimedPayout: 0n,
    ...overrides,
  };
}

let switchMock = vi.fn();
let connectMock = vi.fn();

function configureWallet(options?: {
  isConnected?: boolean;
  chainId?: number;
}): void {
  const isConnected = options?.isConnected ?? true;
  const chainId = options?.chainId ?? 84532;
  vi.mocked(useWalletAccount).mockReturnValue({
    address: isConnected ? (USER as `0x${string}`) : undefined,
    isConnected,
    chainId,
    isOnBaseSepolia: chainId === 84532,
  });
  switchMock = vi.fn();
  connectMock = vi.fn();
  vi.mocked(useWalletActions).mockReturnValue({
    connect: connectMock,
    disconnect: vi.fn(),
    switchToBaseSepolia: switchMock,
    isConnecting: false,
    isSwitching: false,
  });
}

function configurePositions(
  view: {
    rows?: Array<{
      marketId: bigint;
      market?: MarketData;
      position?: PositionStruct;
      cost?: { cost: bigint; yesCost: bigint; noCost: bigint };
    }>;
    eligibility?: Map<bigint, { eligible: boolean; estimatedPayout?: bigint }>;
    isError?: boolean;
    error?: unknown;
    refetch?: () => void;
  } = {},
): void {
  vi.mocked(useUserPositions).mockReturnValue({
    isConfigured: true,
    isConnected: true,
    isPending: false,
    isError: view.isError ?? false,
    isFetching: false,
    error: view.error ?? null,
    refetch: view.refetch ?? vi.fn(),
    referenceAddress: REF,
    user: USER,
    data:
      view.isError === true && view.rows === undefined
        ? undefined
        : {
            rows: view.rows ?? [],
            failedMarketIds: [],
            idSource: "contract",
            eligibility: view.eligibility ?? new Map(),
          },
  } as unknown as ReturnType<typeof useUserPositions>);
}

describe("PositionsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNowSeconds).mockReturnValue(NOW);
    vi.mocked(useReferenceContract).mockReturnValue({
      source: "env",
      address: REF,
    });
    vi.mocked(useTokenDecimals).mockReturnValue({
      data: { decimals: 0, source: "contract" },
    } as unknown as ReturnType<typeof useTokenDecimals>);
    vi.mocked(useClaim).mockReturnValue({
      stage: { kind: "idle" },
      claim: vi.fn(),
      isBusy: false,
    });
    configureWallet();
  });

  it("offers no claim while a market is still open", () => {
    configurePositions({
      rows: [
        {
          marketId: 2n,
          market: OPEN_MARKET,
          position: position({ yesShares: 5n }),
        },
      ],
    });

    renderWithQuery(<PositionsView onBrowseMarkets={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: /claim winnings/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Will it rain at the stall?")).toBeInTheDocument();
  });

  it("disables claiming on the wrong chain and offers a switch", async () => {
    configureWallet({ chainId: 1 });
    configurePositions({
      rows: [
        {
          marketId: 1n,
          market: RESOLVED_WIN,
          position: position(),
        },
      ],
    });

    renderWithQuery(<PositionsView onBrowseMarkets={vi.fn()} />);

    const claimButton = screen.getByRole("button", { name: /claim winnings/i });
    expect(claimButton).toBeDisabled();
    expect(
      screen.getByText(/Switch your wallet to Base Sepolia to claim\./i),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /switch to base sepolia/i }),
    );
    expect(switchMock).toHaveBeenCalledTimes(1);
  });

  it("disables claiming for a losing position on a resolved market", () => {
    configurePositions({
      rows: [
        {
          marketId: 1n,
          market: { ...RESOLVED_WIN, winningOutcome: 2 },
          position: position({ yesShares: 5n }),
        },
      ],
    });

    renderWithQuery(<PositionsView onBrowseMarkets={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /claim winnings/i }),
    ).toBeDisabled();
    expect(screen.getByText(/did not win/i)).toBeInTheDocument();
  });

  it("shows claimed positions with the payout and no claim action", () => {
    configurePositions({
      rows: [
        {
          marketId: 1n,
          market: RESOLVED_WIN,
          position: position({ claimed: true, claimedPayout: 250n }),
          cost: { cost: 100n, yesCost: 100n, noCost: 0n },
        },
      ],
    });

    renderWithQuery(<PositionsView onBrowseMarkets={vi.fn()} />);

    expect(screen.getByText("Claimed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /claim winnings/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Payout received")).toBeInTheDocument();
    expect(screen.getByText("+150")).toBeInTheDocument();
  });

  it("surfaces a failed positions read with retry", async () => {
    const refetch = vi.fn();
    configurePositions({
      isError: true,
      error: new ContractInterfaceError("Could not load your positions."),
      refetch,
    });

    renderWithQuery(<PositionsView onBrowseMarkets={vi.fn()} />);

    expect(screen.getByText(/Contract read failed/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("prompts to connect a wallet before showing positions", async () => {
    configureWallet({ isConnected: false });
    vi.mocked(useUserPositions).mockReturnValue({
      isConfigured: true,
      isConnected: false,
      isPending: true,
      isError: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      referenceAddress: REF,
      user: undefined,
      data: undefined,
    } as unknown as ReturnType<typeof useUserPositions>);

    renderWithQuery(<PositionsView onBrowseMarkets={vi.fn()} />);

    expect(
      screen.getByText(/Connect a wallet to see your positions/i),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /connect wallet/i }),
    );
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
