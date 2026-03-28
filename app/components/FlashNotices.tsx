"use client";

import styles from "./flash-notices.module.scss";

export function FlashNotices({
  error,
  success,
  onDismissError,
  onDismissSuccess,
}: {
  error: string;
  success: string;
  onDismissError: () => void;
  onDismissSuccess: () => void;
}) {
  if (!error && !success) return null;
  return (
    <div className={styles.wrap}>
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
