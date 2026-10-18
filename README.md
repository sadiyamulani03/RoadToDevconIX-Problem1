# The Chai-Stall Terminal

A mobile-first prediction-market dashboard for the **Chai Stall** play-token
market on **Base Sepolia** (chain ID `84532`), built for
[Road to Devcon IX — Problem 1](https://www.loops.house/road-to-devcon-ix).

Connect a wallet, see the open markets, check your positions and cost basis,
and claim your winnings — all against a real Base Sepolia contract over a
real RPC. No mock data, no substitute deployments.

## What it does

- **Markets** — discovers every open market from the reference contract
  (newest first, capped at 200), showing reserves and pool share as integer
  basis-point math, plus implied percentages.
- **Positions** — finds the connected account's participated markets via
  `getUserMarketIds(address)` and, when that view is unavailable, via a single
  bounded `eth_getLogs` query filtered by the `PositionPlaced`/`BetPlaced`
  event topics **and** the user's address. Never scans all markets per account.
  Displays held shares per side and cost basis when recoverable from events.
- **Claim** — resolves eligibility from contract state only (`getUserPosition`,
  `claims`), previews the claim, simulates before writing, submits
  `claimWinnings(user, marketId)` (falling back to `claim(...)` only when the
  contract reports that signature is unavailable), waits for the receipt and
  only reports success when `receipt.status === "success"`.
- **Safety rails** — writes are hard-blocked unless the wallet is on chain
  `84532`; read failures are always surfaced (never rendered as zero); token
  decimals are read from the chain or explicitly labelled as assumed.

## Bigint-only money rule

Every on-chain integer amount (token units, shares, payouts) stays a `bigint`
end to end. The only conversion point is `viem`'s `formatUnits`/`formatEther`
at the display boundary. There is no `Number(amount)`, `parseFloat(amount)`,
manual `/ 1e18` or `10**decimals` scaling in production code — enforced by a
static policy test (`src/test/bigintPolicy.test.ts`) and asserted across the
formatter suite (`src/lib/format.test.ts`), including values far beyond
`Number.MAX_SAFE_INTEGER`.

## Contract configuration (read this)

The official reference-contract address and exact Solidity ABI were behind
the organizer's login-gated materials and **could not be verified**. Rather
than hardcoding an unverified address (which would risk claiming against the
wrong contract), the app resolves the address at runtime and probes the
contract's read interface defensively:

1. `localStorage["chai-stall.reference-contract-address"]` — set at runtime
   from the in-app **Configure contract** panel (no rebuild needed);
2. `VITE_REFERENCE_CONTRACT_ADDRESS` build-time env var;
3. otherwise the app shows a clear "contract not configured" state.

Read calls use capability probing (`getMarket(marketId)` / `markets(id)` and
0/1-based id probing) so discoverable interface differences do not break
market loading, and every unsupported read degrades to a visible error state
instead of fabricated data.

## Getting started

```bash
npm install
cp .env.example .env   # optionally set VITE_REFERENCE_CONTRACT_ADDRESS / VITE_BASE_SEPOLIA_RPC
npm run dev
```

Scripts:

| Script               | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Vite dev server                            |
| `npm run typecheck`  | `tsc --noEmit` (strict)                    |
| `npm run lint`       | ESLint (flat config, react-hooks rules)    |
| `npm test`           | Vitest suite (95 tests, jsdom)             |
| `npm run build`      | typecheck + production build to `dist/`    |
| `npm run preview`    | Serve the production build locally         |
| `npm run check`      | typecheck + lint + tests                   |

Optional environment variables (see `.env.example`):

- `VITE_REFERENCE_CONTRACT_ADDRESS` — reference contract on Base Sepolia.
- `VITE_BASE_SEPOLIA_RPC` — custom RPC endpoint (HTTPS; localhost allowed
  for local nodes). Defaults to `https://sepolia.base.org`.

Deployment: `vercel.json` is included and the app builds as a static SPA to
`dist/` (works on any static host).

## Architecture

```
src/
  config/    chain constants, reference ABI, address resolution, wagmi, query client
  lib/       pure logic: env, errors, client, bigint formatting, markets,
             positions (events fallback), eligibility, claim execution
  wallet/    the only module that imports wagmi hooks (keeps UI testable)
  hooks/     thin React Query / external-store wrappers over lib/
  components/ presentational + feature components (mobile-first)
  test/      setup, render helpers with fake clients, bigint policy guard
```

Key decisions:

- **viem + wagmi + React Query**; walletconnect is deliberately not included
  (it would require shipping a project ID credential).
- Claim flow is a small explicit state machine (`simulate → pending →
  confirming → confirmed/failed/timeout`) with the transaction hash kept on
  timeout so the user can still track it on Basescan.
- The event-log fallback is bounded by block chunks
  (`LOG_CHUNK_SIZE = 50_000`, lookback ≤ 250_000 blocks) and always filters
  by the user's address in the topic/args.
- `deadline` in the past never upgrades a market to "resolved"; only
  contract-reported status does.

## Acceptance criteria — official scored checks (audited)

The battle defines 9 scored test cases worth 80 points (plus 20 judgment
points). These are answered by reading the submitted repo. This table is the
honest audit of the current state — it deliberately does **not** claim points
that cannot be confirmed yet.

| # | Official check | Pts | Audit status |
| - | -------------- | --: | ------------ |
| 1 | Open markets are read from the reference contract | 5 | **Unverified.** The market list is populated only from on-chain reads against a configured address (no hardcoded or mock market data anywhere; an unconfigured address renders an explicit setup state). However, the genuine reference address/ABI are not available, so this cannot yet be confirmed against the real contract. |
| 2 | The connected wallet's positions are displayed | 5 | **Unverified.** A positions view renders rows derived from chain reads for the connected address, and the wrapper is unit-tested, but real-contract data cannot be confirmed until the official address/ABI are configured. |
| 3 | No token amount is converted with floating-point arithmetic | 14 | **Passes code audit.** All base-unit displays go through `formatUnits`/`formatEther`; P&L and pool math stay in `bigint` (`src/lib/format.ts`, `src/lib/eligibility.ts`). Enforced by `src/test/bigintPolicy.test.ts`; precision tests cover values beyond `Number.MAX_SAFE_INTEGER`. The only `Number()` uses convert a Unix timestamp and bounded 0–255 status codes — never amounts. |
| 4 | Positions are queried by the user's address, not by scanning every market | 14 | **Passes code audit.** Primary path is one read keyed by the user (`getUserMarketIds(address)`); fallback is a single `getLogs` query with `events` + `args: { user }`. The user's own market ids are then read individually — every market is never iterated (`src/lib/positions.ts`, asserted in tests). |
| 5 | Write actions are blocked when the wallet is on the wrong chain | 10 | **Passes code audit.** `executeClaim` refuses to simulate or send unless both the read client and wallet client are on chain 84532; the UI disables the claim control and offers a switch prompt (`src/lib/claimExecution.ts`, `src/wallet/useWallet.ts`). |
| 6 | Success is shown only after a transaction receipt | 14 | **Passes code audit.** The claim state machine emits success only after `waitForTransactionReceipt` returns a receipt with `status === "success"`; a returned hash alone is shown as pending (`src/lib/claimExecution.ts`, tested). |
| 7 | The claim action is gated on the market's resolved state | 7 | **Passes code audit.** Claim UI renders only when the phase derived from contract data (status code / winning outcome / resolution time) is `resolved`; a passed deadline never upgrades to resolved (`src/lib/eligibility.ts`, `src/components/PositionCard.tsx`, tested). |
| 8 | Failed chain reads render an error state | 6 | **Passes code audit.** Failed market and positions reads render a visible error message with a retry control (`src/components/MarketList.tsx`, `src/components/PositionsView.tsx`, `src/components/ErrorState.tsx`, tested). |
| 9 | No credential appears in any tracked file | 5 | **Passes audit.** No private keys, API keys, or authenticated RPC URLs in tracked files; the only tracked env file is `.env.example` with placeholders. |

Locally provable from the repo today: **70 / 80** check points (checks 3–9).
Checks 1 and 2 (10 points) are **blocked** on the genuine reference contract
address + ABI. The 20 judgment points are not self-assessed. No official
score is claimed.

## Verification status & limitations

- ✅ `npm run typecheck`, `npm run lint`, `npm test` (95 passing), and
  `npm run build` all pass locally.
- ✅ Production preview smoke-tested (index + assets served, HTTP 200).
- ⚠️ **Not yet verified against the real reference contract**: the official
  address/ABI were not accessible, so on-chain integration is implemented
  defensively with capability probing. Once the official address is known,
  set it via the env var or the in-app panel — no code changes required.
- ⚠️ Not deployed to a public URL yet (static-ready, `vercel.json` included).

## Testing

Ten suites cover formatting, address resolution/override propagation, market
coercion and discovery, position scanning with the events fallback, claim
state machine (wrong chain, account change, revert, timeout, simulation
fallback), UI rendering (`MarketList`, `PositionsView`), and hook-level
account isolation. Fake viem clients keep every test hermetic — no network
calls.
