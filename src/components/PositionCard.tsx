import { CHAIN_ID } from "../config/chain";
import {
  derivePhase,
  gateClaim,
  heldSide,
  heldSideLabel,
  outcomeLabel,
  type MarketPhase,
} from "../lib/eligibility";
import { computeRealizedPnl, formatTimestamp } from "../lib/format";
import type { PositionView } from "../hooks/useUserPositions";
import { useClaim } from "../hooks/useClaim";
import type { ClaimEligibility } from "../lib/positions";
import { Amount } from "./Amount";
import { ClaimArea } from "./ClaimArea";
import { Pill, type PillTone } from "./Pill";

const PHASE_LABEL: Partial<Record<MarketPhase, string>> = {
  open: "Open",
  closed: "Awaiting resolution",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

const PHASE_TONE: Partial<Record<MarketPhase, PillTone>> = {
  open: "open",
  closed: "closed",
  resolved: "resolved",
  cancelled: "cancelled",
};

export interface PositionCardProps {
  row: PositionView;
  decimals: number;
  decimalsAssumed: boolean;
  nowSeconds: bigint;
  isConnected: boolean;
  walletChainId: number | undefined;
  referenceAddress?: `0x${string}`;
  eligibility?: ClaimEligibility;
  onSwitchNetwork: () => void;
}

/**
 * One position. Claim availability is derived ONLY from contract data
 * (resolved status, winning side, claimed flag, optional contract
 * eligibility read) - never from a client-side timer.
 */
export function PositionCard({
  row,
  decimals,
  decimalsAssumed,
  nowSeconds,
  isConnected,
  walletChainId,
  referenceAddress,
  eligibility,
  onSwitchNetwork,
}: PositionCardProps) {
  const { marketId, market, position, cost } = row;
  const claim = useClaim(referenceAddress, marketId);

  const phase = market ? derivePhase(market, nowSeconds) : undefined;
  const side = position ? heldSide(position) : undefined;

  const gate =
    !market || !position
      ? {
          eligible: false,
          reason:
            "Market data for this position could not be loaded, so claiming is disabled.",
        }
      : gateClaim({
          isConnected,
          walletChainId,
          phase: phase ?? "closed",
          winningOutcome: market.winningOutcome,
          position,
          ...(eligibility ? { contractEligibility: eligibility } : {}),
        });

  const realizedPnl =
    position && position.claimed
      ? computeRealizedPnl(position.claimedPayout, cost?.cost)
      : undefined;

  const wrongChain = isConnected && walletChainId !== CHAIN_ID;
  const showClaimArea =
    phase === "resolved" && position && market && !position.claimed;

  return (
    <article className="card position-card">
      <header className="position-card__head">
        <div className="position-card__title">
          <h3>{market ? market.question : `Market #${marketId.toString()}`}</h3>
          <p className="position-card__meta">
            Market #{marketId.toString()}
            {market ? "" : " \u00b7 market data unavailable"}
          </p>
        </div>
        <div className="position-card__pills">
          {phase ? (
            <Pill tone={PHASE_TONE[phase] ?? "neutral"}>
              {PHASE_LABEL[phase] ?? phase}
            </Pill>
          ) : null}
          {position?.claimed ? <Pill tone="success">Claimed</Pill> : null}
          {market && phase === "resolved" ? (
            <Pill tone={market.winningOutcome === 1 ? "yes" : market.winningOutcome === 2 ? "no" : "neutral"}>
              {outcomeLabel(market.winningOutcome)} won
            </Pill>
          ) : null}
        </div>
      </header>

      {position ? (
        <dl className="position-card__stats">
          <div>
            <dt>Your side</dt>
            <dd>{side ? heldSideLabel(side) : "None"}</dd>
          </div>
          <div>
            <dt>Yes shares</dt>
            <dd>
              <Amount
                value={position.yesShares}
                decimals={decimals}
                assumed={decimalsAssumed}
              />
            </dd>
          </div>
          <div>
            <dt>No shares</dt>
            <dd>
              <Amount
                value={position.noShares}
                decimals={decimals}
                assumed={decimalsAssumed}
              />
            </dd>
          </div>
          <div>
            <dt>Entry cost</dt>
            <dd>
              {cost ? (
                <Amount
                  value={cost.cost}
                  decimals={decimals}
                  assumed={decimalsAssumed}
                />
              ) : (
                <span
                  className="muted"
                  title="The contract's position view does not expose the amount paid, and the log enrichment did not return it."
                >
                  not exposed
                </span>
              )}
            </dd>
          </div>
          {position.claimed ? (
            <div>
              <dt>Payout received</dt>
              <dd>
                <Amount
                  value={position.claimedPayout}
                  decimals={decimals}
                  assumed={decimalsAssumed}
                />
              </dd>
            </div>
          ) : null}
          {realizedPnl !== undefined ? (
            <div>
              <dt>Net result</dt>
              <dd
                className={realizedPnl >= 0n ? "pnl pnl--up" : "pnl pnl--down"}
              >
                <Amount
                  value={realizedPnl}
                  decimals={decimals}
                  assumed={decimalsAssumed}
                  signed
                />
              </dd>
            </div>
          ) : null}
          {market && market.endTime > 0n ? (
            <div>
              <dt>{phase === "open" ? "Closes" : "Closed"}</dt>
              <dd>{formatTimestamp(market.endTime)}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="muted">
          The contract listed this market for your address but did not return a
          readable position struct for it.
        </p>
      )}

      {position && !cost && (phase === "resolved" || position.claimed) ? (
        <p className="muted small">
          Entry cost is not exposed by the contract for this load, so
          profit/loss is withheld rather than estimated.
        </p>
      ) : null}

      {showClaimArea ? (
        <ClaimArea
          controller={claim}
          gate={gate}
          eligibility={eligibility}
          decimals={decimals}
          decimalsAssumed={decimalsAssumed}
          wrongChain={wrongChain}
          onSwitchNetwork={onSwitchNetwork}
        />
      ) : null}
    </article>
  );
}
