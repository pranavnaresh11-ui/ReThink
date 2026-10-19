import type { History, LocationTag } from './types.ts';

export const MINUTES_PER_DAY = 1440;
export const MS_PER_MIN = 60_000;
export const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MIN;

/** Plasma half-life of nicotine (~2 h). */
export const NICOTINE_HALF_LIFE_MIN = 120;
/** Time constant for withdrawal fading as receptors down-regulate (~72 h). */
export const RECEPTOR_RESET_MIN = 4320;

/** Width of the time-of-day kernel used for the contextual trigger weight. */
const KERNEL_SIGMA_MIN = 45;
/** A stress report is considered "current" for this long. */
const STRESS_MEMORY_MIN = 8 * 60;
const DEFAULT_STRESS = 0.4;

/** The model's input vector X (bias is added by the classifier). */
export interface FeatureVector {
  /** Pharmacokinetic withdrawal pressure, 0..1 */
  D: number;
  /** Cyclical time-of-day encoding, -1..1 */
  Tsin: number;
  Tcos: number;
  /** Self-reported stress, 0..1 */
  S: number;
  /** Contextual trigger weight from this user's own history, 0..1 */
  C: number;
}

/**
 * D_t = (1 − 0.5^(Δt/120)) · e^(−Δt/4320)
 * Rises as blood nicotine clears, then fades as withdrawal passes after ~3 days.
 */
export function nicotineDecay(minutesSinceUse: number): number {
  const dt = Math.max(0, minutesSinceUse);
  return (1 - 0.5 ** (dt / NICOTINE_HALF_LIFE_MIN)) * Math.exp(-dt / RECEPTOR_RESET_MIN);
}

export function minuteOfDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/** Maps minute-of-day onto the unit circle so 23:59 and 00:01 are neighbours. */
export function encodeTimeOfDay(minute: number): { sin: number; cos: number } {
  const angle = (2 * Math.PI * minute) / MINUTES_PER_DAY;
  return { sin: Math.sin(angle), cos: Math.cos(angle) };
}

export function circularMinuteDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % MINUTES_PER_DAY;
  return Math.min(d, MINUTES_PER_DAY - d);
}

export function isWeekend(t: number): boolean {
  const day = new Date(t).getDay();
  return day === 0 || day === 6;
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Fallback when the user hasn't tagged where they are: school hours on weekdays, home otherwise. */
export function inferLocation(t: number): LocationTag {
  const m = minuteOfDay(t);
  return !isWeekend(t) && m >= 7 * 60 + 45 && m < 15 * 60 + 30 ? 'SCHOOL' : 'HOME';
}

/** Most recent nicotine use strictly before `at` (logged relapses, else the quit date). */
export function lastNicotineUse(h: History, at: number): number {
  let last = h.quitStart;
  for (const e of h.cravings) {
    if (e.at >= at) break;
    if (e.outcome === 'RELAPSED' && e.at > last) last = e.at;
  }
  return last;
}

/** Mean of every stress report before `at`, normalised to 0..1. */
export function baselineStress(h: History, at: number): number {
  let sum = 0;
  let n = 0;
  for (const c of h.checkIns) {
    if (c.at >= at) break;
    sum += c.stress;
    n++;
  }
  for (const e of h.cravings) {
    if (e.at >= at) break;
    if (e.stress != null) {
      sum += e.stress;
      n++;
    }
  }
  return n === 0 ? DEFAULT_STRESS : (sum / n - 1) / 4;
}

/** S_t: the latest self-report if it's recent, otherwise the user's baseline. */
export function stressAt(h: History, at: number): number {
  let latestAt = -Infinity;
  let latest = 0;
  for (const c of h.checkIns) {
    if (c.at >= at) break;
    latestAt = c.at;
    latest = c.stress;
  }
  for (const e of h.cravings) {
    if (e.at >= at) break;
    if (e.stress != null && e.at > latestAt) {
      latestAt = e.at;
      latest = e.stress;
    }
  }
  if (at - latestAt <= STRESS_MEMORY_MIN * MS_PER_MIN) return (latest - 1) / 4;
  return baselineStress(h, at);
}

/**
 * C_t: how often this user has craved near this time of day, weighted toward the same
 * weekday and the same place. A circular Gaussian kernel lets it capture several daily
 * peaks (morning, dismissal, bedtime) that a single sin/cos pair cannot.
 * Uses only events strictly before `at`, so training samples never see their own label.
 */
export function contextualTriggerWeight(h: History, at: number, location: LocationTag): number {
  const m = minuteOfDay(at);
  const weekday = new Date(at).getDay();
  const weekend = isWeekend(at);
  let density = 0;
  for (const e of h.cravings) {
    if (e.at >= at) break;
    const dist = circularMinuteDistance(m, minuteOfDay(e.at));
    if (dist > 3 * KERNEL_SIGMA_MIN) continue;
    const kernel = Math.exp(-(dist * dist) / (2 * KERNEL_SIGMA_MIN ** 2));
    const day = new Date(e.at).getDay() === weekday ? 1 : isWeekend(e.at) === weekend ? 0.6 : 0.25;
    const place = e.location === location ? 1 : 0.5;
    density += kernel * day * place;
  }
  const daysObserved = Math.max(1, (at - h.trackingStart) / MS_PER_DAY);
  return 1 - Math.exp((-3 * density) / daysObserved);
}

export interface FeatureSnapshot {
  features: FeatureVector;
  minute: number;
  minutesSinceUse: number;
  location: LocationTag;
}

export function featuresAt(h: History, at: number, location: LocationTag = inferLocation(at)): FeatureSnapshot {
  const minute = minuteOfDay(at);
  const minutesSinceUse = Math.max(0, (at - lastNicotineUse(h, at)) / MS_PER_MIN);
  const t = encodeTimeOfDay(minute);
  return {
    minute,
    minutesSinceUse,
    location,
    features: {
      D: nicotineDecay(minutesSinceUse),
      Tsin: t.sin,
      Tcos: t.cos,
      S: stressAt(h, at),
      C: contextualTriggerWeight(h, at, location),
    },
  };
}
