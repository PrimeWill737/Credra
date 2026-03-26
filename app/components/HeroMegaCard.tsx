"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

const TRUST_TARGET = 78;
const INCOME_TARGET = 12;
const SPEND_TARGET = -4;
const RING_DEG_AT_TARGET = 252;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HeroMegaCard() {
  const [trust, setTrust] = useState(0);
  const [income, setIncome] = useState(0);
  const [spend, setSpend] = useState(0);
  const [fraudOpacity, setFraudOpacity] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: "-8% 0px -8% 0px",
        threshold: [0, 0.15, 0.3],
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) {
      cancelAnimationFrame(rafRef.current);
      setTrust(0);
      setIncome(0);
      setSpend(0);
      setFraudOpacity(0);
      return;
    }

    if (prefersReducedMotion()) {
      setTrust(TRUST_TARGET);
      setIncome(INCOME_TARGET);
      setSpend(SPEND_TARGET);
      setFraudOpacity(1);
      return;
    }

    const durationMs = 2200;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const e = easeOutCubic(t);

      setTrust(Math.round(TRUST_TARGET * e));
      setIncome(Math.round(INCOME_TARGET * e));
      setSpend(Math.round(SPEND_TARGET * e));
      setFraudOpacity(Math.min(1, Math.max(0, (e - 0.55) / 0.45)));

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setTrust(TRUST_TARGET);
        setIncome(INCOME_TARGET);
        setSpend(SPEND_TARGET);
        setFraudOpacity(1);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isVisible]);

  const ringDeg = TRUST_TARGET > 0 ? (RING_DEG_AT_TARGET / TRUST_TARGET) * trust : 0;

  return (
    <aside ref={cardRef} className="hero-mega__card" aria-label="Example decision output">
      <div className="hero-mega__card-top">
        <p className="hero-mega__card-label">Decision preview</p>
        <span className="hero-mega__pill">Review lane</span>
      </div>
      <div className="hero-mega__score-row">
        <div className="hero-mega__ring-wrap">
          <div
            className="hero-mega__ring hero-mega__ring--dynamic"
            style={{ "--ring-deg": `${ringDeg}deg` } as CSSProperties}
          >
            <div className="hero-mega__ring-inner">
              <span className="hero-mega__score-num">{trust}</span>
            </div>
          </div>
        </div>
        <div className="hero-mega__score-copy">
          <p className="hero-mega__score-title">Trust index</p>
          <p className="hero-mega__score-desc">
            Inflow stability up week-over-week · spend volatility within band · no
            high-risk velocity spikes in the last 30 days.
          </p>
        </div>
      </div>
      <div className="hero-mega__stats">
        <div className="hero-mega__stat">
          <div className="hero-mega__stat-val">
            {income === 0 ? "0" : `+${income}`}
          </div>
          <div className="hero-mega__stat-key">Income</div>
        </div>
        <div className="hero-mega__stat">
          <div className="hero-mega__stat-val">{spend === 0 ? "0" : spend}</div>
          <div className="hero-mega__stat-key">Spend</div>
        </div>
        <div className="hero-mega__stat">
          <div
            className="hero-mega__stat-val hero-mega__stat-val--fraud"
            style={{ opacity: fraudOpacity }}
          >
            Low
          </div>
          <div className="hero-mega__stat-key">Fraud</div>
        </div>
      </div>
    </aside>
  );
}
