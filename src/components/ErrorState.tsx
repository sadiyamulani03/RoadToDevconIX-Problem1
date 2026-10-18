import { toUserFacingError } from "../lib/errors";
import { Notice } from "./Notice";

export interface ErrorStateProps {
  error: unknown;
  context?: string;
  onRetry?: () => void;
}

/**
 * Visible failure feedback for any read path. The friendly message is always
 * shown; the technical detail is tucked into a disclosure.
 */
export function ErrorState({ error, context, onRetry }: ErrorStateProps) {
  const friendly = toUserFacingError(error);
  return (
    <Notice
      tone="error"
      title={friendly.title}
      action={
        onRetry ? (
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            Try again
          </button>
        ) : undefined
      }
    >
      <p>
        {context ? `${context} ` : null}
        {friendly.message}
      </p>
      {friendly.detail ? (
        <details className="error-detail">
          <summary>Technical detail</summary>
          <code>{friendly.detail}</code>
        </details>
      ) : null}
    </Notice>
  );
}
