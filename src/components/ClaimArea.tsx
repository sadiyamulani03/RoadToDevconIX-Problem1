import type { ClaimStage } from "../lib/claimExecution";
import type { ClaimGateResult } from "../lib/eligibility";
import { EXPLORER_URL } from "../config/chain";
import { truncateHash } from "../lib/format";
import type { ClaimController } from "../hooks/useClaim";
import type { ClaimEligibility } from "../lib/positions";
import { Amount } from "./Amount";
import { ExternalIcon, SpinnerIcon } from "./Icons";
import { Notice } from "./Notice";

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      className="tx-link"
      href={`${EXPLORER_URL}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {truncateHash(hash)} <ExternalIcon width={13} height={13} />
    </a>
  );
}

function TxStatus({ stage }: { stage: ClaimStage }) {
  switch (stage.kind) {
    case "idle":
      return null;
    case "simulating":
      return (
        <Notice
          tone="pending"
          live
          title="Checking with the contract"
        >
          <p>
            Confirming the claim is currently valid before asking your wallet
            to sign. Nothing is sent if this step fails.
          </p>
        </Notice>
      );
    case "awaiting-signature":
      return (
        <Notice tone="pending" live title="Waiting for your wallet">
          <p>Approve the transaction in your wallet to send the claim.</p>
        </Notice>
      );
    case "submitted":
    case "confirming":
      return (
        <Notice tone="pending" live title="Transaction submitted">
          <p>
            Waiting for Base Sepolia to mine it. <TxLink hash={stage.hash} />
          </p>
        </Notice>
      );
    case "confirmed":
      return (
        <Notice tone="success" live title="Claim confirmed on-chain">
          <p>
            The contract accepted the claim and the transaction succeeded.{" "}
            <TxLink hash={stage.hash} />
          </p>
        </Notice>
      );
    case "reverted":
      return (
        <Notice tone="error" live title="Transaction reverted">
          <p>
            The transaction was mined but the contract rejected it, so no
            payout was made (only gas was spent). <TxLink hash={stage.hash} />
          </p>
        </Notice>
      );
    case "timeout":
      return (
        <Notice tone="warning" live title="Still pending">
          <p>
            Not mined yet within the wait window. The hash is safe to track;
            do not resend blindly. <TxLink hash={stage.hash} />
          </p>
        </Notice>
      );
    case "failed":
      return (
        <Notice
          tone="error"
          live
          title={stage.rejected ? "Cancelled" : "Claim failed"}
        >
          <p>
            {stage.message}
            {stage.hash ? (
              <>
                {" "}
                <TxLink hash={stage.hash} />
              </>
            ) : null}
          </p>
        </Notice>
      );
    default:
      return null;
  }
}

const BUSY_LABELS: Partial<Record<ClaimStage["kind"], string>> = {
  simulating: "Checking\u2026",
  "awaiting-signature": "Confirm in wallet\u2026",
  submitted: "Submitting\u2026",
  confirming: "Confirming\u2026",
};

export interface ClaimAreaProps {
  controller: ClaimController;
  gate: ClaimGateResult;
  eligibility?: ClaimEligibility;
  decimals: number;
  decimalsAssumed: boolean;
  wrongChain: boolean;
  onSwitchNetwork: () => void;
}

export function ClaimArea({
  controller,
  gate,
  eligibility,
  decimals,
  decimalsAssumed,
  wrongChain,
  onSwitchNetwork,
}: ClaimAreaProps) {
  const busy = controller.isBusy;
  const estimatedPayout =
    eligibility && eligibility.eligible ? eligibility.estimatedPayout : undefined;

  return (
    <div className="claim">
      {estimatedPayout !== undefined ? (
        <p className="claim__estimate">
          Contract estimate:{" "}
          <Amount
            value={estimatedPayout}
            decimals={decimals}
            assumed={decimalsAssumed}
            compact={false}
          />{" "}
          <span className="muted small">
            (the final payout is fixed on-chain when the claim executes)
          </span>
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn--primary btn--wide"
        onClick={() => void controller.claim()}
        disabled={!gate.eligible || busy}
        aria-busy={busy}
      >
        {busy ? <SpinnerIcon /> : null}
        {busy
          ? (BUSY_LABELS[controller.stage.kind] ?? "Working\u2026")
          : "Claim winnings"}
      </button>

      {!gate.eligible && gate.reason ? (
        <p className="claim__reason">{gate.reason}</p>
      ) : null}

      {wrongChain && gate.reason.toLowerCase().includes("switch") ? (
        <button
          type="button"
          className="btn btn--soft"
          onClick={onSwitchNetwork}
        >
          Switch to Base Sepolia
        </button>
      ) : null}

      <TxStatus stage={controller.stage} />
    </div>
  );
}
