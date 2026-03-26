"use client";

import { useEffect, useMemo, useRef } from "react";
import styles from "./signup-success.module.scss";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SignupSuccess({
  onDone,
  title = "Signup Successful",
  subtitle = "Redirecting you to your dashboard…",
  durationMs = 1400,
}: {
  onDone: () => void;
  title?: string;
  subtitle?: string;
  durationMs?: number;
}) {
  const progressRef = useRef<SVGCircleElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const metrics = useMemo(() => {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    return { radius, circumference };
  }, []);

  const neonGreen = "#00c853";
  const trackStroke = "rgba(0, 200, 83, 0.16)";

  useEffect(() => {
    const circle = progressRef.current;
    if (!circle) return;

    const { circumference } = metrics;
    circle.style.strokeDasharray = `${circumference}`;

    const reduced = prefersReducedMotion();
    const start = performance.now();

    const setProgress = (p: number) => {
      const clamped = Math.max(0, Math.min(1, p));
      const dashOffset = circumference * (1 - clamped);
      circle.style.strokeDashoffset = `${dashOffset}`;
    };

    if (reduced) {
      setProgress(1);
      const t = window.setTimeout(onDone, 450);
      return () => {
        window.clearTimeout(t);
      };
    }

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out for a "roll" feel
      const e = 1 - Math.pow(1 - t, 3);
      setProgress(e);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      window.setTimeout(onDone, 300);
    };

    // Start at zero
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [metrics, durationMs, onDone]);

  return (
    <main className={styles.page}>
      <div className={styles.center}>
        <div className={styles.ringWrap} aria-hidden>
          <svg className={styles.ringSvg} width="132" height="132" viewBox="0 0 132 132">
            <circle
              className={styles.ringTrack}
              cx="66"
              cy="66"
              r={metrics.radius}
              fill="none"
              stroke={trackStroke}
              strokeWidth={6}
            />
            <circle
              ref={progressRef}
              className={styles.ringProgress}
              cx="66"
              cy="66"
              r={metrics.radius}
              fill="none"
              stroke={neonGreen}
              strokeWidth={6}
              strokeLinecap="round"
              transform="rotate(-90 66 66)"
              style={{
                strokeDasharray: metrics.circumference,
                strokeDashoffset: metrics.circumference,
              }}
            />
            <path
              className={styles.tick}
              fill="none"
              stroke={neonGreen}
              strokeWidth={5.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M48 68 L62 82 L86 52"
            />
          </svg>
        </div>

        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
    </main>
  );
}

