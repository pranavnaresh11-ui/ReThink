import type { History } from './types.ts';

export interface Milestone {
  id: string;
  label: string;
  detail: string;
  seconds: number;
  /**
   * Short-term milestones track time since the last nicotine use. Long-term ones use a
   * "recovery clock" that keeps half of earlier progress after a slip.
   */
  longTerm: boolean;
  weight: number;
}

/*
 * Timelines adapted from smoking-cessation guidance (CDC, American Cancer Society).
 * Vape aerosol isn't combusted, so there's no carbon-monoxide milestone here.
 */
export const MILESTONES: Milestone[] = [
  {
    id: 'heart',
    label: 'Heart rate & blood pressure',
    detail: 'Nicotine’s stimulant effect fades and both start falling back toward normal.',
    seconds: 20 * 60,
    longTerm: false,
    weight: 0.1,
  },
  {
    id: 'nicotine',
    label: 'Nicotine cleared',
    detail: 'Nicotine is essentially out of your bloodstream. Taste and smell begin to sharpen.',
    seconds: 48 * 3600,
    longTerm: false,
    weight: 0.15,
  },
  {
    id: 'withdrawal',
    label: 'Withdrawal peak passed',
    detail: 'Physical withdrawal is usually worst in the first 3 days. Cravings get shorter after this.',
    seconds: 72 * 3600,
    longTerm: false,
    weight: 0.15,
  },
  {
    id: 'circulation',
    label: 'Circulation & breathing',
    detail: 'Blood flow improves and exercise starts to feel easier.',
    seconds: 14 * 86400,
    longTerm: true,
    weight: 0.3,
  },
  {
    id: 'cilia',
    label: 'Airway cilia recovering',
    detail: 'The tiny hairs that sweep your airways clean regain function. Less coughing.',
    seconds: 30 * 86400,
    longTerm: true,
    weight: 0.3,
  },
];

/** Quit date followed by every logged relapse, oldest first. */
export function nicotineUses(h: History): number[] {
  return [h.quitStart, ...h.cravings.filter((e) => e.outcome === 'RELAPSED' && e.at > h.quitStart).map((e) => e.at)];
}

export function secondsSinceUse(h: History, now: number): number {
  const uses = nicotineUses(h);
  return Math.max(0, (now - uses[uses.length - 1]) / 1000);
}

/**
 * L_k = s_k + ½·L_(k−1): each slip keeps half of the recovery built up before it.
 * Avoids the "I already ruined it" spiral that full resets cause.
 */
export function longTermSeconds(h: History, now: number): number {
  const uses = nicotineUses(h);
  let carried = 0;
  for (let i = 1; i < uses.length; i++) carried = 0.5 * (carried + (uses[i] - uses[i - 1]) / 1000);
  return carried + Math.max(0, (now - uses[uses.length - 1]) / 1000);
}

export function milestoneProgress(h: History, now: number) {
  const sober = secondsSinceUse(h, now);
  const longTerm = longTermSeconds(h, now);
  return MILESTONES.map((m) => {
    const elapsed = m.longTerm ? longTerm : sober;
    return { ...m, progress: Math.min(1, elapsed / m.seconds), remaining: Math.max(0, m.seconds - elapsed) };
  });
}

/** 0..1 overall lung-avatar health. */
export function lungHealth(h: History, now: number): number {
  return milestoneProgress(h, now).reduce((s, m) => s + m.progress * m.weight, 0);
}

export function streakDays(h: History, now: number): number {
  return Math.floor(secondsSinceUse(h, now) / 86400);
}

/** Rough money not spent: each relapse is counted as half a day's spend. */
export function moneySaved(h: History, now: number, dailyCost: number): number {
  const days = Math.max(0, (now - h.quitStart) / 86_400_000);
  const relapses = nicotineUses(h).length - 1;
  return Math.max(0, days - relapses * 0.5) * dailyCost;
}
