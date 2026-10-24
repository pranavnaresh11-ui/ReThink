import { XP_REWARDS, streakMultiplier } from './xp.ts';

/** How a craving boss fight ended, judged from the boss's remaining HP. */
export type FightResult = 'DEFEATED' | 'WEAKENED' | 'UNTOUCHED';

/** Three hits of 100/3 can leave a sliver of floating-point HP; that still counts as a win. */
const DEFEAT_EPSILON = 0.5;
/** An exhale this fraction of the phase long lands a full hit. */
const FULL_HIT_FRACTION = 0.6;

/**
 * Damage from one exhale phase: a full share of the boss's HP for blowing at least 60% of
 * the phase, proportionally less for shorter blows.
 */
export function strikeDamage(blowSecs: number, exhaleSecs: number, cycles: number): number {
  if (blowSecs <= 0) return 0;
  return (100 / cycles) * Math.min(1, blowSecs / (exhaleSecs * FULL_HIT_FRACTION));
}

export function fightResult(hp: number): FightResult {
  if (hp <= DEFEAT_EPSILON) return 'DEFEATED';
  if (hp < 100) return 'WEAKENED';
  return 'UNTOUCHED';
}

export interface CravingReward {
  xp: number;
  multiplier: number;
  /** Only a defeated boss counts as a completed intervention (and toward skip passes). */
  completed: boolean;
}

/**
 * Full XP for beating the boss, half for weakening it, nothing if no breathing was
 * detected. The craving is still logged as resisted either way: that's real data.
 */
export function cravingReward(result: FightResult, streakDays: number): CravingReward {
  const multiplier = streakMultiplier(streakDays);
  const base = result === 'DEFEATED' ? XP_REWARDS.BOSS_WIN : result === 'WEAKENED' ? XP_REWARDS.BOSS_WIN / 2 : 0;
  return { xp: Math.round(base * multiplier), multiplier, completed: result === 'DEFEATED' };
}

/** Minimum blow for the 15-second honesty breath test. */
export const CHECK_MIN_BLOW_SECS = 4;
/** Share of the total exhale time needed to earn lock time back. */
export const REDUCE_MIN_BLOW_FRACTION = 0.4;

export function breathExercisePassed(kind: 'check' | 'reduce', blowSecs: number, maxBlowSecs: number): boolean {
  return kind === 'check' ? blowSecs >= CHECK_MIN_BLOW_SECS : blowSecs >= maxBlowSecs * REDUCE_MIN_BLOW_FRACTION;
}
