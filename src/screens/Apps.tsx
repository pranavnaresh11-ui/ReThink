import { motion } from 'framer-motion';
import { Cpu, Lock, LockOpen, NotebookPen, Wind } from 'lucide-react';
import { effectiveLockEnd, updateProfile } from '../db/repo.ts';
import { Section } from '../components/ui.tsx';
import { useNow } from '../hooks/useNow.ts';
import { ALWAYS_ALLOWED, LOCKABLE_APPS, type PhoneApp } from '../lib/apps.ts';
import { formatClock, formatCountdown } from '../lib/format.ts';
import { HAPTICS, haptic } from '../lib/haptics.ts';
import { LOCK_REDUCTION_MIN, MAX_LOCK_REDUCTIONS } from '../state/actions.ts';
import { useEngine } from '../state/engine.tsx';
import { useUI } from '../state/ui.tsx';

function AppIcon({ app, locked, onClick }: { app: PhoneApp; locked: boolean; onClick: () => void }) {
  const Icon = app.icon;
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] shadow-lg transition"
          style={{ background: app.bg, color: app.fg, filter: locked ? 'grayscale(0.85) brightness(0.55)' : undefined }}
        >
          <Icon size={26} strokeWidth={2.2} />
        </div>
        {locked && (
          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-coral text-[#3a0d08]">
            <Lock size={12} strokeWidth={2.6} />
          </div>
        )}
      </div>
      <span className="text-[11px] text-muted">{app.name}</span>
    </button>
  );
}

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remaining / total));
  return (
    <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth="9" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="var(--color-coral)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
      <text x="60" y="64" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--color-text)" fontFamily="var(--font-mono)">
        {formatCountdown(remaining)}
      </text>
      <text x="60" y="80" textAnchor="middle" fontSize="8" fill="var(--color-muted)">
        remaining
      </text>
    </svg>
  );
}

export function Apps() {
  const { profile, lock } = useEngine();
  const { open, toast } = useUI();
  const t = useNow(1000);
  const lockedSet = new Set(profile.lockedApps);
  const active = lock != null && effectiveLockEnd(lock) > t;
  const reductionsUsed = lock ? lock.reducedMinutes / LOCK_REDUCTION_MIN : 0;
  const canReduce = active && reductionsUsed < MAX_LOCK_REDUCTIONS;

  const tapApp = (app: PhoneApp) => {
    haptic(HAPTICS.tap);
    if (active && lockedSet.has(app.id)) open({ kind: 'shield', appId: app.id });
    else toast(`${app.name} would open normally.`);
  };

  const toggleApp = (id: string) => {
    const next = lockedSet.has(id) ? profile.lockedApps.filter((a) => a !== id) : [...profile.lockedApps, id];
    updateProfile({ lockedApps: next });
  };

  return (
    <div className="px-4 pb-32 pt-3">
      <h1 className="px-1 font-display text-2xl font-semibold">Accountability lock</h1>
      <p className="px-1 text-sm text-muted">Log nicotine use and the apps you picked lock for {profile.lockMinutes} minutes. It’s a pact you made with yourself.</p>

      <motion.div layout className="card mt-4 overflow-hidden p-4" style={active ? { borderColor: 'rgb(255 138 122 / 0.45)' } : undefined}>
        {active && lock ? (
          <>
            <div className="flex items-center gap-4">
              <CountdownRing remaining={effectiveLockEnd(lock) - t} total={effectiveLockEnd(lock) - lock.start} />
              <div className="min-w-0 flex-1">
                <div className="eyebrow text-coral">Nicotine reset active</div>
                <p className="mt-1 text-sm leading-snug">
                  {lock.reason === 'RELAPSE' ? 'Started after a logged slip.' : 'Started after a missed check-in.'} Unlocks at{' '}
                  <span className="font-semibold">{formatClock(effectiveLockEnd(lock))}</span>.
                </p>
                <p className="mt-1 text-xs text-muted">
                  Earned back: {lock.reducedMinutes} of {LOCK_REDUCTION_MIN * MAX_LOCK_REDUCTIONS} min
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button disabled={!canReduce} onClick={() => open({ kind: 'fight', mode: 'reduce' })} className="btn btn-ghost px-3 text-sm">
                <Wind size={16} /> Breathe −{LOCK_REDUCTION_MIN}m
              </button>
              <button disabled={!canReduce} onClick={() => open({ kind: 'reflect' })} className="btn btn-ghost px-3 text-sm">
                <NotebookPen size={16} /> Reflect −{LOCK_REDUCTION_MIN}m
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint/12 text-mint">
              <LockOpen size={20} />
            </div>
            <div className="text-sm">
              <div className="font-semibold">No active lock</div>
              <div className="text-muted">{profile.lockedApps.length} apps on standby. Keep it that way.</div>
            </div>
          </div>
        )}
      </motion.div>

      <Section title="Phone preview">
        <div className="rounded-[2rem] border border-line bg-[radial-gradient(120%_80%_at_50%_0%,#123246,#07131c)] p-5">
          <div className="grid grid-cols-4 gap-x-2 gap-y-5">
            {LOCKABLE_APPS.filter((a) => lockedSet.has(a.id)).map((a) => (
              <AppIcon key={a.id} app={a} locked={active} onClick={() => tapApp(a)} />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2 rounded-3xl bg-white/5 p-3">
            {ALWAYS_ALLOWED.map((a) => (
              <AppIcon key={a.id} app={a} locked={false} onClick={() => tapApp(a)} />
            ))}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted">Calls, messages and maps are never blocked.</p>
        </div>
      </Section>

      <Section title="Apps to lock">
        <div className="card p-4">
          <div className="flex flex-wrap gap-2">
            {LOCKABLE_APPS.map((a) => (
              <button key={a.id} className="chip" data-on={lockedSet.has(a.id)} onClick={() => toggleApp(a.id)}>
                {a.name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted">Lock length</span>
            <div className="flex gap-1.5">
              {[15, 30, 45, 60].map((m) => (
                <button key={m} className="chip px-3 py-1.5" data-on={profile.lockMinutes === m} onClick={() => updateProfile({ lockMinutes: m })}>
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="How it works on a real phone">
        <div className="card p-4 text-sm leading-relaxed text-muted">
          <div className="mb-2 flex items-center gap-2 font-semibold text-text">
            <Cpu size={16} className="text-sky" /> OS-level, not just in-app
          </div>
          On iPhone, <span className="font-mono text-xs text-sky">FamilyControls</span> lets you pick apps,{' '}
          <span className="font-mono text-xs text-sky">ManagedSettings</span> puts the system shield over them, and a{' '}
          <span className="font-mono text-xs text-sky">DeviceActivity</span> schedule lifts it when the timer ends, even if Exhale is
          closed or the phone restarts. On Android, an <span className="font-mono text-xs text-sky">AccessibilityService</span> does the
          same job. This web prototype simulates the shield; the native code is in <span className="font-mono text-xs">/native</span>.
        </div>
      </Section>
    </div>
  );
}
