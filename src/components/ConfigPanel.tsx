import { useState, type FormEvent } from "react";
import { setAddressOverride } from "../config/contract";
import { EXPLORER_URL } from "../config/chain";
import { truncateAddress } from "../lib/format";
import { useReferenceContract } from "../hooks/useReferenceContract";
import { CupIcon, ExternalIcon, ShieldIcon } from "./Icons";
import { Notice } from "./Notice";

/**
 * Reference-contract configuration.
 *
 * The organizers' canonical address ships as a build-time variable
 * (VITE_REFERENCE_CONTRACT_ADDRESS). Because the problem statement itself was
 * behind a login while this project was built, the app also allows pasting
 * the verified address at runtime; it is kept in this device's local storage
 * only. Whatever the source, an unconfigured app says so plainly and shows no
 * invented market data.
 */
export function ConfigPanel() {
  const { source, address } = useReferenceContract();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = setAddressOverride(value);
    if (!result.ok) {
      setError(result.error);
      setSaved(false);
      return;
    }
    setError(undefined);
    setSaved(true);
    setValue("");
  };

  const form = (
    <form className="config__form" onSubmit={submit}>
      <label className="config__label" htmlFor="reference-address">
        Reference contract address (Base Sepolia)
      </label>
      <div className="config__row">
        <input
          id="reference-address"
          className="config__input"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x\u2026"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(undefined);
            setSaved(false);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "reference-address-error" : undefined}
        />
        <button type="submit" className="btn btn--primary">
          Save
        </button>
      </div>
      {error ? (
        <p className="config__error" id="reference-address-error" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="config__saved" role="status">
          Address saved on this device.
        </p>
      ) : null}
      <p className="config__hint">
        <ShieldIcon /> Stored in this browser only. Never paste a private key
        or seed phrase - only a public contract address.
      </p>
    </form>
  );

  if (source === "none") {
    return (
      <section className="card config" aria-labelledby="config-title">
        <div className="config__head">
          <span className="config__logo">
            <CupIcon width={22} height={22} />
          </span>
          <div>
            <h2 className="config__title" id="config-title">
              Point the terminal at the chai-stall contract
            </h2>
            <p className="config__lead">
              This dashboard reads the official Road to Devcon 9 prediction
              market on Base Sepolia. The organizers' canonical address is
              loaded from{" "}
              <code>VITE_REFERENCE_CONTRACT_ADDRESS</code> at build time - if
              it is missing, paste the verified address from the problem
              statement here instead.
            </p>
          </div>
        </div>
        <Notice tone="warning" title="No contract configured yet">
          <p>
            Without an address there is nothing to read, and this app will not
            substitute mock data. Paste the official address below or set the
            build-time variable and redeploy.
          </p>
        </Notice>
        {form}
        <p className="config__links">
          <a
            href="https://www.loops.house/road-to-devcon-ix"
            target="_blank"
            rel="noopener noreferrer"
          >
            Road to Devcon 9 event page <ExternalIcon width={14} height={14} />
          </a>
        </p>
      </section>
    );
  }

  return (
    <details className="config config--compact">
      <summary>
        Contract {truncateAddress(address ?? "", 6)} ({source === "env" ? "build-time default" : "saved on this device"})
      </summary>
      <div className="config__body">
        <p className="config__hint">
          <a
            href={`${EXPLORER_URL}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on BaseScan <ExternalIcon width={14} height={14} />
          </a>
        </p>
        {form}
      </div>
    </details>
  );
}
