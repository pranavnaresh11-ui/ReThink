import {
  MS_PER_DAY,
  MS_PER_MIN,
  baselineStress,
  featuresAt,
  inferLocation,
  minuteOfDay,
  nicotineDecay,
  startOfDay,
  stressAt,
  type FeatureVector,
} from './features.ts';
import { heuristicLogit } from './heuristic.ts';
import {
  FEATURE_KEYS,
  POPULATION_PRIOR,
  predict,
  rocAuc,
  sigmoid,
  trainLogistic,
  type FeatureKey,
  type Sample,
  type Weights,
} from './logistic.ts';
import type { History, LocationTag } from './types.ts';

/** Fire an intervention when P(Craving) crosses this. */
export const INTERVENTION_THRESHOLD = 0.75;
/** Shown on the forecast as a heads-up, without a push. */
export const WATCH_THRESHOLD = 0.5;
export const COLD_START_DAYS = 5;
const MIN_POSITIVES_FOR_PERSONAL = 8;
/** Pseudo-negatives must be at least this far from any logged craving. */
const QUIET_MARGIN_MIN = 75;
const NEGATIVES_PER_DAY = 6;
const WAKING_START_MIN = 7 * 60;
const WAKING_END_MIN = 23 * 60 + 30;

/**
 * Dynamic weighting: days 1–5 lean on the clinical heuristic (0.8), then shift
 * 7.5 points a day toward the personal classifier, bottoming out at 0.2.
 */
export function heuristicWeight(daysTracked: number, positives: number): number {
  const day = Math.floor(daysTracked);
  if (day < COLD_START_DAYS || positives < MIN_POSITIVES_FOR_PERSONAL) return 0.8;
  return Math.max(0.2, 0.8 - 0.075 * (day - COLD_START_DAYS + 1));
}

export type ModelPhase = 'COLD_START' | 'BLENDING' | 'PERSONAL';

export function phaseFor(wHeuristic: number): ModelPhase {
  if (wHeuristic >= 0.8) return 'COLD_START';
  if (wHeuristic > 0.2) return 'BLENDING';
  return 'PERSONAL';
}

/** Deterministic PRNG so retraining on the same data yields the same model. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Labels: every logged craving (resisted or relapsed) and every "craving now" check-in is a
 * positive. Check-ins reporting no craving are true negatives. Because people only log the
 * moments something happened, we also sample quiet waking-hour moments as pseudo-negatives.
 */
export function buildTrainingSet(h: History, now: number): Sample[] {
  const positives: { at: number; location: LocationTag }[] = [
    ...h.cravings.filter((e) => e.at <= now).map((e) => ({ at: e.at, location: e.location })),
    ...h.checkIns.filter((c) => c.cravingNow > 0 && c.at <= now).map((c) => ({ at: c.at, location: c.location })),
  ];
  const negatives: { at: number; location: LocationTag }[] = h.checkIns
    .filter((c) => c.cravingNow === 0 && c.at <= now)
    .map((c) => ({ at: c.at, location: c.location }));

  const margin = QUIET_MARGIN_MIN * MS_PER_MIN;
  for (let day = startOfDay(h.trackingStart); day <= now; day += MS_PER_DAY) {
    const d = new Date(day);
    const rng = mulberry32(d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate());
    for (let k = 0; k < NEGATIVES_PER_DAY; k++) {
      const minute = WAKING_START_MIN + rng() * (WAKING_END_MIN - WAKING_START_MIN);
      const at = day + minute * MS_PER_MIN;
      if (at < h.trackingStart || at > now) continue;
      if (positives.some((p) => Math.abs(p.at - at) < margin)) continue;
      negatives.push({ at, location: inferLocation(at) });
    }
  }

  const samples: Sample[] = [
    ...positives.map((p) => ({ at: p.at, y: 1 as const, x: featuresAt(h, p.at, p.location).features })),
    ...negatives.map((p) => ({ at: p.at, y: 0 as const, x: featuresAt(h, p.at, p.location).features })),
  ];
  return samples.sort((a, b) => a.at - b.at);
}

export interface PersonalModel {
  weights: Weights;
  prior: Weights;
  positives: number;
  negatives: number;
  /** Chronological hold-out (last 25%), so we test on the future, not the past. */
  holdout: { n: number; auc: number | null; heuristicAuc: number | null; accuracy: number } | null;
}

export function fitPersonalModel(h: History, now: number): PersonalModel {
  const samples = buildTrainingSet(h, now);
  const positives = samples.filter((s) => s.y === 1).length;
  const negatives = samples.length - positives;

  let holdout: PersonalModel['holdout'] = null;
  if (samples.length >= 24 && positives >= 6) {
    const cut = Math.floor(samples.length * 0.75);
    const test = samples.slice(cut);
    if (test.some((s) => s.y === 1) && test.some((s) => s.y === 0)) {
      const w = trainLogistic(samples.slice(0, cut));
      const scores = test.map((s) => predict(w, s.x));
      const heuristicScores = test.map((s) => sigmoid(heuristicLogit(s.x, minuteOfDay(s.at), h.dependence).z));
      const labels = test.map((s) => s.y);
      const correct = test.filter((s, i) => (scores[i] >= 0.5 ? 1 : 0) === s.y).length;
      holdout = {
        n: test.length,
        auc: rocAuc(scores, labels),
        heuristicAuc: rocAuc(heuristicScores, labels),
        accuracy: correct / test.length,
      };
    }
  }

  return { weights: trainLogistic(samples), prior: POPULATION_PRIOR, positives, negatives, holdout };
}

export interface FeatureOverrides {
  /** 0 = Sunday. Simulates the next occurrence of that weekday. */
  weekday?: number;
  minute?: number;
  minutesSinceUse?: number;
  stress?: number;
  location?: LocationTag;
}

export interface RiskAssessment {
  at: number;
  p: number;
  pHeuristic: number;
  pPersonal: number;
  wHeuristic: number;
  phase: ModelPhase;
  features: FeatureVector;
  minute: number;
  minutesSinceUse: number;
  location: LocationTag;
  logit: number;
  contributions: { key: FeatureKey; value: number; weight: number; contribution: number }[];
}

function blend(h: History, model: PersonalModel, f: FeatureVector, minute: number, now: number) {
  const pHeuristic = sigmoid(heuristicLogit(f, minute, h.dependence).z);
  const pPersonal = predict(model.weights, f);
  const wHeuristic = heuristicWeight((now - h.trackingStart) / MS_PER_DAY, model.positives);
  return { pHeuristic, pPersonal, wHeuristic, p: wHeuristic * pHeuristic + (1 - wHeuristic) * pPersonal };
}

export function assessRisk(h: History, model: PersonalModel, now: number, o: FeatureOverrides = {}): RiskAssessment {
  let at = now;
  if (o.minute != null || o.weekday != null) {
    const daysAhead = o.weekday == null ? 0 : (o.weekday - new Date(now).getDay() + 7) % 7;
    at = startOfDay(now) + daysAhead * MS_PER_DAY + (o.minute ?? minuteOfDay(now)) * MS_PER_MIN;
  }
  const snap = featuresAt(h, at, o.location ?? inferLocation(at));
  const minutesSinceUse = o.minutesSinceUse ?? snap.minutesSinceUse;
  const features: FeatureVector = {
    ...snap.features,
    D: nicotineDecay(minutesSinceUse),
    S: o.stress ?? snap.features.S,
  };
  const b = blend(h, model, features, snap.minute, now);
  const contributions = FEATURE_KEYS.map((key, i) => ({
    key,
    value: features[key],
    weight: model.weights[i + 1],
    contribution: features[key] * model.weights[i + 1],
  }));
  return {
    at,
    ...b,
    phase: phaseFor(b.wHeuristic),
    features,
    minute: snap.minute,
    minutesSinceUse,
    location: snap.location,
    logit: model.weights[0] + contributions.reduce((s, c) => s + c.contribution, 0),
    contributions,
  };
}

export interface ForecastPoint {
  at: number;
  p: number;
}

/**
 * Projects risk forward assuming no new nicotine use. Current stress relaxes toward the
 * user's baseline with a ~6 h time constant.
 */
export function forecastRisk(h: History, model: PersonalModel, now: number, hours = 24, stepMin = 15): ForecastPoint[] {
  const s0 = stressAt(h, now);
  const sBase = baselineStress(h, now);
  const points: ForecastPoint[] = [];
  for (let k = 0; k <= (hours * 60) / stepMin; k++) {
    const at = now + k * stepMin * MS_PER_MIN;
    const snap = featuresAt(h, at);
    const S = sBase + (s0 - sBase) * Math.exp((-k * stepMin) / 360);
    points.push({ at, p: blend(h, model, { ...snap.features, S }, snap.minute, now).p });
  }
  return points;
}

export interface RiskWindow {
  start: number;
  end: number;
  peakAt: number;
  peakP: number;
}

export function riskWindows(points: ForecastPoint[], threshold = INTERVENTION_THRESHOLD): RiskWindow[] {
  const windows: RiskWindow[] = [];
  let current: RiskWindow | null = null;
  for (const pt of points) {
    if (pt.p >= threshold) {
      if (!current) current = { start: pt.at, end: pt.at, peakAt: pt.at, peakP: pt.p };
      current.end = pt.at;
      if (pt.p > current.peakP) {
        current.peakP = pt.p;
        current.peakAt = pt.at;
      }
    } else if (current) {
      windows.push(current);
      current = null;
    }
  }
  if (current) windows.push(current);
  return windows;
}
