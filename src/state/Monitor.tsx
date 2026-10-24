import { useEffect, useRef } from 'react';
import { kvGet, kvSet, settleLocks } from '../db/repo.ts';
import { checkStatus } from '../engine/checks.ts';
import { INTERVENTION_THRESHOLD } from '../engine/predictor.ts';
import { pct } from '../lib/format.ts';
import { HAPTICS, haptic } from '../lib/haptics.ts';
import { expireHonestyCheck, getPendingCheck, issueHonestyCheck, missHonestyCheck } from './actions.ts';
import { now } from './clock.ts';
import { useEngine } from './engine.tsx';
import { useUI } from './ui.tsx';

const NUDGE_COOLDOWN_MS = 45 * 60_000;
const CHECK_COOLDOWN_MS = 4 * 3_600_000;
const PREEMPT_LEAD_MS = 30 * 60_000;

const isVisible = () => document.visibilityState === 'visible';

/**
 * A system notification while the app is open but in the background. With no push
 * server, nothing can alert the user once the page is fully closed; on Android Chrome
 * notifications must go through the service worker, so prefer that when it's installed.
 */
async function systemNotify(title: string, body: string): Promise<void> {
  if (isVisible()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, icon: '/icon-192.png', tag: 'exhale-jitai' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* some browsers refuse notifications from a page */
  }
}

/**
 * The JITAI loop. Native builds run this from BGAppRefreshTask every 15 minutes;
 * here it runs on every engine tick while the app is open.
 */
export function Monitor() {
  const { t, risk, windows, lock, simulated, dbVersion } = useEngine();
  const ui = useUI();
  const wasHigh = useRef(false);
  // When the app last came on screen, in app-clock time. Memory only: a reload starts fresh.
  const visibleSince = useRef<number | null>(isVisible() ? now() : null);

  useEffect(() => {
    const onChange = () => {
      visibleSince.current = isVisible() ? now() : null;
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // 1. Locks expire on their own, like DeviceActivityMonitor.intervalDidEnd().
  useEffect(() => {
    if (lock && settleLocks(now())) ui.toast('Lock lifted. Your apps are open again.', 'info');
  }, [t, lock, ui]);

  // 2. Honesty check deadlines. Skipping one on screen counts as a slip; one that ran out
  //    while the app was closed lapses, because the web app couldn't reach the user.
  useEffect(() => {
    if (!isVisible()) return;
    const pending = getPendingCheck();
    if (!pending) return;
    const status = checkStatus(pending, now(), visibleSince.current);
    if (status === 'MISSED') {
      missHonestyCheck();
      haptic(HAPTICS.warn);
      ui.toast('Check-in missed, so your apps are locked.', 'warn');
    } else if (status === 'EXPIRED_AWAY') {
      expireHonestyCheck();
      ui.toast('A check-in ran out while Exhale was closed. No lock this time.', 'info');
    }
  }, [t, dbVersion, ui]);

  // 3. Just-in-time intervention when predicted risk crosses the threshold.
  useEffect(() => {
    const high = risk.p >= INTERVENTION_THRESHOLD;
    if (high && !wasHigh.current && !lock) {
      const last = kvGet<number>('last_nudge_at') ?? 0;
      if (simulated || now() - last > NUDGE_COOLDOWN_MS) {
        kvSet('last_nudge_at', now());
        ui.setNudge({ p: risk.p, at: now(), preemptive: false });
        haptic(HAPTICS.warn);
        void systemNotify('Craving risk is high', `${pct(risk.p)} right now. A 90-second breathing fight can get you through it.`);

        // Only ask for a check-in the user can actually see: the app must be on screen.
        const lastCheck = kvGet<number>('last_check_issued_at') ?? 0;
        if (!simulated && isVisible() && !getPendingCheck() && now() - lastCheck > CHECK_COOLDOWN_MS && Math.random() < 0.5) {
          issueHonestyCheck();
        }
      }
    }
    wasHigh.current = high;
  }, [risk.p, lock, simulated, ui]);

  // 4. Pre-emptive nudge up to 30 minutes before a forecast high-risk window.
  useEffect(() => {
    const next = windows.find((w) => w.start > now());
    if (!next || lock || simulated) return;
    const lead = next.start - now();
    // The forecast grid starts at the current minute, so a window's start drifts by a few
    // minutes as time passes. Treat anything near the last one as the same window, and keep
    // it in the database so a reload doesn't repeat the nudge either.
    const lastPreempted = kvGet<number>('last_preempted_window') ?? 0;
    if (lead <= PREEMPT_LEAD_MS && Math.abs(next.start - lastPreempted) > PREEMPT_LEAD_MS) {
      kvSet('last_preempted_window', next.start);
      ui.setNudge({ p: next.peakP, at: next.start, preemptive: true });
      void systemNotify('High-risk window coming up', 'Your cravings usually spike soon. Get ahead of it with a quick breathing round.');
    }
  }, [windows, t, lock, simulated, ui]);

  return null;
}
