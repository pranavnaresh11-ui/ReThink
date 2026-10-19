import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bell, BrainCircuit, ChevronLeft, Lock, Mic, Sparkles, Sprout, Wind } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { createProfile, seedDemo } from '../db/repo.ts';
import { LOCKABLE_APPS } from '../lib/apps.ts';
import { now } from '../state/clock.ts';

const LAST_USE = [
  { label: 'Just now', minutes: 0 },
  { label: 'About an hour ago', minutes: 60 },
  { label: 'A few hours ago', minutes: 180 },
  { label: 'Yesterday', minutes: 1440 },
  { label: '2+ days ago', minutes: 2880 },
];

/**
 * Short dependence screen adapted from the modified Fagerström Tolerance Questionnaire
 * and the Penn State Electronic Cigarette Dependence Index. Max score 9 → F0 = score / 9.
 */
const QUESTIONS: { q: string; options: [string, number][] }[] = [
  { q: 'How soon after waking up do you vape?', options: [['Within 5 min', 3], ['6–30 min', 2], ['31–60 min', 1], ['After an hour', 0]] },
  { q: 'How many times a day do you pick it up?', options: [['1–4', 0], ['5–9', 1], ['10–19', 2], ['20+', 3]] },
  { q: 'Do you ever wake up at night and vape?', options: [['Yes', 1], ['No', 0]] },
  { q: 'Is it hard not to vape where you’re not supposed to, like school?', options: [['Yes', 1], ['No', 0]] },
  { q: 'Without it for a while, do you get strong cravings or feel irritable?', options: [['Yes', 1], ['No', 0]] },
];
const MAX_SCORE = 9;

function Step({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} className="flex flex-1 flex-col">
      <h1 className="font-display text-[1.7rem] font-semibold leading-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
    </motion.div>
  );
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [lastUse, setLastUse] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>(QUESTIONS.map(() => null));
  const [cost, setCost] = useState(4);
  const [apps, setApps] = useState<string[]>(['tiktok', 'instagram', 'snapchat', 'youtube']);
  const [lockMinutes, setLockMinutes] = useState(30);

  const steps = 5;
  const canNext = [true, name.trim().length > 0 && lastUse != null, answers.every((a) => a != null), true, apps.length > 0][step] ?? true;
  const score = answers.reduce<number>((s, a) => s + (a ?? 0), 0);

  const finish = async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    } catch {
      /* ignore */
    }
    const t = now();
    createProfile({
      name: name.trim(),
      createdAt: t,
      quitStart: t - (lastUse ?? 0) * 60_000,
      dependence: score / MAX_SCORE,
      dailyCost: cost,
      lockMinutes,
      lockedApps: apps,
      xp: 0,
      skipPasses: 1,
    });
  };

  if (step === 0) {
    return (
      <div className="flex h-full flex-col overflow-y-auto px-6 pb-8 pt-12 no-scrollbar">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-linear-to-br from-mint to-sky text-[#04212b] shadow-[0_20px_50px_-15px_rgb(94_234_212/0.7)]"
          >
            <Wind size={38} strokeWidth={2.2} />
          </motion.div>
          <h1 className="mt-6 font-display text-4xl font-bold">Exhale</h1>
          <p className="mt-2 max-w-[18rem] text-[15px] leading-relaxed text-muted">Quit vaping with an app that sees cravings coming before you do.</p>
          <div className="mt-10 flex w-full flex-col gap-3 text-left">
            {[
              [<BrainCircuit size={18} />, 'Predicts your cravings', 'An on-device model learns your triggers and warns you 15–30 min early.'],
              [<Lock size={18} />, 'Locks your apps if you slip', 'A pact with yourself, enforced by the phone’s own Screen Time shield.'],
              [<Sprout size={18} />, 'Heals with you', 'Watch your lungs recover in real time and level up every craving you beat.'],
            ].map(([icon, title, body]) => (
              <div key={title as string} className="card flex gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mint/12 text-mint">{icon}</div>
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="text-sm text-muted">{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <button className="btn btn-primary py-4 text-base" onClick={() => setStep(1)}>
            Start my quit <ArrowRight size={18} />
          </button>
          <button className="btn btn-ghost" onClick={() => seedDemo(now())}>
            <Sparkles size={16} className="text-violet" /> Explore with a demo user
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-8 pt-8 no-scrollbar">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => setStep((s) => s - 1)} className="rounded-full p-2 text-muted hover:bg-surface-2" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: steps - 1 }, (_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < step ? 'var(--color-mint)' : 'var(--color-surface-3)' }} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <Step key="1" title="Let’s set your starting line" subtitle="Your answers stay on this phone.">
            <label className="eyebrow mb-2" htmlFor="name">
              What should we call you?
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name or nickname"
              className="rounded-2xl border border-line bg-surface px-4 py-3.5 outline-none focus:border-mint"
            />
            <div className="eyebrow mb-2 mt-6">When did you last vape?</div>
            <div className="flex flex-wrap gap-2">
              {LAST_USE.map((o) => (
                <button key={o.label} className="chip" data-on={lastUse === o.minutes} onClick={() => setLastUse(o.minutes)}>
                  {o.label}
                </button>
              ))}
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step key="2" title="How hooked is your body?" subtitle="This tunes the cold-start model until it learns your own patterns.">
            <div className="flex flex-col gap-5">
              {QUESTIONS.map((q, qi) => (
                <div key={q.q}>
                  <div className="mb-2 text-sm font-medium">{q.q}</div>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(([label, pts]) => (
                      <button
                        key={label}
                        className="chip"
                        data-on={answers[qi] === pts}
                        onClick={() => setAnswers((a) => a.map((v, i) => (i === qi ? pts : v)))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {answers.every((a) => a != null) && (
              <div className="card mt-6 p-4 text-sm">
                Dependence score <span className="font-semibold text-mint">{score} / {MAX_SCORE}</span>
                <span className="text-muted"> · {score >= 6 ? 'high' : score >= 3 ? 'moderate' : 'low'}. Expect withdrawal to feel {score >= 6 ? 'strong' : 'manageable'} for the first 3 days.</span>
              </div>
            )}
          </Step>
        )}

        {step === 3 && (
          <Step key="3" title="What does it cost you?" subtitle="Pods, disposables, refills, averaged per day.">
            <div className="text-center font-display text-5xl font-bold tabular-nums">${cost.toFixed(2)}</div>
            <input className="mt-6" type="range" min={0} max={20} step={0.5} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
            <div className="card mt-6 grid grid-cols-3 divide-x divide-line p-4 text-center">
              {[
                ['week', 7],
                ['month', 30],
                ['year', 365],
              ].map(([label, d]) => (
                <div key={label}>
                  <div className="font-display text-lg font-semibold tabular-nums">${(cost * (d as number)).toFixed(0)}</div>
                  <div className="text-xs text-muted">a {label}</div>
                </div>
              ))}
            </div>
          </Step>
        )}

        {step === 4 && (
          <Step key="4" title="Make the pact" subtitle="If you log nicotine use, or skip an honesty check-in, these apps lock. Calls and texts always work.">
            <div className="flex flex-wrap gap-2">
              {LOCKABLE_APPS.map((a) => (
                <button key={a.id} className="chip" data-on={apps.includes(a.id)} onClick={() => setApps((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))}>
                  {a.name}
                </button>
              ))}
            </div>
            <div className="eyebrow mb-2 mt-6">Lock for</div>
            <div className="flex gap-2">
              {[15, 30, 45, 60].map((m) => (
                <button key={m} className="chip flex-1" data-on={lockMinutes === m} onClick={() => setLockMinutes(m)}>
                  {m} min
                </button>
              ))}
            </div>
            <div className="card mt-6 flex flex-col gap-3 p-4 text-sm text-muted">
              <div className="flex gap-2.5">
                <Bell size={16} className="mt-0.5 shrink-0 text-sky" /> Notifications warn you before a predicted high-risk window.
              </div>
              <div className="flex gap-2.5">
                <Mic size={16} className="mt-0.5 shrink-0 text-sky" /> The mic measures breath strength during exercises. Nothing is recorded.
              </div>
            </div>
          </Step>
        )}
      </AnimatePresence>

      <button className="btn btn-primary mt-8 py-4 text-base" disabled={!canNext} onClick={() => (step === steps - 1 ? void finish() : setStep((s) => s + 1))}>
        {step === steps - 1 ? 'I’m in. Start my quit' : 'Continue'} <ArrowRight size={18} />
      </button>
    </div>
  );
}
