import {
  addXp,
  countInterventionWins,
  getActiveLock,
  getProfile,
  kvDelete,
  kvGet,
  kvSet,
  logCheckIn,
  logCraving,
  reduceLock,
  startLock,
  updateProfile,
} from '../db/repo.ts';
import type { CravingLevel, LocationTag } from '../engine/types.ts';
import { WINS_PER_SKIP_PASS, XP_REWARDS, streakMultiplier } from '../engine/xp.ts';
import { now } from './clock.ts';

export const LOCK_REDUCTION_MIN = 5;
export const MAX_LOCK_REDUCTIONS = 3;
/** Honesty check: how long the user has to respond. */
export const CHECK_DEADLINE_MS = 5 * 60_000;
const CHECK_IN_XP_COOLDOWN_MS = 2 * 3_600_000;

export interface Reward {
  xp: number;
  multiplier: number;
  skipPass: boolean;
}

export function resistCraving(opts: {
  completed: boolean;
  stress: number | null;
  location: LocationTag;
  predictedRisk: number;
  streakDays: number;
}): Reward {
  logCraving({
    at: now(),
    stress: opts.stress,
    location: opts.location,
    predictedRisk: opts.predictedRisk,
    outcome: 'RESISTED',
    interventionCompleted: opts.completed,
  });
  const multiplier = streakMultiplier(opts.streakDays);
  const xp = Math.round((opts.completed ? XP_REWARDS.BOSS_WIN : XP_REWARDS.BOSS_WIN / 2) * multiplier);
  addXp(xp);
  let skipPass = false;
  if (opts.completed && countInterventionWins() % WINS_PER_SKIP_PASS === 0) {
    const p = getProfile();
    if (p) updateProfile({ skipPasses: p.skipPasses + 1 });
    skipPass = true;
  }
  return { xp, multiplier, skipPass };
}

/** Honest relapse log: small XP for honesty, then the accountability lock starts. */
export function logRelapse(opts: { stress: number | null; location: LocationTag; predictedRisk: number }): void {
  const profile = getProfile();
  const at = now();
  const id = logCraving({
    at,
    stress: opts.stress,
    location: opts.location,
    predictedRisk: opts.predictedRisk,
    outcome: 'RELAPSED',
    interventionCompleted: false,
  });
  addXp(XP_REWARDS.HONEST_LOG);
  kvDelete('pending_check');
  startLock('RELAPSE', at, profile?.lockMinutes ?? 30, id);
}

export function submitCheckIn(opts: { stress: number; location: LocationTag; cravingNow: CravingLevel }): number {
  const at = now();
  logCheckIn({ at, ...opts });
  const last = kvGet<number>('last_check_in_xp_at') ?? 0;
  if (at - last < CHECK_IN_XP_COOLDOWN_MS) return 0;
  kvSet('last_check_in_xp_at', at);
  addXp(XP_REWARDS.CHECK_IN);
  return XP_REWARDS.CHECK_IN;
}

/** Shaves 5 minutes off the active lock, up to 3 times per lock. Returns false if capped. */
export function earnLockTime(kind: 'breathing' | 'reflection'): boolean {
  const lock = getActiveLock();
  if (!lock || lock.reducedMinutes >= LOCK_REDUCTION_MIN * MAX_LOCK_REDUCTIONS) return false;
  reduceLock(lock.id, LOCK_REDUCTION_MIN);
  addXp(kind === 'breathing' ? XP_REWARDS.LOCK_BREATHING : XP_REWARDS.REFLECTION);
  return true;
}

// ── honesty check-ins ────────────────────────────────────────────────────────
export interface PendingCheck {
  issuedAt: number;
  deadline: number;
}

export function getPendingCheck(): PendingCheck | null {
  return kvGet<PendingCheck>('pending_check');
}

export function issueHonestyCheck(deadlineMs = CHECK_DEADLINE_MS): void {
  const at = now();
  kvSet('pending_check', { issuedAt: at, deadline: at + deadlineMs });
  kvSet('last_check_issued_at', at);
}

export function passHonestyCheck(): void {
  kvDelete('pending_check');
  addXp(XP_REWARDS.BREATH_TEST);
}

export function spendSkipPass(): boolean {
  const p = getProfile();
  if (!p || p.skipPasses <= 0) return false;
  updateProfile({ skipPasses: p.skipPasses - 1 });
  kvDelete('pending_check');
  return true;
}

/** Called by the monitor when the deadline passes: skipping counts the same as a slip. */
export function missHonestyCheck(): void {
  const p = getProfile();
  kvDelete('pending_check');
  startLock('MISSED_CHECKIN', now(), p?.lockMinutes ?? 30);
}
