"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the element has scrolled into view. */
export function useSeen<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return setSeen(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

/** A counter that goes up every `ms` while `on`, for looping illustrations. Stays at `still` with reduced motion. */
export function useTick(on: boolean, ms: number, still = 0) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (reduced()) return setT(still);
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [on, ms, still]);
  return t;
}

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>(0.15);
  return (
    <div ref={ref} className={`site-reveal ${seen ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Counts up to a number when it first appears. */
export function Count({ to, decimals = 0, duration = 1200 }: { to: number; decimals?: number; duration?: number }) {
  const [ref, seen] = useSeen<HTMLSpanElement>(0.4);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced()) return setN(to);
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}
