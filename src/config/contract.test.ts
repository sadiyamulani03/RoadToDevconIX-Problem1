import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import {
  ADDRESS_OVERRIDE_KEY,
  getReferenceContract,
  normalizeAddress,
  setAddressOverride,
} from "./contract";

const VALID_LOWER = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_CHECKSUMMED = getAddress(VALID_LOWER);
const VALID_2 = getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");

describe("reference contract address resolution", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("reports 'none' when neither env nor override is set", () => {
    vi.stubEnv("VITE_REFERENCE_CONTRACT_ADDRESS", "");
    expect(getReferenceContract()).toEqual({ source: "none" });
  });

  it("reads the build-time env value and checksums it", () => {
    vi.stubEnv("VITE_REFERENCE_CONTRACT_ADDRESS", VALID_LOWER);
    expect(getReferenceContract()).toEqual({
      address: VALID_CHECKSUMMED,
      source: "env",
    });
  });

  it("prefers a runtime override over the env value", () => {
    vi.stubEnv("VITE_REFERENCE_CONTRACT_ADDRESS", VALID_LOWER);
    expect(setAddressOverride(VALID_2)).toEqual({ ok: true });
    expect(getReferenceContract()).toEqual({
      address: VALID_2,
      source: "override",
    });
  });

  it("falls back to env when the override is cleared", () => {
    vi.stubEnv("VITE_REFERENCE_CONTRACT_ADDRESS", VALID_LOWER);
    setAddressOverride(VALID_2);
    setAddressOverride(null);
    expect(getReferenceContract().source).toBe("env");
  });

  it("ignores garbage that was written into storage directly", () => {
    vi.stubEnv("VITE_REFERENCE_CONTRACT_ADDRESS", "");
    window.localStorage.setItem(ADDRESS_OVERRIDE_KEY, "not-an-address");
    expect(getReferenceContract()).toEqual({ source: "none" });
  });

  it("rejects invalid strings and the zero address", () => {
    expect(setAddressOverride("0x123")).toMatchObject({ ok: false });
    expect(setAddressOverride("hello")).toMatchObject({ ok: false });
    expect(
      setAddressOverride("0x0000000000000000000000000000000000000000"),
    ).toMatchObject({ ok: false });
    expect(normalizeAddress("0x0000000000000000000000000000000000000000")).toBeUndefined();
    expect(normalizeAddress(undefined)).toBeUndefined();
  });

  it("stores the checksummed form", () => {
    setAddressOverride(VALID_LOWER);
    expect(window.localStorage.getItem(ADDRESS_OVERRIDE_KEY)).toBe(
      VALID_CHECKSUMMED,
    );
  });
});
