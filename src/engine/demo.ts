import { MS_PER_DAY, MS_PER_MIN, featuresAt, isWeekend, minuteOfDay, nicotineDecay, startOfDay } from './features.ts';
import { heuristicLogit } from './heuristic.ts';
import { sigmoid } from './logistic.ts';
import type { CheckIn, CravingEvent, History, LocationTag } from './types.ts';

interface Slot {
  minute: number;
  jitter: number;
  chance: number;
  location: LocationTag;
  stress: number;
}

const WEEKDAY: Slot[] = [
  { minute: 7 * 60 + 35, jitter: 15, chance: 0.6, location: 'HOME', stress: 3 },
  // 2nd-period bathroom pass: this user's own habit, not in the population prior.
  { minute: 9 * 60 + 40, jitter: 12, chance: 0.8, location: 'SCHOOL', stress: 3 },
  { minute: 15 * 60 + 15, jitter: 12, chance: 1, location: 'SCHOOL', stress: 4 },
  // After-dinner gaming, earlier than the typical bedtime peak.
  { minute: 20 * 60 + 15, jitter: 20, chance: 0.85, location: 'HOME', stress: 3 },
];
const WEEKEND: Slot[] = [
  { minute: 14 * 60, jitter: 50, chance: 0.6, location: 'SOCIAL', stress: 2 },
  { minute: 23 * 60, jitter: 35, chance: 0.8, location: 'SOCIAL', stress: 3 },
];

/**
 * Day offsets (from tracking start) and weekday slot index of the demo user's early slips.
 * They also slip on the evening before "today", so the demo opens with withdrawal building
 * and tomorrow's habit windows forecast as high risk.
 */
const RELAPSES: [day: number, weekdaySlot: number][] = [
  [1, 2],
  [2, 3],
  [5, 2],
  [9, 2],
];

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoData {
  history: History;
  cravings: Omit<CravingEvent, 'id'>[];
  checkIns: Omit<CheckIn, 'id'>[];
}

/**
 * Two weeks of a plausible high-schooler: strongest pull at 3:15 dismissal, plus waking,
 * a 2nd-period bathroom pass and after-dinner gaming on weekdays, and late social
 * evenings on weekends.
 */
export function generateDemoHistory(now: number, days = 14, dependence = 0.58): DemoData {
  const random = rng(42);
  const trackingStart = startOfDay(now) - (days - 1) * MS_PER_DAY + 7 * 60 * MS_PER_MIN;
  const cravings: Omit<CravingEvent, 'id'>[] = [];
  const checkIns: Omit<CheckIn, 'id'>[] = [];

  let lastUse = trackingStart;
  for (let d = 0; d < days; d++) {
    const day = startOfDay(trackingStart) + d * MS_PER_DAY;
    const weekend = isWeekend(day + 12 * 3600_000);
    const slots = weekend ? WEEKEND : WEEKDAY;
    // Some days are just harder (tests, arguments): 1 = calm, 5 = rough.
    const dayStress = weekend ? 1 + Math.round(random() * 2) : 2 + Math.round(random() * 3);

    for (const [minute, offset] of [
      [8 * 60 + 5, 0],
      [19 * 60 + 30, -1],
    ] as const) {
      const at = day + (minute + Math.round(random() * 30)) * MS_PER_MIN;
      if (at < trackingStart || at > now || random() < 0.2) continue;
      checkIns.push({
        at,
        stress: Math.min(5, Math.max(1, dayStress + offset + Math.round(random() - 0.5))),
        location: weekend ? 'HOME' : minuteOfDay(at) < 15 * 60 ? 'SCHOOL' : 'HOME',
        cravingNow: 0,
      });
    }

    slots.forEach((slot, i) => {
      const minute = slot.minute + (random() * 2 - 1) * slot.jitter;
      const at = day + Math.round(minute) * MS_PER_MIN;
      if (at < trackingStart || at > now) return;
      const lastNight = d === days - 2 && i === slots.length - 1;
      const forcedRelapse = lastNight || (!weekend && RELAPSES.some(([rd, rs]) => rd === d && rs === i));
      // The synthetic world is causal: withdrawal and stressful days both raise the odds.
      const withdrawal = nicotineDecay((at - lastUse) / MS_PER_MIN);
      const chance = slot.chance * (0.45 + 0.7 * withdrawal) * (0.55 + 0.15 * dayStress);
      if (!forcedRelapse && random() > chance) return;
      cravings.push({
        at,
        stress: Math.min(5, Math.max(1, Math.round((slot.stress + dayStress) / 2 + random() - 0.3))),
        location: slot.location,
        predictedRisk: 0,
        outcome: forcedRelapse ? 'RELAPSED' : 'RESISTED',
        interventionCompleted: !forcedRelapse && random() < 0.75,
      });
      if (forcedRelapse) lastUse = at;
    });
  }

  cravings.sort((a, b) => a.at - b.at);
  checkIns.sort((a, b) => a.at - b.at);
  const history: History = {
    trackingStart,
    quitStart: trackingStart,
    dependence,
    cravings: cravings.map((c, i) => ({ ...c, id: i + 1 })),
    checkIns: checkIns.map((c, i) => ({ ...c, id: i + 1 })),
  };

  // What the cold-start engine would have predicted at the time of each logged craving.
  for (const c of cravings) {
    const snap = featuresAt(history, c.at, c.location);
    c.predictedRisk = sigmoid(heuristicLogit(snap.features, snap.minute, dependence).z);
  }
  return { history, cravings, checkIns };
}
