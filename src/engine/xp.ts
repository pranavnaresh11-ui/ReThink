/** XP needed to clear level L: ⌊100 · L^1.5⌋. Early levels come fast, later ones need real streaks. */
export function xpForLevel(level: number): number {
  return Math.floor(100 * level ** 1.5);
}

export interface LevelInfo {
  level: number;
  intoLevel: number;
  needed: number;
  progress: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  const needed = xpForLevel(level);
  return { level, intoLevel: remaining, needed, progress: remaining / needed };
}

/** min(3.0, 1 + 0.1 · StreakDays) */
export function streakMultiplier(streakDays: number): number {
  return Math.min(3, 1 + 0.1 * Math.max(0, streakDays));
}

export const XP_REWARDS = {
  /** Beating a craving with the breathing boss fight. Multiplied by streak. */
  BOSS_WIN: 50,
  CHECK_IN: 10,
  BREATH_TEST: 10,
  /** Logging a slip honestly still earns something, so people keep logging. */
  HONEST_LOG: 5,
  LOCK_BREATHING: 15,
  REFLECTION: 15,
} as const;

/** Every Nth craving won earns a skip pass for a missed check-in. */
export const WINS_PER_SKIP_PASS = 5;

export const RANK_TITLES = ['Spark', 'Ember', 'Breather', 'Clear Sky', 'Tide Turner', 'Storm Breaker', 'Summit', 'Open Air'];

export function rankTitle(level: number): string {
  return RANK_TITLES[Math.min(RANK_TITLES.length - 1, Math.floor((level - 1) / 2))];
}
