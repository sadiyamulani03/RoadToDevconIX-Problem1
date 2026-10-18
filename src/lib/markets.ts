import type { Abi, Address } from "viem";
import { referenceAbi } from "../config/abi";
import { MARKET_READ_CHUNK, MAX_MARKETS } from "../config/chain";
import { ContractInterfaceError } from "./errors";
import type { BaseSepoliaClient } from "./client";

/**
 * Market reads. Every call targets the configured reference contract with the
 * documented reference ABI; responses are validated (shape-coerced) before
 * they reach the UI. A contract that cannot answer the reference interface
 * produces an explicit ContractInterfaceError - never fabricated markets.
 */

export interface MarketData {
  id: bigint;
  question: string;
  status: number;
  winningOutcome: number;
  totalYes: bigint;
  totalNo: bigint;
  endTime: bigint;
  resolutionTime: bigint;
}

export interface MarketFeed {
  markets: MarketData[];
  /** Highest market id observed, for display/pagination context. */
  latestId: bigint;
  /** True when the feed was capped at MAX_MARKETS. */
  truncated: boolean;
}

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

type LooseReadContract = (call: ContractCall) => Promise<unknown>;
type LooseMulticall = (args: {
  contracts: readonly ContractCall[];
  allowFailure: true;
}) => Promise<
  Array<{ status: "success"; result: unknown } | { status: "failure"; error: Error }>
>;

export async function readOne(
  client: BaseSepoliaClient,
  call: ContractCall,
): Promise<unknown> {
  const read = client.readContract as unknown as LooseReadContract;
  return read(call);
}

/**
 * Reads many calls, preferring a single multicall round trip and falling back
 * to sequential reads when multicall is unavailable or fails. The returned
 * array is aligned with `calls`; failed entries are `undefined`.
 */
export async function readManyAllowFailure(
  client: BaseSepoliaClient,
  calls: readonly ContractCall[],
): Promise<Array<unknown | undefined>> {
  if (calls.length === 0) return [];

  const multicall = client.multicall as unknown as LooseMulticall | undefined;
  if (typeof multicall === "function") {
    try {
      const results = await multicall({
        contracts: calls,
        allowFailure: true,
      });
      return results.map((result) =>
        result.status === "success" ? result.result : undefined,
      );
    } catch {
      /* fall through to sequential reads */
    }
  }

  const out: Array<unknown | undefined> = [];
  for (const call of calls) {
    try {
      out.push(await readOne(client, call));
    } catch {
      out.push(undefined);
    }
  }
  return out;
}

export function coerceBigInt(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? BigInt(value) : undefined;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
}


function toIntCode(value: unknown): number | undefined {
  const big = coerceBigInt(value);
  if (big === undefined) return undefined;
  if (big > 255n) return undefined;
  // Bounded enum code (status/outcome, 0-255), never a token amount.
  return Number(big);
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const big = coerceBigInt(value);
  if (big === undefined) return undefined;
  return big !== 0n;
}

function fieldOf(
  raw: unknown,
  keys: readonly string[],
  index: number,
): unknown {
  if (Array.isArray(raw)) return raw[index];
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    for (const key of keys) {
      if (key in record) return record[key];
    }
  }
  return undefined;
}

/**
 * Validates a decoded market struct (object with named fields or positional
 * array) and converts it to a MarketData. Returns undefined for anything that
 * does not look like a real market.
 */
export function coerceMarket(
  raw: unknown,
  fallbackId: bigint,
): MarketData | undefined {
  if (raw === undefined || raw === null) return undefined;

  const question = fieldOf(raw, ["question"], 1);
  const status = toIntCode(fieldOf(raw, ["status"], 2));
  const winningOutcome = toIntCode(fieldOf(raw, ["winningOutcome"], 3));
  if (typeof question !== "string" || question.length === 0) return undefined;
  if (status === undefined || winningOutcome === undefined) return undefined;

  return {
    id: coerceBigInt(fieldOf(raw, ["id"], 0)) ?? fallbackId,
    question,
    status,
    winningOutcome,
    totalYes: coerceBigInt(fieldOf(raw, ["totalYes"], 4)) ?? 0n,
    totalNo: coerceBigInt(fieldOf(raw, ["totalNo"], 5)) ?? 0n,
    endTime: coerceBigInt(fieldOf(raw, ["endTime"], 6)) ?? 0n,
    resolutionTime: coerceBigInt(fieldOf(raw, ["resolutionTime"], 7)) ?? 0n,
  };
}

export interface PositionStruct {
  yesShares: bigint;
  noShares: bigint;
  claimed: boolean;
  claimedPayout: bigint;
}

export function coercePosition(
  raw: unknown,
  marketId: bigint,
): PositionStruct | undefined {
  if (raw === undefined || raw === null) return undefined;
  void marketId;
  const yesShares = coerceBigInt(fieldOf(raw, ["yesShares"], 0));
  const noShares = coerceBigInt(fieldOf(raw, ["noShares"], 1));
  const claimed = toBoolean(fieldOf(raw, ["claimed"], 2));
  if (yesShares === undefined || noShares === undefined || claimed === undefined) {
    return undefined;
  }
  return {
    yesShares,
    noShares,
    claimed,
    claimedPayout:
      coerceBigInt(fieldOf(raw, ["claimedPayout"], 3)) ?? 0n,
  };
}

export function coerceBoolean(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "boolean") return raw;
  const direct = toBoolean(raw);
  if (direct !== undefined) return direct;
  const nested = fieldOf(raw, ["0", "eligible"], 0);
  return toBoolean(nested);
}

async function fetchMarketCount(
  client: BaseSepoliaClient,
  address: Address,
): Promise<bigint> {
  const candidates = ["getMarketCount", "marketCount", "nextMarketId"] as const;
  for (const functionName of candidates) {
    try {
      const value = coerceBigInt(
        await readOne(client, {
          address,
          abi: referenceAbi,
          functionName,
          args: [],
        }),
      );
      if (value !== undefined) return value;
    } catch {
      /* probe the next spelling */
    }
  }
  throw new ContractInterfaceError(
    "Could not read the market count from the configured contract. " +
      "Expected a getMarketCount() or marketCount() view function.",
  );
}

interface ReaderPlan {
  functionName: "getMarket" | "markets";
  base: 0n | 1n;
  count: bigint;
}

/**
 * Discovers which market-reader spelling and id base (0- or 1-based) the
 * deployed contract uses, by probing the boundary id. Solidity mapping
 * getters answer missing ids with an empty struct, so "valid decode" is the
 * probe: an empty question is treated as "id does not exist".
 */
async function discoverReader(
  client: BaseSepoliaClient,
  address: Address,
  count: bigint,
): Promise<ReaderPlan> {
  if (count === 0n) return { functionName: "getMarket", base: 0n, count: 0n };

  let lastError: unknown;
  for (const functionName of ["getMarket", "markets"] as const) {
    for (const candidate of [count, count > 0n ? count - 1n : 0n]) {
      try {
        const raw = await readOne(client, {
          address,
          abi: referenceAbi,
          functionName,
          args: [candidate],
        });
        const market = coerceMarket(raw, candidate);
        if (market) {
          const base: 0n | 1n = candidate === count ? 1n : 0n;
          return { functionName, base, count };
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw new ContractInterfaceError(
    "The configured contract does not answer the reference market interface " +
      "(tried getMarket(id) and markets(id)). " +
      "Check that VITE_REFERENCE_CONTRACT_ADDRESS points at the official " +
      "Road to Devcon 9 prediction-market contract on Base Sepolia." +
      (lastError instanceof Error ? ` Last error: ${lastError.name}.` : ""),
  );
}

function clampCount(count: bigint): bigint {
  const cap = BigInt(MAX_MARKETS);
  return count > cap ? cap : count;
}

/** Fetches the most recent markets, newest id first. */
export async function fetchMarkets(
  client: BaseSepoliaClient,
  address: Address,
): Promise<MarketFeed> {
  const count = await fetchMarketCount(client, address);
  if (count === 0n) {
    return { markets: [], latestId: 0n, truncated: false };
  }

  const plan = await discoverReader(client, address, count);
  const capped = clampCount(plan.count);
  const truncated = capped < plan.count;

  const first = plan.base === 1n ? plan.count - capped + 1n : plan.count - capped;
  const ids: bigint[] = [];
  for (let i = 0n; i < capped; i++) ids.push(first + i);

  const markets = await fetchMarketsByIds(client, address, ids);
  const latestId = ids.length > 0 ? ids[ids.length - 1]! : 0n;
  return { markets, latestId, truncated };
}

export async function fetchMarketsByIds(
  client: BaseSepoliaClient,
  address: Address,
  ids: readonly bigint[],
  functionNames: readonly ("getMarket" | "markets")[] = ["getMarket", "markets"],
): Promise<MarketData[]> {
  if (ids.length === 0) return [];
  const out: MarketData[] = [];

  for (let start = 0; start < ids.length; start += MARKET_READ_CHUNK) {
    const chunk = ids.slice(start, start + MARKET_READ_CHUNK);
    let chunkResults: Array<unknown | undefined> = [];

    for (const functionName of functionNames) {
      const calls: ContractCall[] = chunk.map((id) => ({
        address,
        abi: referenceAbi,
        functionName,
        args: [id],
      }));
      const results = await readManyAllowFailure(client, calls);
      if (results.some((r) => r !== undefined)) {
        chunkResults = results;
        break;
      }
    }

    chunk.forEach((id, index) => {
      const market = coerceMarket(chunkResults[index], id);
      if (market) out.push(market);
    });
  }

  return out;
}
