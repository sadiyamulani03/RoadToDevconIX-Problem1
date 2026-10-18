import { useState } from "react";
import { useUserPositions } from "./hooks/useUserPositions";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { StatusBanners } from "./components/StatusBanners";
import { Tabs, type TabKey } from "./components/Tabs";
import { MarketList } from "./components/MarketList";
import { PositionsView } from "./components/PositionsView";

function IntroStrip() {
  return (
    <section className="intro" aria-labelledby="intro-title">
      <h1 className="intro__title" id="intro-title">
        Claim the chai. Take a side. Settle up.
      </h1>
      <p className="intro__body">
        The club's forecasting board for the stall: open questions, live pools,
        and settled winnings - read straight from the reference contract on
        Base Sepolia.
      </p>
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("markets");
  const positions = useUserPositions();
  const positionCount = positions.data
    ? positions.data.rows.length
    : undefined;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main className="shell" id="main">
        <StatusBanners />
        <IntroStrip />
        <Tabs
          active={tab}
          onChange={setTab}
          {...(positionCount !== undefined ? { positionCount } : {})}
        />
        {tab === "markets" ? (
          <section
            role="tabpanel"
            id="panel-markets"
            aria-labelledby="tab-markets"
          >
            <MarketList />
          </section>
        ) : (
          <section
            role="tabpanel"
            id="panel-positions"
            aria-labelledby="tab-positions"
          >
            <PositionsView onBrowseMarkets={() => setTab("markets")} />
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
