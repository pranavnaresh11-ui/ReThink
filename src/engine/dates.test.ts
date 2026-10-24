// Pin a zone with daylight saving. node --test runs each file in its own process, so this
// doesn't leak into the other test files. Engine modules don't touch Date at import time.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, atMinuteOfDay, minuteOfDay } from './features.ts';
import { assessRisk, buildTrainingSet, fitPersonalModel } from './predictor.ts';
import { generateDemoHistory } from './demo.ts';

const HOUR = 3_600_000;
// US clocks fall back on Sun 1 Nov 2026 and spring forward on Sun 8 Mar 2026.
const FALL_BACK = new Date(2026, 10, 1).getTime();
const SPRING_FORWARD = new Date(2026, 2, 8).getTime();

test('the test zone really has daylight saving (guards against a silently ignored TZ)', () => {
  assert.notEqual(new Date(2026, 9, 31).getTimezoneOffset(), new Date(2026, 10, 2).getTimezoneOffset());
});

test('addDays steps calendar days, not 24-hour blocks', () => {
  const sat = new Date(2026, 9, 31, 0, 0).getTime();
  const sun = addDays(sat, 1);
  const mon = addDays(sat, 2);
  assert.deepEqual([new Date(sun).getDate(), new Date(sun).getHours()], [1, 0]);
  assert.deepEqual([new Date(mon).getDate(), new Date(mon).getHours()], [2, 0]);
  assert.equal(mon - sun, 25 * HOUR, 'the fall-back day is 25 hours long');
  assert.equal(new Date(addDays(new Date(2026, 2, 9, 13).getTime(), -1)).getDate(), 8);
});

test('atMinuteOfDay keeps the wall-clock time on daylight-saving days', () => {
  for (const day of [FALL_BACK, SPRING_FORWARD]) {
    const d = new Date(atMinuteOfDay(day, 15 * 60 + 10));
    assert.deepEqual([d.getHours(), d.getMinutes()], [15, 10]);
  }
  const frac = new Date(atMinuteOfDay(FALL_BACK, 90.5));
  assert.deepEqual([frac.getHours(), frac.getMinutes(), frac.getSeconds()], [1, 30, 30]);
});

test('a weekday override lands on the right local time after the clocks change', () => {
  const saturdayNoon = new Date(2026, 9, 31, 12).getTime();
  const { history } = generateDemoHistory(saturdayNoon);
  const model = fitPersonalModel(history, saturdayNoon);
  const r = assessRisk(history, model, saturdayNoon, { weekday: 1, minute: 15 * 60 + 10 });
  const d = new Date(r.at);
  assert.deepEqual([d.getDay(), d.getDate(), d.getHours(), d.getMinutes()], [1, 2, 15, 10]);
  assert.equal(r.minute, 15 * 60 + 10);
});

test('demo habits stay at the same wall-clock time across the change', () => {
  const now = new Date(2026, 10, 10, 18).getTime();
  const { history } = generateDemoHistory(now);
  assert.ok(history.trackingStart < FALL_BACK, 'the demo window should span the change');

  for (const c of history.checkIns) {
    const m = minuteOfDay(c.at);
    const morning = m >= 8 * 60 + 5 && m <= 8 * 60 + 35;
    const evening = m >= 19 * 60 + 30 && m <= 20 * 60;
    assert.ok(morning || evening, `check-in at ${new Date(c.at).toString()}`);
  }

  const school = history.cravings.filter((c) => c.location === 'SCHOOL');
  assert.ok(school.length > 5);
  for (const c of school) {
    const m = minuteOfDay(c.at);
    const pass = m >= 9 * 60 + 28 && m <= 9 * 60 + 52;
    const dismissal = m >= 15 * 60 + 3 && m <= 15 * 60 + 27;
    assert.ok(pass || dismissal, `school craving at ${new Date(c.at).toString()}`);
  }
});

test('sampled quiet moments stay inside waking hours across the change', () => {
  const now = new Date(2026, 10, 10, 18).getTime();
  const { history } = generateDemoHistory(now);
  const negatives = buildTrainingSet(history, now).filter((s) => s.y === 0);
  assert.ok(negatives.length > 30);
  for (const s of negatives) {
    const m = minuteOfDay(s.at);
    assert.ok(m >= 7 * 60 && m <= 23 * 60 + 30, `quiet sample at ${new Date(s.at).toString()}`);
  }
});
