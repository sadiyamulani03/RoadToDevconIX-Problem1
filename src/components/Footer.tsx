import { useReferenceContract } from "../hooks/useReferenceContract";
import { truncateAddress } from "../lib/format";

export function Footer() {
  const { address, source } = useReferenceContract();

  return (
    <footer className="footer">
      <p className="footer__note">
        Play-money forecasting for the college chai corner. No real funds -
        Base Sepolia testnet only.
      </p>
      <p className="footer__meta">
        {address ? (
          <>
            Contract <code>{truncateAddress(address, 6)}</code> (
            {source === "env" ? "build-time default" : "this device"})
          </>
        ) : (
          "Contract not configured"
        )}
      </p>
      <p className="footer__meta">
        Unverifiable data is shown as an explicit error and never invented.
        Built for Road to Devcon 9 - Problem 1.
      </p>
    </footer>
  );
}
