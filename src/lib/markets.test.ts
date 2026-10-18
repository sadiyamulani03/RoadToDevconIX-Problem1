import { describe, expect, it, vi } from "vitest";
import { ContractInterfaceError } from "./errors";
import { fetchMarkets, fetchMarketsByIds } from "./markets";
import { fakeClient, TEST_REFERENCE_ADDRESS as REF } from "../test/utils";

interface ReadCall {
  address: string;
  functionName: string;
  args?: readonly unknown[];
}

function struct(
  id: bigint,
  question: string,
  extra: {
    status?: number;
    winningOutcome?: number;
    totalYes?: bigint;
    totalNo?: bigint;
    endTime?: bigint;
    resolutionTime?: bigint;
  } = {},
): unknown[] {
  return [
    id,
    question,
    extra.status ?? 0,
    extra.winningOutcome ?? 0,
    extra.totalYes ?? 0n,
    extra.totalNo ?? 0n,
    extra.endTime ?? 0n,
    extra.resolutionTime ?? 0n,
  ];
}

describe("fetchMarkets", () => {
  it("reads markets at the configured address and probes a 1-based id space", async () => {
    const calls: ReadCall[] = [];
    const markets = new Map<string, unknown>([
      ["1", struct(1n, "Will chai cost more next week?")],
      ["2", struct(2n, "Will the 9am lecture start on time?")],
    ]);

    const readContract = vi.fn(async (call: ReadCall) => {
      calls.push(call);
      if (call.functionName === "getMarketCount") return 2n;
      if (call.functionName === "getMarket") {
        const hit = markets.get((call.args?.[0] as bigint).toString());
        if (hit) return hit;
        throw new Error("execution reverted");
      }
      throw new Error(`unexpected ${call.functionName}`);
    });

    const feed = await fetchMarkets(fakeClient({ readContract }), REF);

    expect(feed.markets.map((m) => m.id)).toEqual([1n, 2n]);
    expect(feed.markets[0]?.question).toBe("Will chai cost more next week?");
    expect(feed.truncated).toBe(false);
    expect(calls[0]?.functionName).toBe("getMarketCount");
    expect(calls.every((call) => call.address === REF)).toBe(true);
  });

  it("detects a 0-based id space when the boundary id decodes as an empty struct", async () => {
    const markets = new Map<string, unknown>([
      ["0", struct(0n, "Market zero")],
      ["1", struct(1n, "Market one")],
    ]);
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getMarketCount") return 2n;
      if (call.functionName === "getMarket") {
        const id = call.args?.[0] as bigint;
        return markets.get(id.toString()) ?? struct(id, "");
      }
      throw new Error(`unexpected ${call.functionName}`);
    });

    const feed = await fetchMarkets(fakeClient({ readContract }), REF);
    expect(feed.markets.map((m) => m.id)).toEqual([0n, 1n]);
  });

  it("falls back to the markets(id) mapping spelling when getMarket does not exist", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getMarketCount") return 2n;
      if (call.functionName === "markets") {
        const id = call.args?.[0] as bigint;
        if (id === 1n || id === 2n) return struct(id, `Mapping market ${id}`);
        throw new Error("execution reverted");
      }
      throw new Error("function not found");
    });

    const feed = await fetchMarkets(fakeClient({ readContract }), REF);
    expect(feed.markets.map((m) => m.id)).toEqual([1n, 2n]);
    expect(feed.markets[0]?.question).toBe("Mapping market 1");
  });

  it("throws a ContractInterfaceError when the contract answers nothing usable", async () => {
    const readContract = vi.fn(async () => {
      throw new Error("execution reverted");
    });

    await expect(
      fetchMarkets(fakeClient({ readContract }), REF),
    ).rejects.toBeInstanceOf(ContractInterfaceError);
  });

  it("batches market reads through multicall when available", async () => {
    const markets = new Map<string, unknown>([
      ["1", struct(1n, "Q1")],
      ["2", struct(2n, "Q2")],
    ]);
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getMarketCount") return 2n;
      if (call.functionName === "getMarket") {
        const id = call.args?.[0] as bigint;
        const hit = markets.get(id.toString());
        if (hit) return hit;
        throw new Error("execution reverted");
      }
      throw new Error(`unexpected ${call.functionName}`);
    });
    const multicallSpy = vi.fn(
      async (args: { contracts: ReadCall[] }) =>
        args.contracts.map((contract) => ({
          status: "success" as const,
          result: markets.get((contract.args?.[0] as bigint).toString()),
        })),
    );

    const feed = await fetchMarkets(
      fakeClient({ readContract, multicall: multicallSpy }),
      REF,
    );

    expect(feed.markets).toHaveLength(2);
    expect(multicallSpy).toHaveBeenCalledTimes(1);
    const batch = multicallSpy.mock.calls[0]?.[0];
    expect(batch?.contracts).toHaveLength(2);
  });

  it("falls back to sequential reads when multicall fails", async () => {
    const markets = new Map<string, unknown>([
      ["1", struct(1n, "Q1")],
      ["2", struct(2n, "Q2")],
    ]);
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getMarketCount") return 2n;
      if (call.functionName === "getMarket") {
        const id = call.args?.[0] as bigint;
        const hit = markets.get(id.toString());
        if (hit) return hit;
        throw new Error("execution reverted");
      }
      throw new Error(`unexpected ${call.functionName}`);
    });
    const multicall = vi.fn(async () => {
      throw new Error("multicall unavailable");
    });

    const feed = await fetchMarkets(
      fakeClient({ readContract, multicall }),
      REF,
    );
    expect(feed.markets.map((m) => m.id)).toEqual([1n, 2n]);
  });

  it("caps the feed at the most recent MAX_MARKETS entries", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.functionName === "getMarketCount") return 300n;
      if (call.functionName === "getMarket") {
        const id = call.args?.[0] as bigint;
        return struct(id, `Question ${id}`);
      }
      throw new Error(`unexpected ${call.functionName}`);
    });

    const feed = await fetchMarkets(fakeClient({ readContract }), REF);

    expect(feed.truncated).toBe(true);
    expect(feed.markets).toHaveLength(200);
    expect(feed.markets[0]?.id).toBe(101n);
    expect(feed.markets[199]?.id).toBe(300n);
  });
});

describe("fetchMarketsByIds", () => {
  it("skips malformed entries instead of inventing values", async () => {
    const readContract = vi.fn(async (call: ReadCall) => {
      if (call.args?.[0] === 1n) return struct(1n, "Good market");
      return { nonsense: true };
    });

    const markets = await fetchMarketsByIds(
      fakeClient({ readContract }),
      REF,
      [1n, 2n],
    );
    expect(markets.map((m) => m.id)).toEqual([1n]);
  });

  it("returns an empty list for no ids without any RPC call", async () => {
    const readContract = vi.fn(async () => 1n);
    const markets = await fetchMarketsByIds(
      fakeClient({ readContract }),
      REF,
      [],
    );
    expect(markets).toEqual([]);
    expect(readContract).not.toHaveBeenCalled();
  });
});
