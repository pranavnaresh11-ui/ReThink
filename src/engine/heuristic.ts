import { circularMinuteDistance, type FeatureVector } from './features.ts';

/**
 * Population prior for when teens tend to vape: after waking, passing periods, lunch,
 * dismissal and before bed. Used only during cold start, before we know this user.
 */
export const HABIT_PEAKS = [
  { minute: 7 * 60 + 15, weight: 0.75, spread: 45, label: 'After waking' },
  { minute: 10 * 60 + 5, weight: 0.4, spread: 25, label: 'Passing period' },
  { minute: 12 * 60 + 20, weight: 0.6, spread: 35, label: 'Lunch' },
  { minute: 15 * 60 + 15, weight: 1.0, spread: 45, label: 'Dismissal' },
  { minute: 22 * 60 + 30, weight: 0.85, spread: 75, label: 'Before bed' },
];

export function habitPrior(minute: number): number {
  let best = 0;
  for (const p of HABIT_PEAKS) {
    const d = circularMinuteDistance(minute, p.minute);
    best = Math.max(best, p.weight * Math.exp(-(d * d) / (2 * p.spread ** 2)));
  }
  return best;
}

export const HEURISTIC_WEIGHTS = {
  bias: -4.4,
  withdrawal: 3.4,
  stress: 2.4,
  habit: 1.9,
  context: 1.6,
};

/**
 * Clinical cold-start curve. Withdrawal pressure is scaled by baseline dependence (F0):
 * a heavier user feels the same nicotine drop more strongly.
 */
export function heuristicLogit(f: FeatureVector, minute: number, dependence: number) {
  const terms = {
    withdrawal: HEURISTIC_WEIGHTS.withdrawal * f.D * (0.5 + dependence),
    stress: HEURISTIC_WEIGHTS.stress * f.S,
    habit: HEURISTIC_WEIGHTS.habit * habitPrior(minute),
    context: HEURISTIC_WEIGHTS.context * f.C,
  };
  const z = HEURISTIC_WEIGHTS.bias + terms.withdrawal + terms.stress + terms.habit + terms.context;
  return { z, terms };
}
