import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTEMPT_GRACE_MS, checkStatus, effectiveDeadline, type PendingCheck } from './checks.ts';

const MIN = 60_000;
const issued = 1_000_000;
const check: PendingCheck = { issuedAt: issued, deadline: issued + 5 * MIN };

test('a check is open until its deadline', () => {
  assert.equal(checkStatus(check, issued + MIN, issued), 'OPEN');
  assert.equal(checkStatus(check, check.deadline, issued), 'OPEN');
  assert.equal(checkStatus(check, issued + MIN, null), 'OPEN');
});

test('skipping a check while the app stayed on screen counts as missed', () => {
  assert.equal(checkStatus(check, check.deadline + 1, issued), 'MISSED');
  // Came back before the deadline and still let it run out: the countdown was visible.
  assert.equal(checkStatus(check, check.deadline + 1, issued + 4 * MIN), 'MISSED');
});

test('a deadline that passed while the app was closed or hidden lapses without a lock', () => {
  assert.equal(checkStatus(check, check.deadline + 1, null), 'EXPIRED_AWAY');
  // Reopened hours later: visible again only after the deadline.
  assert.equal(checkStatus(check, check.deadline + 3 * 60 * MIN, check.deadline + 3 * 60 * MIN - 1000), 'EXPIRED_AWAY');
});

test('starting the breath test before the deadline buys time to finish it', () => {
  const started: PendingCheck = { ...check, attemptStartedAt: check.deadline - 10_000 };
  assert.equal(effectiveDeadline(started), started.attemptStartedAt! + ATTEMPT_GRACE_MS);
  assert.equal(checkStatus(started, check.deadline + 30_000, issued), 'OPEN');
  assert.equal(checkStatus(started, started.attemptStartedAt! + ATTEMPT_GRACE_MS + 1, issued), 'MISSED');
  // An early attempt never shortens the original deadline.
  assert.equal(effectiveDeadline({ ...check, attemptStartedAt: issued }), check.deadline);
});
