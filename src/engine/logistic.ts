import type { FeatureVector } from './features.ts';

export const FEATURE_KEYS = ['D', 'Tsin', 'Tcos', 'S', 'C'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  D: 'Nicotine withdrawal',
  Tsin: 'Time of day (sin)',
  Tcos: 'Time of day (cos)',
  S: 'Stress',
  C: 'Personal trigger pattern',
};

/** [w0 (bias), w1 … w5] in FEATURE_KEYS order. */
export type Weights = number[];

/**
 * Starting point for every new user. The personal model is trained as a MAP estimate
 * centred on these, so a handful of logs nudges it rather than overfitting.
 */
export const POPULATION_PRIOR: Weights = [-3.2, 3.0, 0, 0, 2.4, 2.8];

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export function toVector(f: FeatureVector): number[] {
  return [1, f.D, f.Tsin, f.Tcos, f.S, f.C];
}

function dot(w: Weights, x: number[]): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += w[i] * x[i];
  return s;
}

/** P(Craving) = σ(w0 + w1·D + w2·Tsin + w3·Tcos + w4·S + w5·C) */
export function predict(w: Weights, f: FeatureVector): number {
  return sigmoid(dot(w, toVector(f)));
}

export interface Sample {
  at: number;
  x: FeatureVector;
  y: 0 | 1;
}

export interface TrainOptions {
  /** How many "virtual samples" the prior is worth. */
  priorStrength?: number;
  learningRate?: number;
  epochs?: number;
}

/**
 * Full-batch gradient descent on mean cross-entropy + (λ/2n)·‖w − prior‖².
 * Small enough to run on-device in a few milliseconds.
 */
export function trainLogistic(
  samples: Sample[],
  prior: Weights = POPULATION_PRIOR,
  { priorStrength = 3, learningRate = 0.5, epochs = 800 }: TrainOptions = {},
): Weights {
  const w = [...prior];
  const n = samples.length;
  if (n === 0) return w;
  const xs = samples.map((s) => toVector(s.x));
  const grad = new Array<number>(w.length);
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let j = 0; j < w.length; j++) grad[j] = (priorStrength * (w[j] - prior[j])) / n;
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const err = sigmoid(dot(w, x)) - samples[i].y;
      for (let j = 0; j < w.length; j++) grad[j] += (err * x[j]) / n;
    }
    for (let j = 0; j < w.length; j++) w[j] -= learningRate * grad[j];
  }
  return w;
}

/** Area under the ROC curve: probability a random craving scores above a random quiet moment. */
export function rocAuc(scores: number[], labels: (0 | 1)[]): number | null {
  let wins = 0;
  let pairs = 0;
  for (let i = 0; i < scores.length; i++) {
    if (labels[i] !== 1) continue;
    for (let j = 0; j < scores.length; j++) {
      if (labels[j] !== 0) continue;
      pairs++;
      if (scores[i] > scores[j]) wins++;
      else if (scores[i] === scores[j]) wins += 0.5;
    }
  }
  return pairs === 0 ? null : wins / pairs;
}
