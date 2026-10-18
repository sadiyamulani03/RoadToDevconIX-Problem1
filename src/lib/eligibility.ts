import { CHAIN_ID } from "../config/chain";
import { OUTCOME_CODES, STATUS_CODES } from "../config/abi";
import type { MarketData, PositionStruct } from "./markets";

/**
 * Pure market-phase and claim-eligibility logic. Kept free of React and viem
 * transport concerns so the exact gating rules are unit-testable.
 */

export type MarketPhase = "open" | "closed" | "resolved" | "cancelled";

export type HeldSide = "yes" | "no" | "both" | "none";

/**
 * Derives the market phase from contract data.
 *
 * The contract's own status code wins whenever it distinguishes a state
 * (closed != open, resolved, cancelled). Only when the status code alone
 * cannot distinguish open from closed (e.g. status 0 = "created") does the
 * deadline decide. A passed deadline NEVER upgrades anything to "resolved" -
 * resolution requires contract evidence (status code or a published winning
 * outcome / resolution time).
 */
export function derivePhase(
  market: Pick<
    MarketData,
    "status" | "winningOutcome" | "endTime" | "resolutionTime"
  >,
  nowSeconds: bigint,
): MarketPhase {
  if (market.winningOutcome !== OUTCOME_CODES.none) return "resolved";
  if (market.resolutionTime > 0n) return "resolved";
  if (market.status === STATUS_CODES.resolved) return "resolved";
  if (market.status === STATUS_CODES.cancelled) return "cancelled";
  if (market.status === STATUS_CODES.closed) return "closed";
  if (market.endTime > 0n && nowSeconds >= market.endTime) return "closed";
  return "open";
}

export function isOpenForParticipation(phase: MarketPhase): boolean {
  return phase === "open";
}

export function heldSide(position: PositionStruct): HeldSide {
  const hasYes = position.yesShares > 0n;
  const hasNo = position.noShares > 0n;
  if (hasYes && hasNo) return "both";
  if (hasYes) return "yes";
  if (hasNo) return "no";
  return "none";
}

export function outcomeLabel(outcomeCode: number): string {
  if (outcomeCode === OUTCOME_CODES.yes) return "Yes";
  if (outcomeCode === OUTCOME_CODES.no) return "No";
  return `Outcome #${outcomeCode}`;
}

export function heldSideLabel(side: HeldSide): string {
  switch (side) {
    case "yes":
      return "Yes";
    case "no":
      return "No";
    case "both":
      return "Yes + No";
    default:
      return "None";
  }
}

/** Shares held on the winning side of a resolved market. */
export function winningShares(
  winningOutcome: number,
  position: PositionStruct,
): bigint {
  if (winningOutcome === OUTCOME_CODES.yes) return position.yesShares;
  if (winningOutcome === OUTCOME_CODES.no) return position.noShares;
  return 0n;
}

export interface ClaimGateInput {
  isConnected: boolean;
  walletChainId: number | undefined;
  phase: MarketPhase;
  winningOutcome: number;
  position: PositionStruct;
  contractEligibility?: { eligible: boolean; estimatedPayout?: bigint };
}

export interface ClaimGateResult {
  eligible: boolean;
  reason: string;
}

/**
 * Claim gating. A claim is offered only when:
 *   - a wallet is connected and on Base Sepolia (wrong chain = never writable);
 *   - the market is RESOLVED according to contract data (a passed deadline or
 *     an expired client-side timer is not resolution);
 *   - the wallet holds shares on the winning side and has not claimed yet;
 *   - when the contract itself answered isEligibleToClaim, it agreed.
 */
export function gateClaim(input: ClaimGateInput): ClaimGateResult {
  const {
    isConnected,
    walletChainId,
    phase,
    winningOutcome,
    position,
    contractEligibility,
  } = input;

  if (!isConnected) {
    return { eligible: false, reason: "Connect your wallet to claim." };
  }
  if (walletChainId !== CHAIN_ID) {
    return {
      eligible: false,
      reason: "Switch your wallet to Base Sepolia to claim.",
    };
  }
  if (phase === "cancelled") {
    return {
      eligible: false,
      reason: "This market was cancelled; claims are not available here.",
    };
  }
  if (phase !== "resolved") {
    return {
      eligible: false,
      reason:
        phase === "open"
          ? "Market still open - winnings can be claimed after it resolves."
          : "Market closed, waiting for the contract to resolve it.",
    };
  }
  if (
    winningOutcome !== OUTCOME_CODES.yes &&
    winningOutcome !== OUTCOME_CODES.no
  ) {
    return {
      eligible: false,
      reason: "The contract has not published a winning outcome yet.",
    };
  }
  if (position.claimed) {
    return { eligible: false, reason: "Winnings already claimed." };
  }
  if (winningShares(winningOutcome, position) === 0n) {
    return {
      eligible: false,
      reason: "This position did not win, so there is nothing to claim.",
    };
  }
  if (contractEligibility && !contractEligibility.eligible) {
    return {
      eligible: false,
      reason: "The contract reports this position as not eligible to claim.",
    };
  }
  return { eligible: true, reason: "" };
}
