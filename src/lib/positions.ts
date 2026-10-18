import { decodeEventLog, type Address, type Hex } from "viem";
import { POSITION_EVENTS, referenceAbi } from "../config/abi";
import { LOG_CHUNK_SIZE, MARKET_READ_CHUNK, MAX_LOG_LOOKBACK_BLOCKS } from "../config/chain";
import { ContractInterfaceError } from "./errors";
import type { BaseSepoliaClient } from "./client";
import {
  coerceBigInt,
  coercePosition,
  readManyAllowFailure,
  type ContractCall,
  type PositionStruct,
} from "./markets";

/**
 * Address-filtered position reads.
 *
 * Primary path: getUserMarketIds(address) returns exactly the markets the
 * wallet participated in; only those ids are read afterwards. There is no
 * loop over all markets to discover a user's positions.
 *
 * Fallback path (used only when the contract does not expose
 * getUserMarketIds): a single eth_getLogs scan filtered by this contract and
 * by the position-event topic signatures, executed in bounded block chunks.
 * The connected address is matched against the decoded (indexed) `user`
 * argument, so the filter happens server-side or at worst in client memory -
 * never by fetching unrelated markets one by one.
 */

export interface EventCostBasis {
  cost: bigint;
  yesCost: bigint;
  noCost: bigint;
}

export interface UserPositionsSnapshot {
  marketIds: bigint[];
  positions: Map<bigint, PositionStruct>;
  costByMarket: Map<bigint, EventCostBasis>;
  /** ids the contract acknowledged but whose struct failed to decode. */
  failedMarketIds: bigint[];
  idSource: "contract" | "events";
  /** Set when event enrichment failed but contract-based positions loaded. */
  eventsWarning?: string;
}

export interface ClaimEligibility {
  eligible: boolean;
  estimatedPayout?: bigint;
}

interface DecodedPositionEvent {
  marketId: bigint;
  user: Address;
  outcome?: number;
  amount?: bigint;
  shares?: bigint;
}

function tryDecodeLog(log: {
  topics: readonly Hex[];
  data: Hex;
}): DecodedPositionEvent | undefined {
  const topics = log.topics as unknown as [Hex, ...Hex[]];
  try {
    const decoded = decodeEventLog({
      abi: referenceAbi,
      topics,
      data: log.data,
    });
    if (decoded.eventName === "PositionPlaced") {
      const { marketId, user, outcome, amount, shares } = decoded.args;
      return { marketId, user, outcome, amount, shares };
    }
    if (decoded.eventName === "BetPlaced") {
      const { marketId, user, outcome, amount } = decoded.args;
      return { marketId, user, outcome, amount };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

interface LooseLog {
  topics: readonly Hex[];
  data: Hex;
}

type LooseGetLogs = (args: {
  address: Address;
  events: readonly unknown[];
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
}) => Promise<readonly LooseLog[]>;

/**
 * eth_getLogs capped to this contract and to the known position-event
 * signatures, additionally filtered server-side by the `user` argument where
 * the RPC provider supports argument filters. The decoded address is
 * re-checked client-side as well, so no unrelated wallet's events are ever
 * attributed to the connected account.
 */
function getLogsForPositionEvents(
  client: BaseSepoliaClient,
  params: {
    address: Address;
    fromBlock: bigint;
    toBlock: bigint;
    user: Address;
  },
): Promise<readonly LooseLog[]> {
  const getLogs = client.getLogs as unknown as LooseGetLogs;
  return getLogs({
    address: params.address,
    events: POSITION_EVENTS,
    args: { user: params.user },
    fromBlock: params.fromBlock,
    toBlock: params.toBlock,
  });
}

export interface PositionEventScan {
  ids: bigint[];
  costByMarket: Map<bigint, EventCostBasis>;
  /** Logs seen for this contract's known position events (for diagnostics). */
  scannedLogCount: number;
}

export async function scanPositionEvents(
  client: BaseSepoliaClient,
  referenceAddress: Address,
  user: Address,
  options?: { deploymentBlock?: bigint },
): Promise<PositionEventScan> {
  const latest = await client.getBlockNumber();
  const lookbackFrom =
    latest > MAX_LOG_LOOKBACK_BLOCKS ? latest - MAX_LOG_LOOKBACK_BLOCKS : 0n;
  const deploymentBlock = options?.deploymentBlock;
  const from =
    deploymentBlock !== undefined &&
    deploymentBlock <= latest &&
    deploymentBlock > lookbackFrom
      ? deploymentBlock
      : lookbackFrom;

  const target = user.toLowerCase();
  const ids = new Set<bigint>();
  const costByMarket = new Map<bigint, EventCostBasis>();
  let scannedLogCount = 0;

  for (let start = from; start <= latest; start += LOG_CHUNK_SIZE) {
    const end =
      start + LOG_CHUNK_SIZE - 1n > latest ? latest : start + LOG_CHUNK_SIZE - 1n;
    const logs = await getLogsForPositionEvents(client, {
      address: referenceAddress,
      fromBlock: start,
      toBlock: end,
      user,
    });

    for (const log of logs) {
      scannedLogCount++;
      const decoded = tryDecodeLog(log);
      if (!decoded) continue;
      if (decoded.user.toLowerCase() !== target) continue;

      ids.add(decoded.marketId);
      if (decoded.amount !== undefined) {
        const existing = costByMarket.get(decoded.marketId) ?? {
          cost: 0n,
          yesCost: 0n,
          noCost: 0n,
        };
        existing.cost += decoded.amount;
        if (decoded.outcome === 1) existing.yesCost += decoded.amount;
        if (decoded.outcome === 2) existing.noCost += decoded.amount;
        costByMarket.set(decoded.marketId, existing);
      }
    }
  }

  const sortedIds = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { ids: sortedIds, costByMarket, scannedLogCount };
}

async function fetchMarketIdsFromContract(
  client: BaseSepoliaClient,
  referenceAddress: Address,
  user: Address,
): Promise<bigint[]> {
  const read = client.readContract as unknown as (call: ContractCall) => Promise<unknown>;
  const raw = await read({
    address: referenceAddress,
    abi: referenceAbi,
    functionName: "getUserMarketIds",
    args: [user],
  });
  if (!Array.isArray(raw)) {
    throw new ContractInterfaceError(
      "getUserMarketIds(address) did not return an array of market ids.",
    );
  }
  const ids: bigint[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = coerceBigInt(item);
    if (id === undefined) continue;
    const key = id.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ids;
}

async function fetchPositionStructs(
  client: BaseSepoliaClient,
  referenceAddress: Address,
  user: Address,
  marketIds: readonly bigint[],
): Promise<{
  positions: Map<bigint, PositionStruct>;
  failedMarketIds: bigint[];
}> {
  const positions = new Map<bigint, PositionStruct>();
  const failedMarketIds: bigint[] = [];

  for (let start = 0; start < marketIds.length; start += MARKET_READ_CHUNK) {
    const chunk = marketIds.slice(start, start + MARKET_READ_CHUNK);
    const calls: ContractCall[] = chunk.map((id) => ({
      address: referenceAddress,
      abi: referenceAbi,
      functionName: "getUserPosition",
      args: [id, user],
    }));
    const results = await readManyAllowFailure(client, calls);
    chunk.forEach((id, index) => {
      const position = coercePosition(results[index], id);
      if (position) positions.set(id, position);
      else failedMarketIds.push(id);
    });
  }

  return { positions, failedMarketIds };
}

export async function fetchUserPositionsSnapshot(
  client: BaseSepoliaClient,
  referenceAddress: Address,
  user: Address,
  options?: { deploymentBlock?: bigint },
): Promise<UserPositionsSnapshot> {
  const [idsOutcome, eventsOutcome] = await Promise.allSettled([
    fetchMarketIdsFromContract(client, referenceAddress, user),
    scanPositionEvents(client, referenceAddress, user, options),
  ]);

  const events =
    eventsOutcome.status === "fulfilled" ? eventsOutcome.value : undefined;

  let marketIds: bigint[];
  let idSource: "contract" | "events";
  let eventsWarning: string | undefined;

  if (idsOutcome.status === "fulfilled") {
    marketIds = idsOutcome.value;
    idSource = "contract";
    if (eventsOutcome.status === "rejected") {
      eventsWarning =
        "Entry-cost enrichment from logs is unavailable right now; " +
        "position quantities are shown, but profit/loss is withheld.";
    }
  } else if (events) {
    marketIds = events.ids;
    idSource = "events";
  } else {
    const reason =
      eventsOutcome.status === "rejected" && eventsOutcome.reason instanceof Error
        ? ` (${eventsOutcome.reason.name})`
        : "";
    throw new ContractInterfaceError(
      "Could not load your positions. The contract did not answer " +
        "getUserMarketIds(address) and the address-filtered event scan also " +
        `failed${reason}. Check the connection and try again.`,
    );
  }

  const { positions, failedMarketIds } = await fetchPositionStructs(
    client,
    referenceAddress,
    user,
    marketIds,
  );

  return {
    marketIds,
    positions,
    costByMarket: events?.costByMarket ?? new Map(),
    failedMarketIds,
    idSource,
    eventsWarning,
  };
}

export async function fetchClaimEligibility(
  client: BaseSepoliaClient,
  referenceAddress: Address,
  user: Address,
  marketIds: readonly bigint[],
): Promise<Map<bigint, ClaimEligibility>> {
  const out = new Map<bigint, ClaimEligibility>();
  if (marketIds.length === 0) return out;

  for (let start = 0; start < marketIds.length; start += MARKET_READ_CHUNK) {
    const chunk = marketIds.slice(start, start + MARKET_READ_CHUNK);
    const calls: ContractCall[] = chunk.map((id) => ({
      address: referenceAddress,
      abi: referenceAbi,
      functionName: "isEligibleToClaim",
      args: [id, user],
    }));
    const results = await readManyAllowFailure(client, calls);
    chunk.forEach((id, index) => {
      const raw = results[index];
      if (raw === undefined || raw === null) return;
      const eligibleRaw = Array.isArray(raw)
        ? raw[0]
        : (raw as Record<string, unknown>)["eligible"] ??
          (raw as Record<string, unknown>)["0"];
      const payoutRaw = Array.isArray(raw)
        ? raw[1]
        : (raw as Record<string, unknown>)["estimatedPayout"] ??
          (raw as Record<string, unknown>)["1"];
      const eligibleBool =
        typeof eligibleRaw === "boolean"
          ? eligibleRaw
          : coerceBigInt(eligibleRaw) !== undefined
            ? coerceBigInt(eligibleRaw) !== 0n
            : undefined;
      if (eligibleBool === undefined) return;
      const estimatedPayout = coerceBigInt(payoutRaw);
      out.set(
        id,
        estimatedPayout === undefined
          ? { eligible: eligibleBool }
          : { eligible: eligibleBool, estimatedPayout },
      );
    });
  }

  return out;
}
