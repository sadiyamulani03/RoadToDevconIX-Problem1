export type TabKey = "markets" | "positions";

export function Tabs({
  active,
  onChange,
  positionCount,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  positionCount?: number;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Dashboard views">
      <button
        type="button"
        role="tab"
        id="tab-markets"
        aria-selected={active === "markets"}
        aria-controls="panel-markets"
        className={`tabs__tab ${active === "markets" ? "tabs__tab--active" : ""}`}
        onClick={() => onChange("markets")}
      >
        Open markets
      </button>
      <button
        type="button"
        role="tab"
        id="tab-positions"
        aria-selected={active === "positions"}
        aria-controls="panel-positions"
        className={`tabs__tab ${
          active === "positions" ? "tabs__tab--active" : ""
        }`}
        onClick={() => onChange("positions")}
      >
        My positions
        {positionCount !== undefined ? (
          <span className="tabs__count">{positionCount}</span>
        ) : null}
      </button>
    </div>
  );
}
