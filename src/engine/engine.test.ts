import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circularMinuteDistance, contextualTriggerWeight, encodeTimeOfDay, nicotineDecay } from './features.ts';
import { predict, rocAuc, sigmoid, trainLogistic, type Sample } from './logistic.ts';
import { assessRisk, fitPersonalModel, heuristicWeight, riskWindows } from './predictor.ts';
import { longTermSeconds, lungHealth, streakDays } from './recovery.ts';
import { levelFromXp, streakMultiplier, xpForLevel } from './xp.ts';
import { generateDemoHistory } from './demo.ts';
import type { History } from './types.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('nicotine decay rises through clearance, then fades after receptor reset', () => {
  assert.equal(nicotineDecay(0), 0);
  assert.ok(Math.abs(nicotineDecay(120) - 0.5 * Math.exp(-120 / 4320)) < 1e-12);
  assert.ok(nicotineDecay(600) > nicotineDecay(120));
  assert.ok(nicotineDecay(7 * 1440) < nicotineDecay(600));
  assert.equal(nicotineDecay(-30), 0);
});

test('time-of-day encoding is continuous across midnight', () => {
  const a = encodeTimeOfDay(1439);
  const b = encodeTimeOfDay(1);
  assert.ok(Math.hypot(a.sin - b.sin, a.cos - b.cos) < 0.01);
  assert.equal(circularMinuteDistance(1439, 1), 2);
});

test('contextual trigger weight is bounded and peaks at habitual times', () => {
  const { history } = generateDemoHistory(new Date(2026, 9, 16, 18).getTime());
  const thursday315 = new Date(2026, 9, 15, 15, 15).getTime();
  const thursday1300 = new Date(2026, 9, 15, 13, 0).getTime();
  const atHabit = contextualTriggerWeight(history, thursday315, 'SCHOOL');
  const offHabit = contextualTriggerWeight(history, thursday1300, 'SCHOOL');
  assert.ok(atHabit > 0 && atHabit < 1);
  assert.ok(atHabit > offHabit + 0.3, `${atHabit} vs ${offHabit}`);
});

test('logistic regression learns a separable signal and AUC reflects it', () => {
  const samples: Sample[] = [];
  for (let i = 0; i < 200; i++) {
    const S = (i % 20) / 19;
    samples.push({ at: i, y: S > 0.5 ? 1 : 0, x: { D: 0.3, Tsin: 0, Tcos: 1, S, C: 0 } });
  }
  const w = trainLogistic(samples, [0, 0, 0, 0, 0, 0], { priorStrength: 0.1, epochs: 2000 });
  assert.ok(w[4] > 3, `stress weight ${w[4]}`);
  const scores = samples.map((s) => predict(w, s.x));
  assert.ok((rocAuc(scores, samples.map((s) => s.y)) ?? 0) > 0.99);
  assert.equal(sigmoid(0), 0.5);
});

test('the prior dominates when there is no data', () => {
  const prior = [-1, 2, 0, 0, 1, 1];
  assert.deepEqual(trainLogistic([], prior), prior);
});

test('cold start keeps heuristic weight at 0.8, then hands over to the personal model', () => {
  assert.equal(heuristicWeight(0, 50), 0.8);
  assert.equal(heuristicWeight(4.9, 50), 0.8);
  assert.ok(heuristicWeight(5, 50) < 0.8);
  assert.equal(heuristicWeight(10, 3), 0.8, 'not enough positives yet');
  assert.equal(heuristicWeight(60, 50), 0.2);
});

test('personal model generalises to future days (chronological hold-out)', () => {
  const now = new Date(2026, 9, 16, 18).getTime();
  const { history } = generateDemoHistory(now);
  const model = fitPersonalModel(history, now);
  assert.ok(model.holdout, 'hold-out should be available after 14 days');
  assert.ok((model.holdout.auc ?? 0) > 0.7, `auc ${model.holdout.auc}`);
});

test('risk is high at dismissal under stress and low right after a calm morning', () => {
  const now = new Date(2026, 9, 16, 9).getTime();
  const { history } = generateDemoHistory(now);
  const model = fitPersonalModel(history, now);
  const high = assessRisk(history, model, now, { minute: 15 * 60 + 15, stress: 0.9, minutesSinceUse: 600 });
  const low = assessRisk(history, model, now, { minute: 10 * 60 + 45, stress: 0.15, minutesSinceUse: 30 });
  assert.ok(high.p > 0.75, `high ${high.p}`);
  assert.ok(low.p < 0.4, `low ${low.p}`);
});

test('risk windows group consecutive points above threshold', () => {
  const pts = [0.2, 0.8, 0.9, 0.7, 0.76].map((p, i) => ({ at: i, p }));
  const w = riskWindows(pts, 0.75);
  assert.equal(w.length, 2);
  assert.deepEqual([w[0].start, w[0].end, w[0].peakAt], [1, 2, 2]);
});

test('a slip keeps half of long-term recovery', () => {
  const start = 0;
  const h: History = {
    trackingStart: start,
    quitStart: start,
    dependence: 0.5,
    checkIns: [],
    cravings: [
      { id: 1, at: 10 * DAY, stress: 3, location: 'HOME', predictedRisk: 0, outcome: 'RELAPSED', interventionCompleted: false },
    ],
  };
  const now = 11 * DAY;
  assert.equal(streakDays(h, now), 1);
  assert.equal(longTermSeconds(h, now), (5 * DAY + DAY) / 1000);
  assert.ok(lungHealth(h, now) > 0 && lungHealth(h, now) < 1);
});

test('xp curve and streak multiplier', () => {
  assert.equal(xpForLevel(1), 100);
  assert.equal(xpForLevel(4), 800);
  assert.deepEqual(levelFromXp(0).level, 1);
  assert.deepEqual(levelFromXp(100).level, 2);
  assert.equal(levelFromXp(150).intoLevel, 50);
  assert.equal(streakMultiplier(0), 1);
  assert.ok(Math.abs(streakMultiplier(5) - 1.5) < 1e-12);
  assert.equal(streakMultiplier(40), 3);
});
