import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  /** Total animation duration in ms. Default 1200. */
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// easeOutCubic — sobe rápido e desacelera no final; sensação clara de contagem.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Anima de um valor de partida (0 no primeiro render, ou o último valor
 * exibido quando `value` muda) até `value`, com easeOutCubic.
 */
export function CountUp({ value, duration = 1200, format, className, style }: Props) {
  const to = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(0);
  const displayRef = useRef<number>(0);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (prefersReducedMotion()) {
      setDisplay(to);
      displayRef.current = to;
      return;
    }

    const from = displayRef.current;
    if (from === to) return;

    fromRef.current = from;
    const isInt = Number.isInteger(to) && Number.isInteger(from);
    const start = performance.now();
    const delta = to - from;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);
      const current = from + delta * eased;
      setDisplay(isInt ? Math.round(current) : current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        displayRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [to, duration]);

  return (
    <span className={className} style={style}>
      {format ? format(display) : display}
    </span>
  );
}
