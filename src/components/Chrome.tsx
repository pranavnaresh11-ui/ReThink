import { AnimatePresence, motion } from 'framer-motion';
import { ChartSpline, FlaskConical, House, Lock, ShieldAlert, Swords, X, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { effectiveLockEnd } from '../db/repo.ts';
import { useNow } from '../hooks/useNow.ts';
import { formatClock, formatCountdown, pct } from '../lib/format.ts';
import { getPendingCheck, spendSkipPass } from '../state/actions.ts';
import { useEngine } from '../state/engine.tsx';
import { useUI, type Tab } from '../state/ui.tsx';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <House size={20} /> },
  { id: 'forecast', label: 'Forecast', icon: <ChartSpline size={20} /> },
  { id: 'apps', label: 'Lock', icon: <Lock size={20} /> },
  { id: 'lab', label: 'Lab', icon: <FlaskConical size={20} /> },
];

export function BottomNav() {
  const { tab, setTab, open } = useUI();
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);
  const item = (t: (typeof TABS)[number]) => (
    <button
      key={t.id}
      onClick={() => setTab(t.id)}
      className="flex flex-1 flex-col items-center gap-1 py-2 text-[10.5px] font-medium transition-colors"
      style={{ color: tab === t.id ? 'var(--color-mint)' : 'var(--color-faint)' }}
      aria-current={tab === t.id ? 'page' : undefined}
    >
      {t.icon}
      {t.label}
    </button>
  );
  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-1 backdrop-blur-xl">
      <div className="flex items-end">
        {left.map(item)}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => open({ kind: 'fight', mode: 'craving' })}
            className="-mt-7 flex h-15 w-15 flex-col items-center justify-center rounded-full bg-linear-to-br from-mint to-sky text-[#04212b] shadow-[0_10px_30px_-8px_rgb(94_234_212/0.7)] active:scale-95"
            aria-label="Fight a craving"
          >
            <Swords size={22} />
            <span className="text-[9px] font-bold uppercase tracking-wide">Fight</span>
          </button>
        </div>
        {right.map(item)}
      </div>
    </nav>
  );
}

function Banner({ tone, icon, children, onClick, onDismiss }: { tone: string; icon: ReactNode; children: ReactNode; onClick?: () => void; onDismiss?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="mx-4 mt-2 flex items-center gap-3 rounded-2xl border p-3"
      style={{ borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`, background: `color-mix(in srgb, ${tone} 12%, var(--color-surface))` }}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${tone} 22%, transparent)`, color: tone }}>
          {icon}
        </div>
        <div className="min-w-0 text-sm leading-snug">{children}</div>
      </button>
      {onDismiss && (
        <button onClick={onDismiss} className="rounded-full p-1.5 text-muted" aria-label="Dismiss">
          <X size={16} />
        </button>
      )}
    </motion.div>
  );
}

/** JITAI nudges, honesty check-ins and lock status, pinned under the status bar. */
export function Banners() {
  const { lock, profile, dbVersion } = useEngine();
  const { nudge, setNudge, open, setTab, toast } = useUI();
  const t = useNow(1000);
  void dbVersion;
  const pending = getPendingCheck();

  return (
    <div className="relative z-30 flex shrink-0 flex-col">
      <AnimatePresence>
        {pending && (
          <Banner key="check" tone="var(--color-violet)" icon={<ShieldAlert size={18} />} onClick={() => open({ kind: 'fight', mode: 'check' })}>
            <div className="font-semibold">Honesty check-in · {formatCountdown(pending.deadline - t)}</div>
            <div className="text-xs text-muted">
              15-second breath test. Skip it and your apps lock.
              {profile.skipPasses > 0 && (
                <>
                  {' '}
                  <span
                    role="button"
                    tabIndex={0}
                    className="font-semibold text-violet underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (spendSkipPass()) toast('Skip pass used.', 'info');
                    }}
                  >
                    Use skip pass ({profile.skipPasses})
                  </span>
                </>
              )}
            </div>
          </Banner>
        )}
        {nudge && !lock && (
          <Banner
            key="nudge"
            tone={nudge.preemptive ? 'var(--color-amber)' : 'var(--color-danger)'}
            icon={<Zap size={18} />}
            onClick={() => {
              setNudge(null);
              open({ kind: 'fight', mode: 'craving' });
            }}
            onDismiss={() => setNudge(null)}
          >
            <div className="font-semibold">
              {nudge.preemptive ? `High-risk window at ${formatClock(nudge.at)}` : `Craving risk ${pct(nudge.p)}. Fight it now`}
            </div>
            <div className="text-xs text-muted">
              {nudge.preemptive ? 'Get ahead of it: a 90-second breathing round now.' : 'Tap to start a 90-second breathing fight.'}
            </div>
          </Banner>
        )}
        {lock && (
          <Banner key="lock" tone="var(--color-coral)" icon={<Lock size={18} />} onClick={() => setTab('apps')}>
            <div className="font-semibold">Nicotine reset · {formatCountdown(effectiveLockEnd(lock) - t)} left</div>
            <div className="text-xs text-muted">Breathe or reflect to earn 5 minutes back.</div>
          </Banner>
        )}
      </AnimatePresence>
    </div>
  );
}
