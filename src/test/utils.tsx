import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import type { BaseSepoliaClient } from "../lib/client";
import type { WalletClient } from "viem";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

export function renderWithQuery(
  ui: ReactNode,
): RenderResult & { queryClient: QueryClient } {
  const queryClient = createTestQueryClient();
  const result = render(ui, { wrapper: wrapperFor(queryClient) });
  return { ...result, queryClient };
}

export function renderHookWithQuery<Result, Props>(
  hook: (props: Props) => Result,
  options?: { initialProps?: Props },
) {
  const queryClient = createTestQueryClient();
  const result = renderHook(hook, {
    wrapper: wrapperFor(queryClient),
    ...(options?.initialProps !== undefined
      ? { initialProps: options.initialProps }
      : {}),
  });
  return { ...result, queryClient };
}

export const TEST_REFERENCE_ADDRESS =
  "0x1111111111111111111111111111111111111111" as const;

export const TEST_OTHER_ADDRESS =
  "0x9999999999999999999999999999999999999999" as const;

/**
 * Builds a minimal fake BaseSepoliaClient exposing only the methods under
 * test. Callers must provide every method their code path uses; the override
 * shapes are intentionally unconstrained so tests can hold precisely typed
 * spies and assert on their calls.
 */
export function fakeClient<Overrides extends object>(
  overrides: Overrides,
): BaseSepoliaClient {
  const client = {
    chain: { id: 84532 },
    ...overrides,
  };
  return client as unknown as BaseSepoliaClient;
}

export function fakeWalletClient<Overrides extends object>(
  overrides: Overrides,
): WalletClient {
  const client = {
    chain: { id: 84532 },
    account: undefined,
    ...overrides,
  };
  return client as unknown as WalletClient;
}
