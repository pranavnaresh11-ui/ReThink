import { motion } from 'framer-motion';
import { Check, Lock, Wind } from 'lucide-react';
import { useState } from 'react';
import { effectiveLockEnd } from '../db/repo.ts';
import { LungAvatar } from '../components/LungAvatar.tsx';
import { ProgressBar, STRESS_FACES, Sheet } from '../components/ui.tsx';
import { inferLocation } from '../engine/features.ts';
import { lungHealth, milestoneProgress } from '../engine/recovery.ts';
import { LOCATIONS, LOCATION_LABELS, type CravingLevel, type LocationTag } from '../engine/types.ts';
import { useNow } from '../hooks/useNow.ts';
import { appById } from '../lib/apps.ts';
import { formatCountdown, formatDuration } from '../lib/format.ts';
import { HAPTICS, haptic } from '../lib/haptics.ts';
import { LOCK_REDUCTION_MIN, MAX_LOCK_REDUCTIONS, earnLockTime, logRelapse, submitCheckIn } from '../state/actions.ts';
import { now } from '../state/clock.ts';
import { useEngine } from '../state/engine.tsx';
import { useUI } from '../state/ui.tsx';

function StressPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {STRESS_FACES.map((face, i) => (
        <button
          key={i}
          onClick={() => onChange(i + 1)}
          className="flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-2xl transition"
          style={value === i + 1 ? { borderColor: 'var(--color-mint)', background: 'rgb(94 234 212 / 0.1)' } : { borderColor: 'var(--color-line)' }}
          aria-label={`Stress ${i + 1} of 5`}
        >
          {face}
          <span className="text-[10px] text-muted">{i + 1}</span>
        </button>
      ))}
    </div>
  );
}

function LocationPicker({ value, onChange }: { value: LocationTag; onChange: (v: LocationTag) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {LOCATIONS.map((l) => (
        <button key={l} className="chip" data-on={value === l} onClick={() => onChange(l)}>
          {LOCATION_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

export function RelapseSheet({ onClose }: { onClose: () => void }) {
  const { profile, risk } = useEngine();
  const { setTab, toast } = useUI();
  const [stress, setStress] = useState(3);
  const [location, setLocation] = useState<LocationTag>(() => inferLocation(now()));

  const confirm = () => {
    logRelapse({ stress, location, predictedRisk: risk.p });
    haptic(HAPTICS.warn);
    toast('+5 XP for being honest', 'xp');
    onClose();
    setTab('apps');
  };

  return (
    <Sheet title="Log a slip" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">
        Thanks for being honest. One slip doesn’t erase your progress, and logging it is how the forecast learns your triggers.
      </p>
      <div className="mt-5">
        <div className="eyebrow mb-2">How stressed were you?</div>
        <StressPicker value={stress} onChange={setStress} />
      </div>
      <div className="mt-5">
        <div className="eyebrow mb-2">Where were you?</div>
        <LocationPicker value={location} onChange={setLocation} />
      </div>
      <div className="mt-5 rounded-2xl border border-coral/30 bg-coral/8 p-3.5 text-sm">
        <div className="flex items-center gap-2 font-semibold text-coral">
          <Lock size={15} /> Your pact kicks in
        </div>
        <p className="mt-1 text-muted">
          {profile.lockedApps.length} apps lock for {profile.lockMinutes} minutes. Breathe or reflect to earn up to{' '}
          {LOCK_REDUCTION_MIN * MAX_LOCK_REDUCTIONS} minutes back.
        </p>
      </div>
      <button className="btn btn-primary mt-5 w-full py-4" onClick={confirm}>
        Log it and start the reset
      </button>
    </Sheet>
  );
}

export function CheckInSheet({ onClose }: { onClose: () => void }) {
  const { open, toast } = useUI();
  const [stress, setStress] = useState(2);
  const [location, setLocation] = useState<LocationTag>(() => inferLocation(now()));
  const [craving, setCraving] = useState<CravingLevel>(0);

  const submit = () => {
    const xp = submitCheckIn({ stress, location, cravingNow: craving });
    if (xp) toast(`Check-in saved · +${xp} XP`, 'xp');
    else toast('Check-in saved', 'info');
    onClose();
    if (craving === 2) open({ kind: 'fight', mode: 'craving' });
  };

  return (
    <Sheet title="Quick check-in" onClose={onClose}>
      <div className="eyebrow mb-2">Stress right now</div>
      <StressPicker value={stress} onChange={setStress} />
      <div className="eyebrow mb-2 mt-5">Where are you?</div>
      <LocationPicker value={location} onChange={setLocation} />
      <div className="eyebrow mb-2 mt-5">Craving?</div>
      <div className="grid grid-cols-3 gap-2">
        {(['None', 'A little', 'Strong'] as const).map((label, i) => (
          <button key={label} className="chip py-2.5" data-on={craving === i} onClick={() => setCraving(i as CravingLevel)}>
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Check-ins are how the model learns your quiet moments as well as the hard ones.</p>
      <button className="btn btn-primary mt-5 w-full py-4" onClick={submit}>
        {craving === 2 ? 'Save and fight it' : 'Save check-in'}
      </button>
    </Sheet>
  );
}

const PROMPTS = ['What set it off?', 'What were you feeling right before?', 'What will you try next time instead?'];

export function ReflectSheet({ onClose }: { onClose: () => void }) {
  const { toast } = useUI();
  const [answers, setAnswers] = useState(['', '', '']);
  const ready = answers.every((a) => a.trim().length >= 3);

  return (
    <Sheet title="Trigger reflection" onClose={onClose}>
      <p className="text-sm text-muted">Three quick answers. Naming a trigger makes it easier to spot next time. These aren’t saved anywhere.</p>
      {PROMPTS.map((q, i) => (
        <label key={q} className="mt-4 block">
          <div className="mb-1.5 text-sm font-medium">{q}</div>
          <textarea
            rows={2}
            value={answers[i]}
            onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
            className="w-full resize-none rounded-2xl border border-line bg-surface-2 p-3 text-sm outline-none focus:border-mint"
          />
        </label>
      ))}
      <button
        className="btn btn-primary mt-5 w-full py-4"
        disabled={!ready}
        onClick={() => {
          if (earnLockTime('reflection')) toast(`−${LOCK_REDUCTION_MIN} min on your lock · +15 XP`, 'xp');
          else toast('You’ve already earned the maximum back for this lock.', 'info');
          onClose();
        }}
      >
        Take {LOCK_REDUCTION_MIN} minutes off
      </button>
    </Sheet>
  );
}

/** Mirrors the iOS ShieldConfiguration the native extension draws over a blocked app. */
export function ShieldOverlay({ appId, onClose }: { appId: string; onClose: () => void }) {
  const { lock } = useEngine();
  const { open } = useUI();
  const t = useNow(1000);
  const app = appById(appId);
  const remaining = lock ? effectiveLockEnd(lock) - t : 0;
  const Icon = app?.icon ?? Lock;

  return (
    <motion.div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#05090d]/92 px-8 text-center backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl opacity-40" style={{ background: app?.bg, color: app?.fg }}>
          <Icon size={36} />
        </div>
        <div className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border-4 border-[#05090d] bg-coral text-[#3a0d08]">
          <Lock size={16} strokeWidth={2.6} />
        </div>
      </div>
      <div className="mt-7 font-display text-2xl font-semibold">Nicotine reset active</div>
      <div className="mt-2 font-mono text-4xl font-bold tabular-nums text-coral">{formatCountdown(remaining)}</div>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        {app?.name ?? 'This app'} is paused while your body clears nicotine. Take 5 slow breaths instead. It helps more than scrolling.
      </p>
      <div className="mt-8 flex w-full flex-col gap-2">
        <button
          className="btn btn-primary py-4"
          onClick={() => {
            onClose();
            open({ kind: 'fight', mode: 'reduce' });
          }}
        >
          <Wind size={18} /> Breathe to earn 5 min back
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          OK
        </button>
      </div>
      <p className="mt-6 text-[11px] text-faint">On iPhone, iOS draws this shield itself (Screen Time API).</p>
    </motion.div>
  );
}

export function MilestonesSheet({ onClose }: { onClose: () => void }) {
  const { history } = useEngine();
  const t = useNow(1000);
  const milestones = milestoneProgress(history, t);
  return (
    <Sheet title="Lung recovery" onClose={onClose}>
      <div className="flex justify-center">
        <LungAvatar health={lungHealth(history, t)} size={200} />
      </div>
      <div className="mt-2 flex flex-col gap-3">
        {milestones.map((m) => (
          <div key={m.id} className="rounded-2xl bg-surface-2 p-3.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                {m.progress >= 1 && <Check size={14} className="text-mint" />}
                {m.label}
              </span>
              <span className="text-xs tabular-nums text-muted">{m.progress >= 1 ? 'Done' : `${Math.round(m.progress * 100)}% · ${formatDuration(m.remaining)}`}</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={m.progress} color={m.progress >= 1 ? 'var(--color-mint)' : 'var(--color-coral)'} height={6} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        Short-term milestones count from your last nicotine use. Longer ones keep half your earlier progress after a slip. Timelines adapted
        from smoking-cessation research; not medical advice.
      </p>
    </Sheet>
  );
}
