/** An honesty check-in the user has been asked to complete. */
export interface PendingCheck {
  issuedAt: number;
  deadline: number;
  /** Set when the user starts the breath test, so finishing it can run past the deadline. */
  attemptStartedAt?: number;
}

/** Time allowed to finish a breath test that was started before the deadline. */
export const ATTEMPT_GRACE_MS = 2 * 60_000;

export function effectiveDeadline(c: PendingCheck): number {
  return c.attemptStartedAt != null ? Math.max(c.deadline, c.attemptStartedAt + ATTEMPT_GRACE_MS) : c.deadline;
}

/**
 * OPEN: still time to respond.
 * MISSED: the deadline passed while the app was on screen, so the user saw the countdown
 * and skipped it. This counts as a slip and starts the lock.
 * EXPIRED_AWAY: the deadline passed while the app was closed or in the background. A web
 * app can't reliably alert anyone in that state, so the check lapses without a lock.
 */
export type CheckStatus = 'OPEN' | 'MISSED' | 'EXPIRED_AWAY';

/**
 * @param visibleSince When the app last became visible on screen (app clock), or null if
 *   it is hidden right now. Kept in memory only, so a reload starts a fresh visible spell.
 */
export function checkStatus(c: PendingCheck, now: number, visibleSince: number | null): CheckStatus {
  const deadline = effectiveDeadline(c);
  if (now <= deadline) return 'OPEN';
  return visibleSince != null && visibleSince <= deadline ? 'MISSED' : 'EXPIRED_AWAY';
}
