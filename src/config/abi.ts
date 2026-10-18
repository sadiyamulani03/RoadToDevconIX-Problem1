import { parseAbi, parseAbiItem } from "viem";

/**
 * Reference interface for the Road to Devcon 9 Problem 1 ("The Chai-Stall
 * Terminal") prediction-market contract.
 *
 * IMPORTANT - verification status:
 * The organizers' problem statement (and therefore the canonical deployed
 * address + ABI) is behind the Loops House event login and was not available
 * while this project was built. This ABI therefore documents the interface
 * this app EXPECTS, is deliberately defensive (several known spelling
 * variants of the same view function are probed at runtime), and every read
 * is validated before use. Nothing here fabricates on-chain data: when the
 * configured contract does not answer the expected interface, the UI shows
 * an explicit read error instead of inventing numbers.
 *
 * Consumers should re-verify this ABI against the official problem statement
 * and update it if the organizers' interface differs.
 */
export const referenceAbi = parseAbi([
  // --- market discovery ---------------------------------------------------
  "function getMarketCount() view returns (uint256)",
  "function marketCount() view returns (uint256)",
  "function nextMarketId() view returns (uint256)",
  "function getMarket(uint256 marketId) view returns (uint256 id, string question, uint8 status, uint8 winningOutcome, uint256 totalYes, uint256 totalNo, uint256 endTime, uint256 resolutionTime)",
  "function markets(uint256 marketId) view returns (uint256 id, string question, uint8 status, uint8 winningOutcome, uint256 totalYes, uint256 totalNo, uint256 endTime, uint256 resolutionTime)",

  // --- address-filtered user positions ------------------------------------
  "function getUserMarketIds(address user) view returns (uint256[])",
  "function getUserPosition(uint256 marketId, address user) view returns (uint256 yesShares, uint256 noShares, bool claimed, uint256 claimedPayout)",
  "function hasClaimed(uint256 marketId, address user) view returns (bool)",
  "function isEligibleToClaim(uint256 marketId, address user) view returns (bool eligible, uint256 estimatedPayout)",

  // --- play-token metadata -------------------------------------------------
  "function tokenDecimals() view returns (uint8)",
  "function decimals() view returns (uint8)",

  // --- claim writes ---------------------------------------------------------
  "function claimWinnings(uint256 marketId) returns (uint256)",
  "function claim(uint256 marketId) returns (uint256)",

  // --- events ----------------------------------------------------------------
  "event MarketCreated(uint256 indexed marketId, string question, uint256 endTime)",
  "event PositionPlaced(uint256 indexed marketId, address indexed user, uint8 outcome, uint256 amount, uint256 shares)",
  "event BetPlaced(uint256 indexed marketId, address indexed user, uint8 outcome, uint256 amount)",
  "event MarketResolved(uint256 indexed marketId, uint8 winningOutcome, uint256 resolutionTime)",
  "event Claimed(uint256 indexed marketId, address indexed user, uint256 payout)",
]);

/** The two known participation events used by the fallback scan. */
export const POSITION_PLACED_EVENT = parseAbiItem(
  "event PositionPlaced(uint256 indexed marketId, address indexed user, uint8 outcome, uint256 amount, uint256 shares)",
);

export const BET_PLACED_EVENT = parseAbiItem(
  "event BetPlaced(uint256 indexed marketId, address indexed user, uint8 outcome, uint256 amount)",
);

export const POSITION_EVENTS = [POSITION_PLACED_EVENT, BET_PLACED_EVENT] as const;

/** Reference-interface market phase codes (uint8 status field). */
export const STATUS_CODES = {
  open: 0,
  closed: 1,
  resolved: 2,
  cancelled: 3,
} as const;

/** Reference-interface outcome codes (uint8 fields). */
export const OUTCOME_CODES = {
  none: 0,
  yes: 1,
  no: 2,
} as const;
