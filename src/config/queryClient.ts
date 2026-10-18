import { QueryClient } from "@tanstack/react-query";
import { isRetryableReadError } from "../lib/errors";

/**
 * Query client tuned for low-power phones on flaky connections:
 *   - modest stale windows (fresh enough, few requests);
 *   - no refetch-on-focus storms (mobile browsers fire focus constantly);
 *   - refetch on reconnect (the useful signal);
 *   - bounded exponential retry that skips deterministic failures.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount, error) =>
          isRetryableReadError(error) && failureCount < 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
      },
    },
  });
}
