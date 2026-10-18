import type { ReactNode } from "react";
import {
  AlertIcon,
  CheckIcon,
  InfoIcon,
  SpinnerIcon,
} from "./Icons";

export type NoticeTone = "info" | "success" | "warning" | "error" | "pending";

export interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  live?: boolean;
}

function ToneIcon({ tone }: { tone: NoticeTone }) {
  if (tone === "success") return <CheckIcon />;
  if (tone === "warning" || tone === "error") return <AlertIcon />;
  if (tone === "pending") return <SpinnerIcon />;
  return <InfoIcon />;
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
  live = false,
}: NoticeProps) {
  return (
    <div
      className={`notice notice--${tone}`}
      role={tone === "error" ? "alert" : undefined}
      aria-live={live ? "polite" : undefined}
    >
      <span className="notice__icon">
        <ToneIcon tone={tone} />
      </span>
      <div className="notice__body">
        {title ? <p className="notice__title">{title}</p> : null}
        {children ? <div className="notice__content">{children}</div> : null}
      </div>
      {action ? <div className="notice__action">{action}</div> : null}
    </div>
  );
}
