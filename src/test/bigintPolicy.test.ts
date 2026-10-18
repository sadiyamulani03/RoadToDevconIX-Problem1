import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static policy guard for the bigint-only money rule (challenge check 3).
 *
 * Scans every production source file (not tests) for floating-point or
 * manual-scaling patterns applied to token amounts. `formatUnits` /
 * `formatEther` from viem remain the only legal display conversion.
 */

const SRC_ROOT = join(process.cwd(), "src");

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "test") continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /parseFloat\s*\(/, why: "parseFloat must never touch amounts" },
  { pattern: /parseInt\s*\(/, why: "parseInt must never touch amounts" },
  { pattern: /\/\s*1e18\b/, why: "manual division by 1e18" },
  {
    pattern: /\/\s*10\s*\*\*\s*decimals/i,
    why: "manual division by 10**decimals",
  },
  {
    pattern: /\*\*\s*decimals/i,
    why: "manual scaling by 10**decimals",
  },
  {
    pattern:
      /Number\s*\(\s*[a-zA-Z_$][\w$]*(amount|value|shares|payout|cost|pool)/i,
    why: "Number() applied to an amount-like identifier",
  },
];

describe("bigint-only money policy", () => {
  const files = collectSourceFiles(SRC_ROOT);

  it("scans a plausible number of source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN)("never uses $why in production code", ({ pattern }) => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (pattern.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("performs unit conversion only through viem's formatUnits family", () => {
    const directCall = /\bformatUnits\s*\(|\bformatEther\s*\(/;
    const converters = files.filter((file) => directCall.test(readFileSync(file, "utf8")));
    expect(converters.length).toBeGreaterThan(0);
    for (const file of converters) {
      const content = readFileSync(file, "utf8");
      expect(content).toMatch(/from "viem"/);
    }
  });
});
