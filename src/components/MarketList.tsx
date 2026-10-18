import { FALLBACK_DECIMALS } from "../config/chain";
import { formatRelativeTime } from "../lib/format";
import { derivePhase } from "../lib/eligibility";
import { useMarkets } from "../hooks/useMarkets";
import { useNowSeconds } from "../hooks/useNowSeconds";
import { useTokenDecimals } from "../hooks/useTokenDecimals";
import { ConfigPanel } from "./ConfigPanel";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { RefreshIcon } from "./Icons";
import { MarketCard } from "./MarketCard";
import { Notice } from "./Notice";
import { CardSkeletonList } from "./Skeleton";

export function MarketList() {
  const markets = useMarkets();
  const decimalsQuery = useTokenDecimals();
  const nowSeconds = useNowSeconds();

  if (!markets.isConfigured) {
    return <ConfigPanel />;
  }

  if (markets.isPending) {
    return <CardSkeletonList />;
  }

  if (markets.isError && !markets.data) {
    return (
      <ErrorState
        error={markets.error}
        context="Loading markets failed."
        onRetry={() => void markets.refetch()}
      />
    );
  }

  const feed = markets.data;
  const decimals = decimalsQuery.data?.decimals ?? FALLBACK_DECIMALS;
  const decimalsAssumed = decimalsQuery.data?.source === "assumed";

  const sorted = [...feed.markets].sort((a, b) =>
    a.id === b.id ? 0 : a.id > b.id ? -1 : 1,
  );
  const openMarkets = sorted.filter(
    (market) => derivePhase(market, nowSeconds) === "open",
  );
  const hiddenCount = feed.markets.length - openMarkets.length;
  const updatedSeconds = BigInt(Math.round(markets.dataUpdatedAt / 1000));

  return (
    <div className="stack">
      <div className="list-head">
        <p className="list-head__title">
          {openMarkets.length} open market{openMarkets.length === 1 ? "" : "s"}
        </p>
        <div className="list-head__right">
          <span className="list-head__updated">
            Updated {formatRelativeTime(updatedSeconds, nowSeconds)}
          </span>
          <button
            type="button"
            className="btn btn--icon"
            aria-label="Refresh markets"
            onClick={() => void markets.refetch()}
            disabled={markets.isFetching}
          >
            <RefreshIcon
              className={markets.isFetching ? "spin" : undefined}
            />
          </button>
        </div>
      </div>

      {markets.isError && markets.data ? (
        <Notice
          tone="warning"
          title="Showing cached data"
          action={
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void markets.refetch()}
            >
              Retry
            </button>
          }
        >
          <p>
            The latest refresh failed, so the markets below are from the last
            successful read.
          </p>
        </Notice>
      ) : null}

      {feed.truncated ? (
        <Notice tone="info" title="Showing the most recent markets">
          <p>
            This stall has more markets than the dashboard reads at once; the
            200 most recent are shown.
          </p>
        </Notice>
      ) : null}

      {openMarkets.length === 0 ? (
        <EmptyState title="No markets are open right now">
          <p>
            {hiddenCount > 0
              ? `The contract has ${hiddenCount} market${hiddenCount === 1 ? "" : "s"} that ${
                  hiddenCount === 1 ? "is" : "are"
                } closed or resolved. New questions appear here as soon as the club opens them.`
              : "Nothing open at the stall yet. New questions appear here as soon as the club opens them."}
          </p>
        </EmptyState>
      ) : (
        <div className="stack">
          {openMarkets.map((market) => (
            <MarketCard
              key={market.id.toString()}
              market={market}
              decimals={decimals}
              decimalsAssumed={decimalsAssumed}
              nowSeconds={nowSeconds}
            />
          ))}
        </div>
      )}

      {hiddenCount > 0 && openMarkets.length > 0 ? (
        <p className="muted small">
          {hiddenCount} closed or resolved market
          {hiddenCount === 1 ? " is" : "s are"} hidden; this dashboard shows
          only markets open for participation.
        </p>
      ) : null}
    </div>
  );
}
