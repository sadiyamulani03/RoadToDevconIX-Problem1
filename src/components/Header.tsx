import { CupIcon } from "./Icons";
import { WalletButton } from "./WalletButton";

export function Header() {
  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__brand">
          <span className="header__logo" aria-hidden="true">
            <CupIcon width={24} height={24} />
          </span>
          <div>
            <p className="header__title">The Chai-Stall Terminal</p>
            <p className="header__subtitle">Base Sepolia &middot; play tokens only</p>
          </div>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}
