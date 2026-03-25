"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type RevealVariant = "auto" | "left" | "right" | "fade";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Extra delay for staggered scroll reveals. */
  delayMs?: number;
  /**
   * Motion axis: `auto` = vertical from scroll direction; `left` / `right` = horizontal slide;
   * `fade` = depth + blur, minimal travel.
   */
  variant?: RevealVariant;
};

/** Heuristic: which way the section is entering the viewport (scroll down vs scroll up). */
function enterDirection(entry: IntersectionObserverEntry): "up" | "down" {
  const r = entry.boundingClientRect;
  const mid = r.top + r.height / 2;
  const vMid = window.innerHeight / 2;
  return mid > vMid ? "down" : "up";
}

export function Reveal({
  children,
  className = "",
  delayMs = 0,
  variant = "auto",
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [enterFrom, setEnterFrom] = useState<"up" | "down">("down");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (variant === "auto") {
            setEnterFrom(enterDirection(entry));
          }
          setVisible(true);
        } else {
          setVisible(false);
        }
      },
      {
        rootMargin: "-4% 0px -8% 0px",
        threshold: [0, 0.06, 0.14],
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [variant]);

  const style = {
    "--reveal-delay": `${delayMs}ms`,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      style={style}
      data-variant={variant}
      {...(variant === "auto" ? { "data-enter": enterFrom } : {})}
      className={`reveal ${visible ? "reveal--visible" : ""} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
