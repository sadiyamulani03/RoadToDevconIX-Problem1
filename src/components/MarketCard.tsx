import { bpsToCssPercent, formatRelativeTime, formatShare, formatTimestamp } from "../lib/format";
import { derivePhase } from "../lib/eligibility";
import type { MarketData } from "../lib/markets";
import { Amount } from "./Amount";
import { ClockIcon } from "./Icons";
import { Pill, type PillTone } from "./Pill";

const PHASE_LABEL: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

const PHASE_TONE: Record<string, PillTone> = {
  open: "open",
  closed: "closed",
  resolved: "resolved",
  cancelled: "cancelled",
};

function deadlineText(market: MarketData, nowSeconds: bigint): string {
  const phase = derivePhase(market, nowSeconds);
  if (phase === "open") {
    return market.endTime > 0n
      ? `Closes ${formatRelativeTime(market.endTime, nowSeconds)}`
      : "No deadline set";
  }
  if (phase === "closed") {
    return market.endTime > 0n
      ? `Closed ${formatRelativeTime(market.endTime, nowSeconds)}`
      : "Closed";
  }
  if (phase === "cancelled") return "Cancelled by the club";
  const when =
    market.resolutionTime > 0n ? market.resolutionTime : market.endTime;
  return when > 0n ? `Resolved ${formatTimestamp(when)}` : "Resolved";
}

export interface MarketCardProps {
  market: MarketData;
  decimals: number;
  decimalsAssumed: boolean;
  nowSeconds: bigint;
}

/**
 * One market, rendered from contract data only. Pool splits are computed with
 * integer basis-point math; pool amounts never go through floating point.
 */
export function MarketCard({
  market,
  decimals,
  decimalsAssumed,
  nowSeconds,
}: MarketCardProps) {
  const phase = derivePhase(market, nowSeconds);
  const totalPool = market.totalYes + market.totalNo;
  const yesBps =
    totalPool > 0n ? (market.totalYes * 10_000n) / totalPool : 0n;
  const yesShare = totalPool > 0n ? formatShare(market.totalYes, totalPool) : null;

  return (
    <article className="card market-card" aria-labelledby={`market-${market.id}`}>
      <header className="market-card__head">
        <Pill tone={PHASE_TONE[phase] ?? "neutral"}>{PHASE_LABEL[phase] ?? phase}</Pill>
        <span className="market-card__id">Market #{market.id.toString()}</span>
      </header>

      <h3 className="market-card__question" id={`market-${market.id}`}>
        {market.question}
      </h3>

      <dl className="market-card__pools">
        <div className="pool pool--yes">
          <dt>Yes pool</dt>
          <dd>
            <Amount
              value={market.totalYes}
              decimals={decimals}
              assumed={decimalsAssumed}
            />
          </dd>
        </div>
        <div className="pool pool--no">
          <dt>No pool</dt>
          <dd>
            <Amount
              value={market.totalNo}
              decimals={decimals}
              assumed={decimalsAssumed}
            />
          </dd>
        </div>
      </dl>

      <div
        className="pool-bar"
        role="img"
        aria-label={
          yesShare
            ? `Yes holds ${yesShare} of the pool`
            : "No positions placed yet"
        }
      >
        <div
          className="pool-bar__yes"
          style={{ width: bpsToCssPercent(yesBps) }}
        />
      </div>

      <footer className="market-card__foot">
        <span className="market-card__deadline">
          <ClockIcon width={15} height={15} /> {deadlineText(market, nowSeconds)}
        </span>
        <span className="market-card__split">
          {yesShare ? `${yesShare} yes` : "No pool yet"}
        </span>
      </footer>
    </article>
  );
}
