import { motion } from 'framer-motion';
import { Hand, Mic, MicOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { breathExercisePassed, cravingReward, fightResult, strikeDamage } from '../engine/fight.ts';
import { streakDays } from '../engine/recovery.ts';
import { micProblem, useMicLevel } from '../hooks/useMicLevel.ts';
import { HAPTICS, haptic } from '../lib/haptics.ts';
import { earnLockTime, passHonestyCheck, resistCraving, startHonestyAttempt, LOCK_REDUCTION_MIN } from '../state/actions.ts';
import { now } from '../state/clock.ts';
import { useDialog } from '../components/ui.tsx';
import { useEngine } from '../state/engine.tsx';
import { useUI, type FightMode } from '../state/ui.tsx';

type PhaseName = 'inhale' | 'hold' | 'exhale';
interface Phase {
  name: PhaseName;
  secs: number;
}

const CONFIG: Record<FightMode, { title: string; blurb: string; cycles: number; pattern: Phase[] }> = {
  craving: {
    title: 'Craving Boss Fight',
    blurb: 'Breathe in for 4, hold for 4, then blow steadily into the mic for 6. Every steady exhale blasts the toxic cloud.',
    cycles: 3,
    pattern: [
      { name: 'inhale', secs: 4 },
      { name: 'hold', secs: 4 },
      { name: 'exhale', secs: 6 },
    ],
  },
  reduce: {
    title: 'Earn time back',
    blurb: `Three slow 4-4-6 breaths. Finish them and the lock gets ${LOCK_REDUCTION_MIN} minutes shorter.`,
    cycles: 3,
    pattern: [
      { name: 'inhale', secs: 4 },
      { name: 'hold', secs: 4 },
      { name: 'exhale', secs: 6 },
    ],
  },
  check: {
    title: 'Breath hold & blow',
    blurb: 'A 15-second check-in: breathe in, hold, then one long steady blow into the mic.',
    cycles: 1,
    pattern: [
      { name: 'inhale', secs: 3 },
      { name: 'hold', secs: 5 },
      { name: 'exhale', secs: 7 },
    ],
  },
};

const PHASE_TEXT: Record<PhaseName, string> = { inhale: 'Breathe in', hold: 'Hold', exhale: 'Blow it out' };
const MANTRAS = [
  'Cravings rise, peak and fade, usually within a few minutes.',
  'You don’t have to fight it forever. Just this one.',
  'Your lungs are already working on healing.',
  'Notice the urge. You don’t have to obey it.',
];

function Boss({ hp, hitKey }: { hp: number; hitKey: number }) {
  const s = 0.55 + 0.45 * (hp / 100);
  const angry = hp > 0;
  return (
    <motion.svg
      key={hitKey}
      viewBox="0 0 200 130"
      width="210"
      animate={hitKey > 0 ? { x: [0, -10, 8, -5, 0], rotate: [0, -3, 2, 0] } : {}}
      transition={{ duration: 0.45 }}
      aria-hidden
    >
      <defs>
        <radialGradient id="boss" cx="45%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#6b7360" />
          <stop offset="100%" stopColor="#2c3129" />
        </radialGradient>
      </defs>
      <motion.g animate={{ scale: s, opacity: 0.25 + 0.75 * (hp / 100) }} style={{ transformOrigin: '100px 70px' }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
        {[
          [60, 78, 34],
          [100, 58, 42],
          [142, 76, 34],
          [80, 94, 28],
          [122, 96, 28],
        ].map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="url(#boss)" />
        ))}
        {angry ? (
          <>
            <ellipse cx="84" cy="70" rx="9" ry="10" fill="#e8f5d0" />
            <ellipse cx="118" cy="70" rx="9" ry="10" fill="#e8f5d0" />
            <circle cx="86" cy="73" r="4.5" fill="#141812" />
            <circle cx="116" cy="73" r="4.5" fill="#141812" />
            <path d="M72 56 L94 63 M130 56 L108 63" stroke="#141812" strokeWidth="4" strokeLinecap="round" />
            <path d="M88 94 Q101 86 114 94" stroke="#141812" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <path d="M80 72 L90 72 M110 72 L120 72 M90 92 Q100 98 110 92" stroke="#141812" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        )}
      </motion.g>
    </motion.svg>
  );
}

export function BossFight({ mode, onClose }: { mode: FightMode; onClose: () => void }) {
  const cfg = CONFIG[mode];
  // Logging always uses live readings, even while the Lab simulates sensors.
  const { liveRisk, history, simulated } = useEngine();
  const { toast, open } = useUI();
  const mic = useMicLevel();
  const dialog = useDialog<HTMLDivElement>(onClose);
  const [stage, setStage] = useState<'intro' | 'run' | 'result'>('intro');
  const [input, setInput] = useState<'mic' | 'touch'>('mic');
  const [frame, setFrame] = useState({ elapsed: 0, level: 0, threshold: 0.1, blowing: false });
  const [hp, setHp] = useState(100);
  const [hitKey, setHitKey] = useState(0);
  const [result, setResult] = useState({ blowSecs: 0, steadiness: 0 });
  const [round, setRound] = useState(1);
  const touching = useRef(false);
  /** Each result screen can be acted on once, even if the button is tapped twice while the overlay animates out. */
  const settled = useRef(false);
  /** Bumped on every start, so a mic permission answer that arrives late can't restart a round. */
  const attempt = useRef(0);

  const cycleLen = cfg.pattern.reduce((s, p) => s + p.secs, 0);
  const total = cycleLen * cfg.cycles;
  const exhaleSecs = cfg.pattern.find((p) => p.name === 'exhale')!.secs;
  const maxBlow = exhaleSecs * cfg.cycles;

  useEffect(() => {
    if (stage !== 'run') return;
    const start = performance.now();
    let last = start;
    let prevKey = '';
    let prevPhase: PhaseName | null = null;
    let blow = 0;
    let totalBlow = 0;
    let floorSum = 0;
    let floorN = 0;
    const blowLevels: number[] = [];
    let raf = 0;

    const strike = (secs: number) => {
      const dmg = strikeDamage(secs, exhaleSecs, cfg.cycles);
      if (dmg <= 0) return;
      // Snap the floating-point sliver three full hits of 100/3 leave behind.
      setHp((h) => (fightResult(h - dmg) === 'DEFEATED' ? 0 : h - dmg));
      setHitKey((k) => k + 1);
    };

    const loop = (ts: number) => {
      const elapsed = (ts - start) / 1000;
      // Capped so a backgrounded tab can't bank exhale time in one jump.
      const dt = Math.min(0.25, (ts - last) / 1000);
      last = ts;
      if (elapsed >= total) {
        strike(blow);
        const mean = blowLevels.reduce((s, v) => s + v, 0) / Math.max(1, blowLevels.length);
        const sd = Math.sqrt(blowLevels.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, blowLevels.length));
        setResult({ blowSecs: totalBlow, steadiness: blowLevels.length ? Math.max(0, 1 - sd / Math.max(mean, 1e-6)) : 0 });
        haptic(HAPTICS.success);
        setStage('result');
        return;
      }
      const cycle = Math.floor(elapsed / cycleLen);
      let within = elapsed - cycle * cycleLen;
      let idx = 0;
      while (within >= cfg.pattern[idx].secs) within -= cfg.pattern[idx++].secs;
      const phase = cfg.pattern[idx].name;
      const key = `${cycle}:${idx}`;
      if (key !== prevKey) {
        if (prevPhase === 'exhale') strike(blow);
        blow = 0;
        prevKey = key;
        prevPhase = phase;
        haptic(phase === 'inhale' ? HAPTICS.inhale : phase === 'exhale' ? HAPTICS.exhale : 15);
      }

      const level = mic.level.current;
      if (phase === 'hold') {
        floorSum += level;
        floorN++;
      }
      // Calibrate against the room: whatever the mic hears while you hold your breath is background.
      const threshold = Math.max(0.08, (floorN ? floorSum / floorN : 0.02) * 2.5 + 0.04);
      const blowing = phase === 'exhale' && (input === 'mic' ? level > threshold : touching.current);
      if (blowing) {
        blow += dt;
        totalBlow += dt;
        blowLevels.push(input === 'mic' ? level : 0.5);
      }
      setFrame({ elapsed, level, threshold, blowing });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage, input, cfg, cycleLen, total, exhaleSecs, mic.level]);

  // If the mic drops out mid-round (another app grabs it, a call comes in), switch to touch.
  useEffect(() => {
    if (stage !== 'run' || input !== 'mic' || mic.status === 'live' || mic.status === 'requesting') return;
    setInput('touch');
    toast(`${micProblem(mic.status) ?? 'The mic stopped.'} Hold the button while you exhale instead.`, 'info');
  }, [stage, input, mic.status, toast]);

  /** Called straight from a tap, so the mic's audio can start on iOS. */
  const begin = async (preferMic: boolean) => {
    // Starting the breath test buys time to finish it, even if the deadline passes mid-test.
    if (mode === 'check') startHonestyAttempt();
    const id = ++attempt.current;
    const status = preferMic ? await mic.start() : 'idle';
    // The permission prompt can sit unanswered; if the user moved on (e.g. chose touch), drop this result.
    if (id !== attempt.current) return;
    setInput(status === 'live' ? 'mic' : 'touch');
    if (preferMic && status !== 'live') toast(`${micProblem(status) ?? 'Mic unavailable.'} Hold the button while you exhale instead.`, 'info');
    // Another round keeps fighting the same boss; a beaten boss respawns at full HP.
    setHp((h) => (stage === 'intro' || h <= 0 ? 100 : h));
    setHitKey(0);
    settled.current = false;
    setStage('run');
  };

  // ── derived per-frame view state ──
  const cycle = Math.min(cfg.cycles - 1, Math.floor(frame.elapsed / cycleLen));
  let within = frame.elapsed - cycle * cycleLen;
  let idx = 0;
  while (idx < cfg.pattern.length - 1 && within >= cfg.pattern[idx].secs) within -= cfg.pattern[idx++].secs;
  const phase = cfg.pattern[idx];
  const phaseFrac = Math.min(1, within / phase.secs);
  const orbScale = phase.name === 'inhale' ? 0.55 + 0.45 * phaseFrac : phase.name === 'hold' ? 1 : 1 - 0.45 * phaseFrac;

  const passed = mode !== 'craving' && breathExercisePassed(mode, result.blowSecs, maxBlow);
  const streak = streakDays(history, now());
  const outcome = fightResult(hp);
  const reward = cravingReward(outcome, streak);

  /** Runs `fn` at most once per result screen. */
  const once = (fn: () => void) => () => {
    if (settled.current) return;
    settled.current = true;
    fn();
  };

  const finishCraving = once(() => {
    // Stress stays null: the fight doesn't ask for it, and an inferred value would be saved as if self-reported.
    const r = resistCraving({ result: outcome, stress: null, location: liveRisk.location, predictedRisk: liveRisk.p, streakDays: streak });
    if (r.xp > 0) toast(`+${r.xp} XP${r.multiplier > 1 ? ` (×${r.multiplier.toFixed(1)} streak)` : ''}`, 'xp');
    else toast('Craving logged. Breathe into the mic next time to earn XP.', 'info');
    if (r.skipPass) toast('You earned a skip pass!', 'xp');
    onClose();
  });

  return (
    <motion.div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={cfg.title}
      tabIndex={-1}
      className="absolute inset-0 z-40 flex flex-col overflow-y-auto outline-none bg-[radial-gradient(120%_70%_at_50%_0%,#163a40,#061019_70%)] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] no-scrollbar"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
    >
      <div className="flex items-center justify-between">
        <div className="eyebrow">{cfg.title}</div>
        <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-surface-2" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      {mode === 'craving' && (
        <div className="mt-2 flex flex-col items-center">
          <Boss hp={stage === 'intro' ? 100 : hp} hitKey={hitKey} />
          <div className="mt-1 w-48">
            <div className="mb-1 flex justify-between text-[11px] font-semibold uppercase tracking-wider">
              <span className="text-muted">The Craving</span>
              <span className="tabular-nums text-danger">{Math.ceil(hp)} HP</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div className="h-full rounded-full bg-linear-to-r from-danger to-amber" animate={{ width: `${hp}%` }} />
            </div>
          </div>
        </div>
      )}

      {stage === 'intro' && (
        <div className="mt-6 flex flex-1 flex-col">
          {mode !== 'craving' && (
            <div className="mx-auto mt-4 flex h-28 w-28 items-center justify-center rounded-full bg-mint/10 text-mint">
              <Mic size={40} />
            </div>
          )}
          <p className="mt-6 text-center text-[15px] leading-relaxed text-text/90">{cfg.blurb}</p>
          <p className="mt-2 text-center text-xs text-muted">Audio is measured live for loudness only. Nothing is recorded or saved.</p>
          {mic.status === 'requesting' && (
            <p className="mt-3 text-center text-xs text-sky" role="status">
              Waiting for microphone permission. Allow it in your browser’s prompt, or use touch instead.
            </p>
          )}
          {simulated && mode === 'craving' && (
            <p className="mt-3 rounded-xl bg-violet/10 px-3 py-2 text-center text-xs text-violet">
              Sensor override is on. If you log this craving, it’s saved with live readings, not the simulated ones.
            </p>
          )}
          <div className="mt-auto flex flex-col gap-2 pt-8">
            <button className="btn btn-primary py-4 text-base" onClick={() => begin(true)}>
              <Mic size={18} /> Start with microphone
            </button>
            <button className="btn btn-ghost" onClick={() => begin(false)}>
              <Hand size={18} /> Use touch instead
            </button>
          </div>
        </div>
      )}

      {stage === 'run' && (
        <div className="mt-4 flex flex-1 flex-col items-center">
          <div className="flex gap-1.5">
            {Array.from({ length: cfg.cycles }, (_, i) => (
              <div key={i} className="h-1.5 w-8 rounded-full" style={{ background: i < cycle ? 'var(--color-mint)' : i === cycle ? 'var(--color-sky)' : 'var(--color-surface-3)' }} />
            ))}
          </div>
          <div className="relative mt-6 flex h-56 w-56 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                transform: `scale(${orbScale})`,
                background: 'radial-gradient(circle at 40% 35%, rgb(125 211 252 / 0.55), rgb(94 234 212 / 0.18) 60%, transparent 72%)',
                boxShadow: frame.blowing ? '0 0 60px 10px rgb(94 234 212 / 0.45)' : '0 0 30px 0 rgb(94 234 212 / 0.15)',
                transition: 'box-shadow 120ms',
              }}
            />
            <div className="relative text-center">
              <div className="font-display text-2xl font-semibold">{PHASE_TEXT[phase.name]}</div>
              <div className="mt-1 font-mono text-4xl font-bold tabular-nums text-sky">{Math.max(1, Math.ceil(phase.secs - within))}</div>
            </div>
          </div>

          {input === 'mic' ? (
            <div className="mt-6 w-full max-w-xs">
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <Mic size={12} /> Mic level
                </span>
                <span className={frame.blowing ? 'font-semibold text-mint' : ''}>{frame.blowing ? 'Blasting!' : phase.name === 'exhale' ? 'Blow harder' : 'Listening'}</span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-linear-to-r from-mint to-sky transition-[width] duration-75" style={{ width: `${Math.min(100, frame.level * 100)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-text/70" style={{ left: `${Math.min(100, frame.threshold * 100)}%` }} />
              </div>
            </div>
          ) : (
            <button
              className="btn btn-ghost mt-6 w-full max-w-xs select-none py-5 touch-none"
              style={frame.blowing ? { borderColor: 'var(--color-mint)', color: 'var(--color-mint)' } : undefined}
              onPointerDown={() => (touching.current = true)}
              onPointerUp={() => (touching.current = false)}
              onPointerLeave={() => (touching.current = false)}
            >
              <Hand size={18} /> {phase.name === 'exhale' ? 'Hold while you exhale' : 'Get ready…'}
            </button>
          )}
          <p className="mt-auto pt-6 text-center text-sm text-muted">{MANTRAS[cycle % MANTRAS.length]}</p>
        </div>
      )}

      {stage === 'result' && (
        <div className="mt-6 flex flex-1 flex-col">
          <div className="text-center">
            <div className="font-display text-3xl font-bold">
              {mode === 'craving'
                ? outcome === 'DEFEATED'
                  ? 'Craving defeated'
                  : outcome === 'WEAKENED'
                    ? 'Craving weakened'
                    : 'No exhale detected'
                : passed
                  ? 'Nice breathing'
                  : 'Not quite'}
            </div>
            <p className="mt-2 text-sm text-muted">
              {result.blowSecs.toFixed(1)} s of steady exhale
              {input === 'mic' && result.blowSecs > 0 && ` · steadiness ${Math.round(result.steadiness * 100)}%`}
            </p>
            {mode === 'craving' && (
              <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-muted">
                {outcome === 'DEFEATED'
                  ? 'Full XP, and it counts toward your next skip pass.'
                  : outcome === 'WEAKENED'
                    ? `The boss has ${Math.ceil(hp)} HP left: half XP if you stop now, or go another round to finish it.`
                    : 'No XP this round. Logging that the craving passed still teaches your forecast.'}
              </p>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-8">
            {mode === 'craving' && (
              <>
                <p className="mb-1 text-center text-sm">How’s the craving now?</p>
                <button className="btn btn-primary py-4 text-base" onClick={finishCraving}>
                  {reward.xp > 0 ? `It passed. Claim +${reward.xp} XP` : 'It passed. Log it'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setRound((r) => r + 1);
                    void begin(input === 'mic');
                  }}
                >
                  Still there, go round {round + 1}
                </button>
                <button
                  className="btn btn-danger"
                  onClick={once(() => {
                    onClose();
                    open({ kind: 'relapse' });
                  })}
                >
                  I vaped anyway
                </button>
              </>
            )}
            {mode === 'reduce' &&
              (passed ? (
                <button
                  className="btn btn-primary py-4 text-base"
                  onClick={once(() => {
                    if (earnLockTime('breathing')) toast(`−${LOCK_REDUCTION_MIN} min on your lock`, 'xp');
                    else toast('No active lock, or you’ve already earned the maximum back.', 'info');
                    onClose();
                  })}
                >
                  Take {LOCK_REDUCTION_MIN} minutes off
                </button>
              ) : (
                <button className="btn btn-primary py-4" onClick={() => begin(input === 'mic')}>
                  Try again
                </button>
              ))}
            {mode === 'check' &&
              (passed ? (
                <button
                  className="btn btn-primary py-4 text-base"
                  onClick={once(() => {
                    if (passHonestyCheck()) toast('Check-in passed · +10 XP', 'xp');
                    else toast('That check-in had already closed, so there’s nothing to pass.', 'info');
                    onClose();
                  })}
                >
                  Done
                </button>
              ) : (
                <>
                  <p className="text-center text-xs text-muted">Hold the blow for at least 4 seconds.</p>
                  <button className="btn btn-primary py-4" onClick={() => begin(input === 'mic')}>
                    Try again
                  </button>
                </>
              ))}
            {input === 'mic' && mic.status !== 'live' && (
              <p className="flex items-center justify-center gap-1 text-xs text-muted">
                <MicOff size={12} /> Mic off
              </p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
