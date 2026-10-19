import { useEffect, useRef } from 'react';
import { kvGet, kvSet, settleLocks } from '../db/repo.ts';
import { INTERVENTION_THRESHOLD } from '../engine/predictor.ts';
import { pct } from '../lib/format.ts';
import { HAPTICS, haptic } from '../lib/haptics.ts';
import { getPendingCheck, issueHonestyCheck, missHonestyCheck } from './actions.ts';
import { now } from './clock.ts';
import { useEngine } from './engine.tsx';
import { useUI } from './ui.tsx';

const NUDGE_COOLDOWN_MS = 45 * 60_000;
const CHECK_COOLDOWN_MS = 4 * 3_600_000;
const PREEMPT_LEAD_MS = 30 * 60_000;

function systemNotify(title: string, body: string): void {
  if (document.visibilityState === 'visible') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/icon.svg', tag: 'exhale-jitai' });
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
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
  const preemptedWindow = useRef<number | null>(null);

  // 1. Locks expire on their own, like DeviceActivityMonitor.intervalDidEnd().
  useEffect(() => {
    if (lock && settleLocks(now())) ui.toast('Lock lifted. Your apps are open again.', 'info');
  }, [t, lock, ui]);

  // 2. Missing an honesty check-in counts as a slip.
  useEffect(() => {
    const pending = getPendingCheck();
    if (pending && now() > pending.deadline) {
      missHonestyCheck();
      haptic(HAPTICS.warn);
      ui.toast('Check-in missed, so your apps are locked.', 'warn');
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
        systemNotify('Craving risk is high', `${pct(risk.p)} right now. A 90-second breathing fight can get you through it.`);

        const lastCheck = kvGet<number>('last_check_issued_at') ?? 0;
        if (!simulated && !getPendingCheck() && now() - lastCheck > CHECK_COOLDOWN_MS && Math.random() < 0.5) {
          issueHonestyCheck();
        }
      }
    }
    wasHigh.current = high;
  }, [risk.p, lock, simulated, ui]);

  // 4. Pre-emptive nudge 15–30 minutes before a forecast high-risk window.
  useEffect(() => {
    const next = windows.find((w) => w.start > now());
    if (!next || lock || simulated) return;
    const lead = next.start - now();
    if (lead <= PREEMPT_LEAD_MS && preemptedWindow.current !== next.start) {
      preemptedWindow.current = next.start;
      ui.setNudge({ p: next.peakP, at: next.start, preemptive: true });
      systemNotify('High-risk window coming up', `Your cravings usually spike soon. Get ahead of it with a quick breathing round.`);
    }
  }, [windows, t, lock, simulated, ui]);

  return null;
}
