import { useEffect, useState } from "react";

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Ticking "now" in seconds (bigint), used for deadline countdowns. The
 * refresh interval is deliberately coarse to keep low-power phones cool.
 */
export function useNowSeconds(intervalMs: number = DEFAULT_INTERVAL_MS): bigint {
  const [now, setNow] = useState<bigint>(() =>
    BigInt(Math.floor(Date.now() / 1000)),
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(BigInt(Math.floor(Date.now() / 1000)));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
