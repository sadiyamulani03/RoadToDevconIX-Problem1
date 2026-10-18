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

## Verification status & limitations

- ✅ `npm run typecheck`, `npm run lint`, `npm test` (95 passing), and
  `npm run build` all pass locally.
- ✅ Production preview smoke-tested (index + assets served, HTTP 200).
- ✅ Bigint-only policy enforced by tests; claim success gated on receipt
  status; wrong-chain writes blocked (unit-tested).
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
