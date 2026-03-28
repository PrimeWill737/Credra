"use client";

import styles from "./loading-overlay.module.scss";

export function LoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className={styles.spinner} aria-hidden />
    </div>
  );
}
