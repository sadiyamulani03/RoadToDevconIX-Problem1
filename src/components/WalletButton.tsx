import { useState } from "react";
import { chainLabel } from "../config/chain";
import { truncateAddress } from "../lib/format";
import { useWalletAccount, useWalletActions } from "../wallet/useWallet";
import { WalletIcon } from "./Icons";

export function WalletButton() {
  const account = useWalletAccount();
  const actions = useWalletActions();
  const [open, setOpen] = useState(false);

  if (!account.isConnected) {
    return (
      <div className="wallet">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void actions.connect()}
          disabled={actions.isConnecting}
        >
          <WalletIcon />
          {actions.isConnecting ? "Connecting\u2026" : "Connect wallet"}
        </button>
        {actions.error ? (
          <p className="wallet__error" role="alert">
            {actions.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wallet">
      <button
        type="button"
        className="wallet__chip"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span
          className={`wallet__dot ${
            account.isOnBaseSepolia ? "wallet__dot--ok" : "wallet__dot--bad"
          }`}
        />
        {truncateAddress(account.address ?? "")}
      </button>
      {open ? (
        <div className="wallet__menu" role="menu">
          <p className="wallet__net">
            {chainLabel(account.chainId)}
            {account.isOnBaseSepolia ? " \u2713" : ""}
          </p>
          {!account.isOnBaseSepolia ? (
            <button
              type="button"
              className="btn btn--soft"
              onClick={() => void actions.switchToBaseSepolia()}
              disabled={actions.isSwitching}
            >
              {actions.isSwitching ? "Switching\u2026" : "Switch to Base Sepolia"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void actions.disconnect()}
          >
            Disconnect
          </button>
        </div>
      ) : null}
      {actions.error ? (
        <p className="wallet__error" role="alert">
          {actions.error}
        </p>
      ) : null}
    </div>
  );
}
