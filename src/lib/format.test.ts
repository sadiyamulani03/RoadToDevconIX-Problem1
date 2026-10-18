import { describe, expect, it } from "vitest";
import {
  bpsToCssPercent,
  computeRealizedPnl,
  formatBps,
  formatRelativeTime,
  formatShare,
  formatSignedUnits,
  formatTimestamp,
  formatUnitsCompact,
  formatUnitsExact,
  toBps,
  toBpsClamped,
  truncateAddress,
} from "./format";

describe("exact formatting (bigint-safe)", () => {
  it("renders tiny values without floating point loss", () => {
    expect(formatUnitsExact(123n, 18)).toBe("0.000000000000000123");
  });

  it("preserves the full precision of values far beyond Number.MAX_SAFE_INTEGER", () => {
    const wei = 123_456_789_123_456_789_123_456_789n;
    expect(formatUnitsExact(wei, 18)).toBe("123,456,789.123456789123456789");
  });

  it("keeps the last digit of 10^18 + 1", () => {
    const value = 10n ** 18n + 1n;
    expect(formatUnitsExact(value, 18)).toBe("1.000000000000000001");
  });

  it("groups thousands without converting to Number", () => {
    const value = 1_234_567n * 10n ** 18n;
    expect(formatUnitsExact(value, 18)).toBe("1,234,567");
  });

  it("handles zero", () => {
    expect(formatUnitsExact(0n, 18)).toBe("0");
    expect(formatUnitsCompact(0n, 6)).toBe("0");
  });
});

describe("compact formatting", () => {
  it("truncates (never rounds) the fraction", () => {
    expect(formatUnitsCompact(1_999_999n, 6, 2)).toBe("1.99");
  });

  it("trims trailing zeros in the clipped fraction", () => {
    expect(formatUnitsCompact(1_500_000n, 6, 4)).toBe("1.5");
  });

  it("supports non-18 decimals", () => {
    expect(formatUnitsCompact(12345n, 6)).toBe("0.0123");
  });

  it("prefixes only positive values with a sign", () => {
    expect(formatSignedUnits(5n, 0)).toBe("+5");
    expect(formatSignedUnits(-5n, 0)).toBe("-5");
    expect(formatSignedUnits(0n, 0)).toBe("0");
  });
});

describe("integer percentage math", () => {
  it("computes basis points with integer division only", () => {
    expect(toBps(1n, 3n)).toBe(3333n);
    expect(formatBps(3333n)).toBe("33.33%");
    expect(formatShare(1n, 2n)).toBe("50.00%");
    expect(formatShare(1n, 0n)).toBe("0.00%");
  });

  it("clamps for progress bars", () => {
    expect(toBpsClamped(11n, 10n)).toBe(10_000n);
    expect(toBpsClamped(5n, 0n)).toBe(0n);
    expect(bpsToCssPercent(3333n)).toBe("33.33%");
    expect(bpsToCssPercent(20_000n)).toBe("100.00%");
  });
});

describe("profit / loss", () => {
  it("is only computed when the entry cost is genuinely known", () => {
    expect(computeRealizedPnl(150n, 100n)).toBe(50n);
    expect(computeRealizedPnl(50n, 100n)).toBe(-50n);
    expect(computeRealizedPnl(150n, undefined)).toBeUndefined();
  });
});

describe("time and address helpers", () => {
  const now = 1_000_000n;

  it("formats future and past durations", () => {
    expect(formatRelativeTime(now + 2n * 86_400n + 3n * 3600n, now)).toBe(
      "in 2d 3h",
    );
    expect(formatRelativeTime(now - 45n * 60n, now)).toBe("45m ago");
    expect(formatRelativeTime(now + 30n, now)).toBe("in under a minute");
  });

  it("guards against invalid timestamps", () => {
    expect(formatTimestamp(0n)).toBe("unknown");
  });

  it("truncates addresses in the middle", () => {
    expect(
      truncateAddress("0x1234567890abcdef1234567890abcdef12345678", 4),
    ).toBe("0x1234\u20265678");
  });
});
