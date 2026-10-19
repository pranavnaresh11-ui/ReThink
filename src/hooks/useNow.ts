import { useEffect, useState } from 'react';
import { now } from '../state/clock.ts';

/** Re-renders every `intervalMs` with the app clock (including any time-machine offset). */
export function useNow(intervalMs = 1000): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setT(now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return t;
}
