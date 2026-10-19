import { kvGet, kvSet } from '../db/repo.ts';

/**
 * App-wide clock with a "time machine" offset, so a demo can jump ahead to show recovery
 * milestones, lock expiry and model hand-over without waiting days.
 */
let offset = 0;

export const now = (): number => Date.now() + offset;
export const clockOffset = (): number => offset;

export function initClock(): void {
  offset = kvGet<number>('clock_offset_ms') ?? 0;
}

export function warp(ms: number): void {
  offset += ms;
  kvSet('clock_offset_ms', offset);
}

export function resetClock(): void {
  offset = 0;
  kvSet('clock_offset_ms', 0);
}
