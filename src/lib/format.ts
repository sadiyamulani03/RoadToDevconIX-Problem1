import { formatUnits } from "viem";

/**
 * Bigint-safe formatting helpers.
 *
 * Rule for this codebase: on-chain integer amounts (token units, shares,
 * payouts) NEVER pass through `Number`, `parseFloat`, or float arithmetic.
 * Manual scaling by powers of ten is never performed; `viem`'s `formatUnits`
 * is the only conversion point, and it is used for display only. All
 * percentages are computed with integer (basis-point) math.
 */

function groupThousands(integerPart: string): string {
  const sign = integerPart.startsWith("-") ? "-" : "";
  const digits = sign ? integerPart.slice(1) : integerPart;
  let grouped = "";
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i;
    grouped += digits[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) grouped += ",";
  }
  return sign + grouped;
}

/** Exact decimal string (trailing zeros trimmed), for authoritative displays. */
export function formatUnitsExact(value: bigint, decimals: number): string {
  const raw = formatUnits(value, decimals);
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart = "0", fracPart = ""] = unsigned.split(".");
  const trimmedFrac = fracPart.replace(/0+$/, "");
  const groupedInt = groupThousands(intPart);
  const body = trimmedFrac.length > 0 ? `${groupedInt}.${trimmedFrac}` : groupedInt;
  return (negative ? "-" : "") + body;
}

/** Truncated display value (no rounding), e.g. 1.23456 -> "1.2345". */
export function formatUnitsCompact(
  value: bigint,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const raw = formatUnits(value, decimals);
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart = "0", fracPart = ""] = unsigned.split(".");
  const clipped = fracPart.slice(0, maxFractionDigits).replace(/0+$/, "");
  const groupedInt = groupThousands(intPart);
  const body = clipped.length > 0 ? `${groupedInt}.${clipped}` : groupedInt;
  return (negative ? "-" : "") + body;
}

/** Explicit sign prefix, for PnL-style values. */
export function formatSignedUnits(
  value: bigint,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const formatted = formatUnitsCompact(value, decimals, maxFractionDigits);
  return value > 0n ? `+${formatted}` : formatted;
}

/** Integer percentage from basis points: 1234n -> "12.34%". */
export function formatBps(bps: bigint): string {
  const negative = bps < 0n;
  const abs = negative ? -bps : bps;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${groupThousands(whole.toString())}.${frac}%`;
}

/** part/total as basis points, using integer math only. total <= 0 -> 0n. */
export function toBps(part: bigint, total: bigint): bigint {
  if (total <= 0n) return 0n;
  return (part * 10_000n) / total;
}

export function toBpsClamped(part: bigint, total: bigint): bigint {
  const bps = toBps(part, total);
  if (bps < 0n) return 0n;
  if (bps > 10_000n) return 10_000n;
  return bps;
}

/** "12.34%" from part/total with two integer-computed decimals. */
export function formatShare(part: bigint, total: bigint): string {
  return formatBps(toBps(part, total));
}

/** Width string for CSS bars. Never feeds a numeric float back into money. */
export function bpsToCssPercent(bps: bigint): string {
  const clamped = bps < 0n ? 0n : bps > 10_000n ? 10_000n : bps;
  const whole = clamped / 100n;
  const frac = (clamped % 100n).toString().padStart(2, "0");
  return `${whole}.${frac}%`;
}

export function truncateAddress(address: string, size = 4): string {
  if (address.length <= 2 + size * 2) return address;
  return `${address.slice(0, 2 + size)}\u2026${address.slice(-size)}`;
}

export function truncateHash(hash: string, size = 6): string {
  if (hash.length <= 2 + size * 2) return hash;
  return `${hash.slice(0, 2 + size)}\u2026${hash.slice(-size)}`;
}

export function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function bigintMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function bigintAbs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

/** Realized PnL, only when the entry cost is genuinely known. */
export function computeRealizedPnl(
  claimedPayout: bigint,
  costBasis: bigint | undefined,
): bigint | undefined {
  if (costBasis === undefined) return undefined;
  return claimedPayout - costBasis;
}

export function formatRelativeTime(
  targetSeconds: bigint,
  nowSeconds: bigint,
): string {
  const delta = targetSeconds - nowSeconds;
  const future = delta > 0n;
  const abs = future ? delta : -delta;

  if (abs < 60n) return future ? "in under a minute" : "just now";

  const minutes = abs / 60n;
  const hours = abs / 3600n;
  const days = abs / 86_400n;

  let magnitude: string;
  if (days > 0n) {
    const remHours = (abs % 86_400n) / 3600n;
    magnitude =
      remHours > 0n
        ? `${days}d ${remHours}h`
        : `${days}d`;
  } else if (hours > 0n) {
    const remMinutes = (abs % 3600n) / 60n;
    magnitude =
      remMinutes > 0n
        ? `${hours}h ${remMinutes}m`
        : `${hours}h`;
  } else {
    magnitude = `${minutes}m`;
  }

  return future ? `in ${magnitude}` : `${magnitude} ago`;
}

export function formatTimestamp(seconds: bigint): string {
  // Unix time -> milliseconds for Date; a timestamp, never a token amount.
  const ms = Number(seconds * 1000n);
  if (!Number.isFinite(ms) || ms <= 0) return "unknown";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
