import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breathExercisePassed, cravingReward, fightResult, strikeDamage } from './fight.ts';
import { XP_REWARDS } from './xp.ts';

const EXHALE = 6;
const CYCLES = 3;

test('no exhale does no damage; a 60% exhale lands a full hit', () => {
  assert.equal(strikeDamage(0, EXHALE, CYCLES), 0);
  assert.equal(strikeDamage(-1, EXHALE, CYCLES), 0);
  assert.equal(strikeDamage(3.6, EXHALE, CYCLES), 100 / 3);
  assert.equal(strikeDamage(6, EXHALE, CYCLES), 100 / 3, 'damage per exhale is capped');
  assert.ok(Math.abs(strikeDamage(1.8, EXHALE, CYCLES) - 100 / 6) < 1e-9);
});

test('three full exhales defeat the boss despite floating-point leftovers', () => {
  let hp = 100;
  for (let i = 0; i < CYCLES; i++) hp -= strikeDamage(EXHALE, EXHALE, CYCLES);
  assert.equal(fightResult(hp), 'DEFEATED');
  assert.equal(fightResult(0), 'DEFEATED');
});

test('partial and zero effort are told apart', () => {
  assert.equal(fightResult(100), 'UNTOUCHED');
  assert.equal(fightResult(99.9), 'WEAKENED');
  assert.equal(fightResult(100 - 2 * (100 / 3)), 'WEAKENED');
});

test('only a defeated boss earns full XP and counts as a completed intervention', () => {
  assert.deepEqual(cravingReward('DEFEATED', 0), { xp: XP_REWARDS.BOSS_WIN, multiplier: 1, completed: true });
  assert.deepEqual(cravingReward('WEAKENED', 0), { xp: XP_REWARDS.BOSS_WIN / 2, multiplier: 1, completed: false });
  assert.deepEqual(cravingReward('UNTOUCHED', 0), { xp: 0, multiplier: 1, completed: false });
});

test('the streak multiplier scales the reward', () => {
  assert.equal(cravingReward('DEFEATED', 10).xp, XP_REWARDS.BOSS_WIN * 2);
  assert.equal(cravingReward('WEAKENED', 10).xp, XP_REWARDS.BOSS_WIN);
  assert.equal(cravingReward('UNTOUCHED', 40).xp, 0);
});

test('breath exercises need a real exhale', () => {
  assert.equal(breathExercisePassed('check', 3.9, 7), false);
  assert.equal(breathExercisePassed('check', 4, 7), true);
  // Threshold is 40% of 18 s = 7.2 s; test either side of it, not on the float boundary.
  assert.equal(breathExercisePassed('reduce', 7.1, 18), false);
  assert.equal(breathExercisePassed('reduce', 7.3, 18), true);
  assert.equal(breathExercisePassed('reduce', 0, 18), false);
});
