import { formatSignedUnits, formatUnitsCompact, formatUnitsExact } from "../lib/format";

export interface AmountProps {
  value: bigint;
  decimals: number;
  /** True when the decimals were not verified from the contract. */
  assumed?: boolean;
  signed?: boolean;
  compact?: boolean;
}

/**
 * Renders a raw on-chain integer amount. The exact value is always available
 * on hover/inspection; when decimals could not be read from the contract the
 * displayed value is prefixed with "~" and the tooltip says so explicitly.
 */
export function Amount({
  value,
  decimals,
  assumed = false,
  signed = false,
  compact = true,
}: AmountProps) {
  const exact = formatUnitsExact(value, decimals);
  const display = signed
    ? formatSignedUnits(value, decimals)
    : compact
      ? formatUnitsCompact(value, decimals)
      : exact;

  const title = assumed
    ? `Unverified decimals: shown assuming ${decimals}. Exact raw value: ${value.toString()} base units.`
    : `Exact: ${exact}`;

  return (
    <span className="amount" title={title}>
      {assumed ? "~" : ""}
      {display}
    </span>
  );
}
