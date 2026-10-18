import { setAddressOverride } from "../config/contract";
import { truncateAddress } from "../lib/format";
import { useReferenceContract } from "../hooks/useReferenceContract";
import { useTokenDecimals } from "../hooks/useTokenDecimals";
import { useWalletAccount, useWalletActions } from "../wallet/useWallet";
import { chainLabel } from "../config/chain";
import { Notice } from "./Notice";

/**
 * Global status strip. Every degraded state the app can be in is announced
 * here - wrong network, unverified decimals, address from a runtime override -
 * so a user is never left guessing why a button is disabled or a number
 * looks approximate.
 */
export function StatusBanners() {
  const account = useWalletAccount();
  const actions = useWalletActions();
  const { source, address } = useReferenceContract();
  const decimals = useTokenDecimals();

  const warnings = [];

  if (account.isConnected && !account.isOnBaseSepolia) {
    warnings.push(
      <Notice
        key="wrong-chain"
        tone="warning"
        title="Wrong network"
        action={
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void actions.switchToBaseSepolia()}
            disabled={actions.isSwitching}
          >
            {actions.isSwitching ? "Switching\u2026" : "Switch to Base Sepolia"}
          </button>
        }
      >
        <p>
          Your wallet is on {chainLabel(account.chainId)}. Market data is always
          read from Base Sepolia; claiming is blocked until you switch.
        </p>
      </Notice>,
    );
  }

  if (source === "override" && address) {
    warnings.push(
      <Notice
        key="override"
        tone="info"
        title="Using an address added on this device"
        action={
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setAddressOverride(null)}
          >
            Clear
          </button>
        }
      >
        <p>
          Reads are pointed at <code>{truncateAddress(address, 6)}</code> from
          local storage on this device (not the build-time default).
        </p>
      </Notice>,
    );
  }

  if (address && decimals.data?.source === "assumed") {
    warnings.push(
      <Notice key="decimals" tone="warning" title="Token decimals not verified">
        <p>
          The contract did not answer a decimals getter, so amounts are shown
          assuming 18 decimals and are prefixed with "~". Position quantities
          and claim eligibility are unaffected.
        </p>
      </Notice>,
    );
  }

  if (warnings.length === 0) return null;
  return <div className="stack">{warnings}</div>;
}
