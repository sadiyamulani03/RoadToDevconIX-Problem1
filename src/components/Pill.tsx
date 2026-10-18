import type { ReactNode } from "react";

export type PillTone =
  | "open"
  | "closed"
  | "resolved"
  | "cancelled"
  | "yes"
  | "no"
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export function Pill({
  tone = "neutral",
  children,
  title,
}: {
  tone?: PillTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`pill pill--${tone}`} title={title}>
      {children}
    </span>
  );
}
