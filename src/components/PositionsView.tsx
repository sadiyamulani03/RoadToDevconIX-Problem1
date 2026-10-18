import { FALLBACK_DECIMALS } from "../config/chain";
import { useNowSeconds } from "../hooks/useNowSeconds";
import { useTokenDecimals } from "../hooks/useTokenDecimals";
import { useUserPositions } from "../hooks/useUserPositions";
import { useWalletAccount, useWalletActions } from "../wallet/useWallet";
import { ConfigPanel } from "./ConfigPanel";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { RefreshIcon } from "./Icons";
import { Notice } from "./Notice";
import { PositionCard } from "./PositionCard";
import { CardSkeletonList } from "./Skeleton";

export function PositionsView({ onBrowseMarkets }: { onBrowseMarkets: () => void }) {
  const positions = useUserPositions();
  const decimalsQuery = useTokenDecimals();
  const nowSeconds = useNowSeconds();
  const account = useWalletAccount();
  const actions = useWalletActions();

  if (!positions.isConfigured) {
    return <ConfigPanel />;
  }

  if (!positions.isConnected || !positions.user) {
    return (
      <EmptyState
        title="Connect a wallet to see your positions"
        action={
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void actions.connect()}
            disabled={actions.isConnecting}
          >
            {actions.isConnecting ? "Connecting\u2026" : "Connect wallet"}
          </button>
        }
      >
        <p>
          Positions are looked up by your exact address with{" "}
          <code>getUserMarketIds</code>, so only markets you participated in
          are ever fetched.
        </p>
      </EmptyState>
    );
  }

  if (positions.isPending) {
    return <CardSkeletonList count={2} />;
  }

  if (positions.isError && !positions.data) {
    return (
      <ErrorState
        error={positions.error}
        context="Loading your positions failed."
        onRetry={() => void positions.refetch()}
      />
    );
  }

  const view = positions.data;
  const rows = [...view.rows].sort((a, b) =>
    a.marketId === b.marketId ? 0 : a.marketId > b.marketId ? -1 : 1,
  );
  const decimals = decimalsQuery.data?.decimals ?? FALLBACK_DECIMALS;
  const decimalsAssumed = decimalsQuery.data?.source === "assumed";

  return (
    <div className="stack">
      <div className="list-head">
        <p className="list-head__title">
          {rows.length} position{rows.length === 1 ? "" : "s"} for this wallet
        </p>
        <button
          type="button"
          className="btn btn--icon"
          aria-label="Refresh positions"
          onClick={() => void positions.refetch()}
          disabled={positions.isFetching}
        >
          <RefreshIcon
            className={positions.isFetching ? "spin" : undefined}
          />
        </button>
      </div>

      {positions.isError && positions.data ? (
        <Notice
          tone="warning"
          title="Showing cached positions"
          action={
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void positions.refetch()}
            >
              Retry
            </button>
          }
        >
          <p>The latest refresh failed; these rows are from the last successful read.</p>
        </Notice>
      ) : null}

      {view.eventsWarning ? (
        <Notice tone="warning" title="Entry-cost logs unavailable">
          <p>{view.eventsWarning}</p>
        </Notice>
      ) : null}

      {view.failedMarketIds.length > 0 ? (
        <Notice tone="warning" title="Some position records could not be read">
          <p>
            The contract listed {view.failedMarketIds.length} market
            {view.failedMarketIds.length === 1 ? "" : "s"} for your address but
            did not return a decodable position for{" "}
            {view.failedMarketIds.length === 1 ? "it" : "them"};{" "}
            {view.failedMarketIds.length === 1 ? "it is" : "they are"} shown
            without data instead of guessed values.
          </p>
        </Notice>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No positions for this wallet yet"
          action={
            <button type="button" className="btn btn--soft" onClick={onBrowseMarkets}>
              Browse open markets
            </button>
          }
        >
          <p>
            When you take a side on an open market, it will appear here with
            its live status and any claim you are eligible for.
          </p>
        </EmptyState>
      ) : (
        <div className="stack">
          {rows.map((row) => (
            <PositionCard
              key={row.marketId.toString()}
              row={row}
              decimals={decimals}
              decimalsAssumed={decimalsAssumed}
              nowSeconds={nowSeconds}
              isConnected={account.isConnected}
              walletChainId={account.chainId}
              {...(positions.referenceAddress
                ? { referenceAddress: positions.referenceAddress }
                : {})}
              {...(view.eligibility.get(row.marketId)
                ? { eligibility: view.eligibility.get(row.marketId) }
                : {})}
              onSwitchNetwork={() => void actions.switchToBaseSepolia()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
