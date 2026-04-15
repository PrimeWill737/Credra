"use client";

import styles from "./flash-notices.module.scss";

export function FlashNotices({
  error,
  success,
  onDismissError,
  onDismissSuccess,
  variant = "fixed",
}: {
  error: string;
  success: string;
  onDismissError: () => void;
  onDismissSuccess: () => void;
  /** `fixed` = top-right toast; `inline` = in document flow near buttons */
  variant?: "fixed" | "inline";
}) {
  if (!error && !success) return null;
  const wrapClass =
    variant === "inline" ? `${styles.wrap} ${styles.wrapInline}` : styles.wrap;
  return (
    <div className={wrapClass}>
      {error ? (
        <div className={styles.badgeError} role="alert">
          <button
            type="button"
            className={styles.dismiss}
            onClick={onDismissError}
            aria-label="Dismiss message"
          >
            ×
          </button>
          {error}
        </div>
      ) : null}
      {success ? (
        <div className={styles.badgeSuccess} role="status">
          <button
            type="button"
            className={styles.dismiss}
            onClick={onDismissSuccess}
            aria-label="Dismiss message"
          >
            ×
          </button>
          {success}
        </div>
      ) : null}
    </div>
  );
}
