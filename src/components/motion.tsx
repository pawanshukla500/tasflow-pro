import { useEffect, useRef, useState } from "react";

/** Animated number that counts up to `value` whenever it changes. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display}</>;
}
