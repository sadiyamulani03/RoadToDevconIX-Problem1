import { describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
} from "viem";
import { BET_PLACED_EVENT, POSITION_PLACED_EVENT } from "../config/abi";
import { ContractInterfaceError } from "./errors";
import {
  fetchClaimEligibility,
  fetchUserPositionsSnapshot,
} from "./positions";
import { fakeClient, TEST_REFERENCE_ADDRESS as REF } from "../test/utils";

const USER = "0x2222222222222222222222222222222222222222" as Address;
const OTHER_USER = "0x3333333333333333333333333333333333333333" as Address;

interface ReadCall {
  address: string;
  functionName: string;
  args?: readonly unknown[];
}

interface RawLog {
  topics: readonly Hex[];
  data: Hex;
}

interface LogQuery {
  address: string;
  args?: { user?: string };
  events?: readonly unknown[];
  fromBlock: bigint;
  toBlock: bigint;
}

function placedLog(
  marketId: bigint,
  user: Address,
  outcome: number,
  amount: bigint,
  shares: bigint,
): RawLog {
  const topics = encodeEventTopics({
    abi: [POSITION_PLACED_EVENT],
    args: { marketId, user },
  }) as unknown as readonly Hex[];
  const data = encodeAbiParameters(
    [{ type: "uint8" }, { type: "uint256" }, { type: "uint256" }],
    [outcome, amount, shares],
  );
  return { topics, data };
}

function betLog(
  marketId: bigint,
  user: Address,
  outcome: number,
  amount: bigint,
): RawLog {
  const topics = encodeEventTopics({
    abi: [BET_PLACED_EVENT],
    args: { marketId, user },
  }) as unknown as readonly Hex[];
  const data = encodeAbiParameters(
    [{ type: "uint8" }, { type: "uint256" }],
    [outcome, amount],
  );
  return { topics, data };
}

describe("fetchUserPositionsSnapshot - primary path", () => {
  it("discovers positions via getUserMarketIds(address) and reads only those ids", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getUserMarketIds") return [3n, 1n, 3n];
      if (call.functionName === "getUserPosition") {
        const id = call.args?.[0] as bigint;
        return [id * 10n, 0n, false, 0n];
      }
      throw new Error(`unexpected ${call.functionName}`);
    });
    const getLogs = vi.fn(async (_query: LogQuery): Promise<readonly RawLog[]> => []);

    const snapshot = await fetchUserPositionsSnapshot(
      fakeClient({ readContract, getLogs, getBlockNumber: async () => 99n }),
      REF,
      USER,
    );

    expect(snapshot.idSource).toBe("contract");
    expect(snapshot.marketIds).toEqual([1n, 3n]);
    expect(snapshot.positions.get(1n)).toEqual({
      yesShares: 10n,
      noShares: 0n,
      claimed: false,
      claimedPayout: 0n,
    });

    const positionCalls = readContract.mock.calls
      .map(([call]) => call as ReadCall)
      .filter((call) => call.functionName === "getUserPosition");
    expect(positionCalls).toHaveLength(2);
    expect(
      positionCalls.every((call) => call.args?.[1] === USER),
    ).toBe(true);
    const seenIds = new Set(
      positionCalls.map((call) => (call.args?.[0] as bigint).toString()),
    );
    expect(seenIds).toEqual(new Set(["1", "3"]));

    const marketIdCalls = readContract.mock.calls
      .map(([call]) => call as ReadCall)
      .filter((call) => call.functionName === "getUserMarketIds");
    expect(marketIdCalls).toHaveLength(1);
    expect(marketIdCalls[0]?.args?.[0]).toBe(USER);
  });

  it("filters the event fallback logs by the user argument and the contract address", async () => {
    const readContract = vi.fn(async () => {
      throw new Error("getUserMarketIds unavailable");
    });
    const getLogs = vi.fn(async (_query: LogQuery): Promise<readonly RawLog[]> => []);
    const getBlockNumber = vi.fn(async () => 10n);

    await fetchUserPositionsSnapshot(
      fakeClient({ readContract, getLogs, getBlockNumber }),
      REF,
      USER,
    );

    const query = getLogs.mock.calls[0]?.[0];
    expect(query?.address).toBe(REF);
    expect(query?.args?.user).toBe(USER);
    expect(query?.events).toHaveLength(2);
  });
});

describe("fetchUserPositionsSnapshot - event-log fallback", () => {
  it("uses address-filtered events, dedupes market ids and accumulates cost basis", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getUserMarketIds") {
        throw new Error("getUserMarketIds is not on this contract");
      }
      if (call.functionName === "getUserPosition") return [0n, 0n, false, 0n];
      throw new Error(`unexpected ${call.functionName}`);
    });
    const logs: RawLog[] = [
      placedLog(5n, USER, 1, 100n, 100n),
      placedLog(5n, USER, 2, 50n, 50n),
      placedLog(7n, OTHER_USER, 1, 999n, 999n),
      betLog(9n, USER, 1, 30n),
    ];
    const getLogs = vi.fn(async (_query: LogQuery): Promise<readonly RawLog[]> => logs);

    const snapshot = await fetchUserPositionsSnapshot(
      fakeClient({ readContract, getLogs, getBlockNumber: async () => 10n }),
      REF,
      USER,
    );

    expect(snapshot.idSource).toBe("events");
    expect(snapshot.marketIds).toEqual([5n, 9n]);
    expect(snapshot.costByMarket.get(5n)).toEqual({
      cost: 150n,
      yesCost: 100n,
      noCost: 50n,
    });
    expect(snapshot.costByMarket.get(9n)?.cost).toBe(30n);
    expect(snapshot.positions.get(5n)).toEqual({
      yesShares: 0n,
      noShares: 0n,
      claimed: false,
      claimedPayout: 0n,
    });
  });

  it("scans only bounded, contiguous block chunks", async () => {
    const readContract = vi.fn(async () => {
      throw new Error("no getUserMarketIds");
    });
    const getLogs = vi.fn(async (_query: LogQuery): Promise<readonly RawLog[]> => []);

    await fetchUserPositionsSnapshot(
      fakeClient({
        readContract,
        getLogs,
        getBlockNumber: async () => 300_000n,
      }),
      REF,
      USER,
    );

    const ranges = getLogs.mock.calls.map(
      ([query]) => [query.fromBlock, query.toBlock] as const,
    );

    expect(ranges[0]?.[0]).toBe(50_000n);
    expect(ranges[ranges.length - 1]?.[1]).toBe(300_000n);
    expect(getLogs).toHaveBeenCalledTimes(6);
    for (let i = 0; i < ranges.length; i++) {
      const [from, to] = ranges[i]!;
      expect(to - from + 1n).toBeLessThanOrEqual(50_000n);
      if (i > 0) {
        expect(from).toBe(ranges[i - 1]![1] + 1n);
      }
    }
  });

  it("starts from the configured deployment block when it is inside the window", async () => {
    const readContract = vi.fn(async () => {
      throw new Error("no getUserMarketIds");
    });
    const getLogs = vi.fn(async (_query: LogQuery): Promise<readonly RawLog[]> => []);

    await fetchUserPositionsSnapshot(
      fakeClient({
        readContract,
        getLogs,
        getBlockNumber: async () => 200_000n,
      }),
      REF,
      USER,
      { deploymentBlock: 190_000n },
    );

    const first = getLogs.mock.calls[0]?.[0];
    expect(first?.fromBlock).toBe(190_000n);
  });

  it("falls back to events when getUserMarketIds returns a malformed value", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getUserMarketIds") return "not-an-array";
      throw new Error(`unexpected ${call.functionName}`);
    });
    const getLogs = vi.fn(
      async (_query: LogQuery): Promise<readonly RawLog[]> => [placedLog(2n, USER, 1, 1n, 1n)],
    );

    const snapshot = await fetchUserPositionsSnapshot(
      fakeClient({ readContract, getLogs, getBlockNumber: async () => 1n }),
      REF,
      USER,
    );
    expect(snapshot.idSource).toBe("events");
    expect(snapshot.marketIds).toEqual([2n]);
  });

  it("throws a ContractInterfaceError when both discovery paths fail", async () => {
    const readContract = vi.fn(async () => {
      throw new Error("no getUserMarketIds");
    });
    const getLogs = vi.fn(
      async (_query: LogQuery): Promise<readonly RawLog[]> => {
        throw new Error("logs unavailable");
      },
    );

    await expect(
      fetchUserPositionsSnapshot(
        fakeClient({ readContract, getLogs, getBlockNumber: async () => 5n }),
        REF,
        USER,
      ),
    ).rejects.toBeInstanceOf(ContractInterfaceError);
  });

  it("keeps contract-based positions when event enrichment fails, with a warning", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getUserMarketIds") return [4n];
      if (call.functionName === "getUserPosition") return [11n, 0n, false, 0n];
      throw new Error(`unexpected ${call.functionName}`);
    });
    const getLogs = vi.fn(
      async (_query: LogQuery): Promise<readonly RawLog[]> => {
        throw new Error("logs unavailable");
      },
    );

    const snapshot = await fetchUserPositionsSnapshot(
      fakeClient({ readContract, getLogs, getBlockNumber: async () => 5n }),
      REF,
      USER,
    );

    expect(snapshot.idSource).toBe("contract");
    expect(snapshot.marketIds).toEqual([4n]);
    expect(snapshot.eventsWarning).toBeDefined();
    expect(snapshot.costByMarket.size).toBe(0);
  });
});

describe("fetchClaimEligibility", () => {
  it("reads isEligibleToClaim per candidate market and preserves estimates", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "isEligibleToClaim") {
        const id = call.args?.[0] as bigint;
        if (id === 5n) return [true, 250n];
        return [false, 0n];
      }
      throw new Error(`unexpected ${call.functionName}`);
    });

    const map = await fetchClaimEligibility(
      fakeClient({ readContract }),
      REF,
      USER,
      [5n, 9n],
    );

    expect(map.get(5n)).toEqual({ eligible: true, estimatedPayout: 250n });
    expect(map.get(9n)).toEqual({ eligible: false, estimatedPayout: 0n });
    const calls = readContract.mock.calls.map(([call]) => call as ReadCall);
    expect(calls.every((call) => call.args?.[1] === USER)).toBe(true);
  });

  it("skips markets whose eligibility read fails", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if ((call.args?.[0] as bigint) === 5n) return [true, 1n];
      throw new Error("reverted");
    });

    const map = await fetchClaimEligibility(
      fakeClient({ readContract }),
      REF,
      USER,
      [5n, 9n],
    );
    expect(map.has(9n)).toBe(false);
  });
});

describe("test fixtures sanity", () => {
  it("the hand-built logs carry the expected topic count", () => {
    const log = placedLog(1n, USER, 1, 2n, 3n);
    expect(log.topics.length).toBeGreaterThanOrEqual(3);
    expect(log.data).toMatch(/^0x/);
  });
});
