import { useMemo, useSyncExternalStore } from 'react';
import { getVersion, kvGet, kvSet, subscribe } from '../db/repo.ts';
import { resetClock } from './clock.ts';
import { setSim } from './simulator.ts';

/**
 * Judge mode unlocks the Lab: sensor overrides, the time machine and the database browser.
 * It's a demo switch, not security. Anyone holding the phone can turn it on, the same way
 * they could clear the site's data. It exists so ordinary users don't wander into tools
 * that fake the clock and so a lock can't be skipped by accident.
 *
 * Turn it on with `?judge=1` in the URL (or by exploring with the demo user); turn it off
 * from the Lab or with `?judge=0`.
 */
const KEY = 'judge_mode';

/** `VITE_JUDGE_MODE=off npm run build` makes a build with no Lab, time machine or `?judge`. */
export const JUDGE_MODE_AVAILABLE = import.meta.env.VITE_JUDGE_MODE !== 'off';

export const isJudgeMode = (): boolean => JUDGE_MODE_AVAILABLE && kvGet<boolean>(KEY) === true;

export function setJudgeMode(on: boolean): void {
  kvSet(KEY, on);
  if (!on) {
    // Leaving judge mode puts everything back on real, unsimulated time.
    setSim({ enabled: false });
    resetClock();
  }
}

/** Reads `?judge=1` / `?judge=0` once at startup, then removes it from the address bar. */
export function applyJudgeParam(): void {
  const url = new URL(window.location.href);
  const value = url.searchParams.get('judge');
  if (value == null) return;
  // Builds without judge mode still strip the flag, so it never lingers in the address bar.
  if (JUDGE_MODE_AVAILABLE && (value === '1' || value === 'on')) setJudgeMode(true);
  else if (value === '0' || value === 'off') setJudgeMode(false);
  url.searchParams.delete('judge');
  window.history.replaceState(null, '', url);
}

export function useJudgeMode(): boolean {
  const version = useSyncExternalStore(subscribe, getVersion);
  return useMemo(() => isJudgeMode(), [version]);
}
