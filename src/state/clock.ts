import { kvGet, kvSet, rebaseFutureLock } from '../db/repo.ts';

/**
 * App-wide clock with a "time machine" offset, so a demo can jump ahead to show recovery
 * milestones, lock expiry and model hand-over without waiting days. The offset only
 * applies in judge mode; otherwise the app always runs on real time.
 */
let offset = 0;

export const now = (): number => Date.now() + offset;
export const clockOffset = (): number => offset;

export function initClock(allowOffset: boolean): void {
  offset = allowOffset ? (kvGet<number>('clock_offset_ms') ?? 0) : 0;
  // Outside judge mode, drop any leftover jump so it can't shorten a lock.
  if (!allowOffset && (kvGet<number>('clock_offset_ms') ?? 0) !== 0) resetClock();
}

export function warp(ms: number): void {
  offset += ms;
  kvSet('clock_offset_ms', offset);
}

export function resetClock(): void {
  offset = 0;
  kvSet('clock_offset_ms', 0);
  rebaseFutureLock(now());
}
