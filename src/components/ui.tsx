import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { levelFromXp, rankTitle, streakMultiplier } from '../engine/xp.ts';
import { useUI } from '../state/ui.tsx';

/**
 * For overlays: Escape closes, focus moves into the overlay when it opens and goes back to
 * where it was when it closes. Put the returned ref on an element with tabIndex={-1}.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <motion.button
        aria-label="Close"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative max-h-[88%] outline-none overflow-y-auto rounded-t-[2rem] border-t border-line bg-surface px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 no-scrollbar"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-3" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-surface-2" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </motion.div>
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-end justify-between px-1">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, icon, tone = 'var(--color-mint)' }: { label: string; value: ReactNode; icon: ReactNode; tone?: string }) {
  return (
    <div className="card flex flex-col gap-1.5 p-3.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}>
        {icon}
      </div>
      <div className="font-display text-lg font-semibold leading-tight tabular-nums">{value}</div>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
    </div>
  );
}

export function ProgressBar({ value, color = 'var(--color-mint)', height = 8 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface-3" style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
      />
    </div>
  );
}

export function LevelCard({ xp, streak }: { xp: number; streak: number }) {
  const lvl = levelFromXp(xp);
  const mult = streakMultiplier(streak);
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-gold/15 text-gold">
          <span className="text-[9px] font-semibold uppercase leading-none">Lv</span>
          <span className="font-display text-xl font-bold leading-none">{lvl.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-semibold">{rankTitle(lvl.level)}</span>
            <span className="text-xs tabular-nums text-muted">
              {lvl.intoLevel} / {lvl.needed} XP
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={lvl.progress} color="linear-gradient(90deg,#facc15,#fb923c)" />
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Streak multiplier <span className="font-semibold text-gold">×{mult.toFixed(1)}</span> on every craving you beat. It grows
        0.1 per vape-free day, up to ×3.
      </p>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useUI();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-50 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-xl backdrop-blur"
            style={{
              background: 'rgb(17 38 52 / 0.92)',
              borderColor: t.tone === 'xp' ? 'rgb(250 204 21 / 0.4)' : t.tone === 'warn' ? 'rgb(251 96 121 / 0.4)' : 'var(--color-line)',
              color: t.tone === 'xp' ? 'var(--color-gold)' : t.tone === 'warn' ? 'var(--color-danger)' : 'var(--color-text)',
            }}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export const STRESS_FACES = ['😌', '🙂', '😐', '😣', '😫'];
