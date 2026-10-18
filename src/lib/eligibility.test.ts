import { describe, expect, it } from "vitest";
import {
  derivePhase,
  gateClaim,
  heldSide,
  heldSideLabel,
  outcomeLabel,
  winningShares,
} from "./eligibility";
import type { MarketData, PositionStruct } from "./markets";

const NOW = 1_000_000n;

function market(overrides: Partial<MarketData> = {}): MarketData {
  return {
    id: 1n,
    question: "Will the chai price rise?",
    status: 0,
    winningOutcome: 0,
    totalYes: 100n,
    totalNo: 40n,
    endTime: NOW + 3600n,
    resolutionTime: 0n,
    ...overrides,
  };
}

function position(overrides: Partial<PositionStruct> = {}): PositionStruct {
  return {
    yesShares: 50n,
    noShares: 0n,
    claimed: false,
    claimedPayout: 0n,
    ...overrides,
  };
}

describe("derivePhase", () => {
  it("keeps a market with a future deadline open", () => {
    expect(derivePhase(market(), NOW)).toBe("open");
  });

  it("treats a passed deadline as closed, never as resolved", () => {
    expect(derivePhase(market({ endTime: NOW - 1n }), NOW)).toBe("closed");
  });

  it("honours the contract's resolved status code", () => {
    expect(
      derivePhase(market({ status: 2, endTime: NOW + 3600n }), NOW),
    ).toBe("resolved");
  });

  it("honours a published winning outcome over an open status", () => {
    expect(derivePhase(market({ winningOutcome: 1 }), NOW)).toBe("resolved");
  });

  it("honours a resolution timestamp", () => {
    expect(derivePhase(market({ resolutionTime: NOW }), NOW)).toBe("resolved");
  });

  it("respects the contract's own closed code before the deadline", () => {
    expect(derivePhase(market({ status: 1 }), NOW)).toBe("closed");
  });

  it("reports cancelled as its own phase", () => {
    expect(derivePhase(market({ status: 3 }), NOW)).toBe("cancelled");
  });

  it("keeps a market open when no deadline is set at all", () => {
    expect(derivePhase(market({ endTime: 0n }), NOW)).toBe("open");
  });
});

describe("position side helpers", () => {
  it("classifies held sides", () => {
    expect(heldSide(position())).toBe("yes");
    expect(heldSide(position({ yesShares: 0n, noShares: 2n }))).toBe("no");
    expect(heldSide(position({ noShares: 2n }))).toBe("both");
    expect(heldSide(position({ yesShares: 0n }))).toBe("none");
  });

  it("labels sides and outcomes", () => {
    expect(heldSideLabel("both")).toBe("Yes + No");
    expect(outcomeLabel(1)).toBe("Yes");
    expect(outcomeLabel(2)).toBe("No");
    expect(outcomeLabel(7)).toBe("Outcome #7");
  });

  it("computes winning-side shares", () => {
    expect(winningShares(1, position())).toBe(50n);
    expect(winningShares(2, position())).toBe(0n);
    expect(winningShares(0, position())).toBe(0n);
  });
});

describe("gateClaim", () => {
  const base = {
    isConnected: true,
    walletChainId: 84532,
    phase: "resolved" as const,
    winningOutcome: 1,
    position: position(),
  };

  it("allows a winner on the right chain to claim", () => {
    expect(gateClaim(base).eligible).toBe(true);
  });

  it("refuses when no wallet is connected", () => {
    expect(gateClaim({ ...base, isConnected: false })).toMatchObject({
      eligible: false,
    });
  });

  it("refuses on the wrong chain", () => {
    const result = gateClaim({ ...base, walletChainId: 1 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Base Sepolia");
  });

  it("refuses before resolution even after the deadline passed", () => {
    const result = gateClaim({ ...base, phase: "closed" });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("resolve");
  });

  it("refuses while the market is still open", () => {
    expect(gateClaim({ ...base, phase: "open" }).eligible).toBe(false);
  });

  it("refuses for cancelled markets", () => {
    expect(gateClaim({ ...base, phase: "cancelled" }).eligible).toBe(false);
  });

  it("refuses when no winning outcome is published", () => {
    expect(gateClaim({ ...base, winningOutcome: 0 }).eligible).toBe(false);
  });

  it("refuses when the position lost", () => {
    const result = gateClaim({
      ...base,
      winningOutcome: 2,
      position: position({ yesShares: 5n }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("did not win");
  });

  it("refuses when the position was already claimed", () => {
    expect(
      gateClaim({ ...base, position: position({ claimed: true }) }).eligible,
    ).toBe(false);
  });

  it("defers to a negative contract eligibility read", () => {
    const result = gateClaim({
      ...base,
      contractEligibility: { eligible: false },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("not eligible");
  });

  it("still allows claiming when the contract eligibility read is positive", () => {
    expect(
      gateClaim({
        ...base,
        contractEligibility: { eligible: true, estimatedPayout: 250n },
      }).eligible,
    ).toBe(true);
  });

  it("allows a hedged (both-sides) position holding the winning side", () => {
    expect(
      gateClaim({ ...base, position: position({ noShares: 3n }) }).eligible,
    ).toBe(true);
  });
});
