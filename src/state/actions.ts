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
import type { PendingCheck } from '../engine/checks.ts';
import { cravingReward, type FightResult } from '../engine/fight.ts';
import type { CravingLevel, LocationTag } from '../engine/types.ts';
import { WINS_PER_SKIP_PASS, XP_REWARDS } from '../engine/xp.ts';
import { now } from './clock.ts';

export const LOCK_REDUCTION_MIN = 5;
export const MAX_LOCK_REDUCTIONS = 3;
/** Honesty check: how long the user has to respond. */
export const CHECK_DEADLINE_MS = 5 * 60_000;
const CHECK_IN_XP_COOLDOWN_MS = 2 * 3_600_000;

export interface Reward {
  xp: number;
  multiplier: number;
  completed: boolean;
  skipPass: boolean;
}

/**
 * Logs a craving the user got through. Callers pass live (never simulated) readings:
 * this row becomes training data for the personal model.
 */
export function resistCraving(opts: {
  result: FightResult;
  /** Only a stress level the user actually reported; null if they didn't. */
  stress: number | null;
  location: LocationTag;
  predictedRisk: number;
  streakDays: number;
}): Reward {
  const { xp, multiplier, completed } = cravingReward(opts.result, opts.streakDays);
  logCraving({
    at: now(),
    stress: opts.stress,
    location: opts.location,
    predictedRisk: opts.predictedRisk,
    outcome: 'RESISTED',
    interventionCompleted: completed,
  });
  if (xp > 0) addXp(xp);
  let skipPass = false;
  if (completed && countInterventionWins() % WINS_PER_SKIP_PASS === 0) {
    const p = getProfile();
    if (p) updateProfile({ skipPasses: p.skipPasses + 1 });
    skipPass = true;
  }
  return { xp, multiplier, completed, skipPass };
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
export function getPendingCheck(): PendingCheck | null {
  return kvGet<PendingCheck>('pending_check');
}

export function issueHonestyCheck(deadlineMs = CHECK_DEADLINE_MS): void {
  const at = now();
  kvSet('pending_check', { issuedAt: at, deadline: at + deadlineMs });
  kvSet('last_check_issued_at', at);
}

/** The user opened the breath test: give them time to finish it even if the deadline passes. */
export function startHonestyAttempt(): void {
  const pending = getPendingCheck();
  if (pending && pending.attemptStartedAt == null) kvSet('pending_check', { ...pending, attemptStartedAt: now() });
}

/** Returns false (and awards nothing) if there was no open check to pass. */
export function passHonestyCheck(): boolean {
  if (!getPendingCheck()) return false;
  kvDelete('pending_check');
  addXp(XP_REWARDS.BREATH_TEST);
  return true;
}

export function spendSkipPass(): boolean {
  const p = getProfile();
  if (!p || p.skipPasses <= 0) return false;
  updateProfile({ skipPasses: p.skipPasses - 1 });
  kvDelete('pending_check');
  return true;
}

/** The deadline passed while the app was closed or hidden: lapse without a lock. */
export function expireHonestyCheck(): void {
  kvDelete('pending_check');
  kvSet('last_check_expired_at', now());
}

/** The deadline passed while the app was on screen: skipping counts the same as a slip. */
export function missHonestyCheck(): void {
  const p = getProfile();
  kvDelete('pending_check');
  startLock('MISSED_CHECKIN', now(), p?.lockMinutes ?? 30);
}
