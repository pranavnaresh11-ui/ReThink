import { motion } from 'framer-motion';
import { ChevronRight, Flame, HeartPulse, LifeBuoy, PiggyBank, ShieldCheck, Swords, Ticket, Trash2, Wind } from 'lucide-react';
import { LungAvatar } from '../components/LungAvatar.tsx';
import { RiskGauge } from '../components/RiskGauge.tsx';
import { LevelCard, ProgressBar, Section, Stat } from '../components/ui.tsx';
import { resetAll } from '../db/repo.ts';
import { useNow } from '../hooks/useNow.ts';
import { lungHealth, milestoneProgress, moneySaved, secondsSinceUse, streakDays } from '../engine/recovery.ts';
import { formatClock, formatDuration, formatIn } from '../lib/format.ts';
import { resetClock } from '../state/clock.ts';
import { useEngine } from '../state/engine.tsx';
import { setSim } from '../state/simulator.ts';
import { useUI } from '../state/ui.tsx';

function soberClock(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return d > 0 ? `${d}d ${hms}` : hms;
}

export function Home() {
  const { profile, history, risk, windows, watchWindows, simulated, model, lock } = useEngine();
  const { open, setTab } = useUI();
  const t = useNow(1000);

  const health = lungHealth(history, t);
  const streak = streakDays(history, t);
  const sober = secondsSinceUse(history, t);
  const milestones = milestoneProgress(history, t);
  const nextMilestone = milestones.find((m) => m.progress < 1);
  const wins = history.cravings.filter((c) => c.outcome === 'RESISTED').length;
  const nextHigh = windows.find((w) => w.end >= t);
  const nextWindow = nextHigh ?? watchWindows.find((w) => w.end >= t);
  const recentSlip = sober < 3600;

  const hour = new Date(t).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="px-4 pb-32 pt-3">
      <header className="flex items-center justify-between px-1">
        <div>
          <div className="text-sm text-muted">{greeting}</div>
          <h1 className="font-display text-2xl font-semibold">{profile.name}</h1>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5">
          <Flame size={16} className="text-amber" />
          <span className="font-display font-semibold tabular-nums">{streak}</span>
          <span className="text-xs text-muted">day{streak === 1 ? '' : 's'}</span>
        </div>
      </header>

      {/* Lung ecosystem */}
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={() => open({ kind: 'milestones' })}
        className="card relative mt-4 w-full overflow-hidden p-4 text-left"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow">Your lungs</div>
            <div className="mt-1 font-display text-3xl font-bold tabular-nums">
              {Math.round(health * 100)}
              <span className="text-lg text-muted">% healed</span>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Vape-free</div>
            <div className="mt-1 font-mono text-sm tabular-nums text-mint">{soberClock(sober)}</div>
          </div>
        </div>
        <div className="-my-1 flex justify-center">
          <LungAvatar health={health} size={250} recentSlip={recentSlip} />
        </div>
        {nextMilestone && (
          <div className="rounded-2xl bg-surface-2 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <HeartPulse size={14} className="text-coral" />
                Next: {nextMilestone.label}
              </span>
              <span className="text-muted">{formatDuration(nextMilestone.remaining)}</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={nextMilestone.progress} color="var(--color-coral)" height={6} />
            </div>
          </div>
        )}
        {recentSlip && (
          <p className="mt-3 text-xs text-muted">
            A slip isn’t a reset. Your long-term recovery keeps half of what you built. The clock is already running again.
          </p>
        )}
      </motion.button>

      {/* Craving risk */}
      <button onClick={() => setTab('forecast')} className="card mt-3 flex w-full items-center gap-2 p-4 text-left">
        <RiskGauge p={risk.p} size={170} simulated={simulated} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Craving risk</div>
          {nextWindow ? (
            <p className="mt-1.5 text-sm leading-snug">
              {nextHigh ? 'High-risk window' : 'Watch window'}{' '}
              <span className={`font-semibold ${nextHigh ? 'text-danger' : 'text-amber'}`}>
                {nextWindow.start <= t ? 'right now' : `${formatIn(nextWindow.start - t)}`}
              </span>
              <span className="text-muted"> · peaks {formatClock(nextWindow.peakAt)}</span>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-muted">Clear skies: no risky stretches in the next 24 h.</p>
          )}
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted">
            {risk.phase === 'COLD_START' ? 'Learning you · clinical model' : `Personal model · ${Math.round((1 - risk.wHeuristic) * 100)}%`}
            <ChevronRight size={12} />
          </div>
          <div className="mt-1 text-[11px] text-faint">{model.positives} cravings learned from</div>
        </div>
      </button>

      {/* Actions */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button onClick={() => open({ kind: 'fight', mode: 'craving' })} className="btn btn-primary col-span-2 py-4 text-base">
          <Swords size={20} /> I’m craving. Fight it
        </button>
        <button onClick={() => open({ kind: 'checkin' })} className="btn btn-ghost">
          <Wind size={18} /> Check in
        </button>
        <button onClick={() => open({ kind: 'relapse' })} className="btn btn-danger">
          I vaped
        </button>
      </div>
      <p className="mt-2 px-1 text-center text-[11px] text-faint">Logging honestly earns XP too. The app only works if it knows.</p>

      <Section title="Progress">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="cravings beaten" value={wins} icon={<Swords size={15} />} />
          <Stat label="saved (est.)" value={`$${moneySaved(history, t, profile.dailyCost).toFixed(0)}`} icon={<PiggyBank size={15} />} tone="var(--color-gold)" />
          <Stat label="skip passes" value={profile.skipPasses} icon={<Ticket size={15} />} tone="var(--color-violet)" />
        </div>
        <div className="mt-2.5">
          <LevelCard xp={profile.xp} streak={streak} />
        </div>
      </Section>

      <Section title="Need more support?">
        <div className="card flex gap-3 p-4">
          <LifeBuoy size={20} className="mt-0.5 shrink-0 text-sky" />
          <div className="text-sm leading-relaxed text-muted">
            Text <span className="font-semibold text-text">DITCHVAPE</span> to <span className="font-semibold text-text">88709</span> for
            free texts from This is Quitting, or call <span className="font-semibold text-text">1-800-QUIT-NOW</span>. A doctor or school
            nurse can help too.
          </div>
        </div>
      </Section>

      <Section title="Your data">
        <div className="card p-4 text-sm leading-relaxed text-muted">
          <div className="flex gap-3">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-mint" />
            <div>
              Everything you log stays in a database on this device. There’s no account and no server, and the microphone is never
              recorded.
            </div>
          </div>
          <button
            className="btn btn-danger mt-3 w-full text-sm"
            disabled={lock != null}
            onClick={() => {
              if (!window.confirm('Delete everything Exhale has stored on this device? This can’t be undone.')) return;
              setSim({ enabled: false });
              resetClock();
              resetAll();
            }}
          >
            <Trash2 size={16} /> Delete my data
          </button>
          {lock && <p className="mt-2 text-center text-xs text-faint">Available once the current lock ends.</p>}
        </div>
      </Section>
    </div>
  );
}
