import { useSyncExternalStore } from 'react';
import type { LocationTag } from '../engine/types.ts';

/** Sensor overrides for demos: when enabled, these replace the live feature values. */
export interface SimState {
  enabled: boolean;
  /** 0 = Sunday */
  weekday: number;
  minute: number;
  minutesSinceUse: number;
  stress: number;
  location: LocationTag;
}

/** Today if it's a school day, otherwise Monday. */
export function nextSchoolDay(): number {
  const d = new Date().getDay();
  return d === 0 || d === 6 ? 1 : d;
}

let state: SimState = { enabled: false, weekday: nextSchoolDay(), minute: 10 * 60 + 45, minutesSinceUse: 30, stress: 0.2, location: 'SCHOOL' };
const listeners = new Set<() => void>();

export function setSim(patch: Partial<SimState>): void {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export function useSim(): SimState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
