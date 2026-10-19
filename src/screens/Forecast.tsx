import { Check, Eye, Zap } from 'lucide-react';
import { ForecastChart } from '../components/ForecastChart.tsx';
import { ProgressBar, Section } from '../components/ui.tsx';
import { FEATURE_LABELS } from '../engine/logistic.ts';
import { INTERVENTION_THRESHOLD } from '../engine/predictor.ts';
import { milestoneProgress } from '../engine/recovery.ts';
import { LOCATION_LABELS } from '../engine/types.ts';
import { useNow } from '../hooks/useNow.ts';
import { formatClock, formatDay, formatDuration, formatIn, pct } from '../lib/format.ts';
import { useEngine } from '../state/engine.tsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function TriggerMap() {
  const { history } = useEngine();
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const c of history.cravings) {
    const d = new Date(c.at);
    grid[d.getDay()][d.getHours()]++;
  }
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="card p-4">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: '28px repeat(24, minmax(0, 1fr))' }}>
        {grid.map((row, day) => (
          <div key={day} className="contents">
            <div className="pr-1 text-[9px] leading-[10px] text-faint">{DAYS[day]}</div>
            {row.map((n, hour) => (
              <div
                key={hour}
                title={`${DAYS[day]} ${hour}:00 · ${n} craving${n === 1 ? '' : 's'}`}
                className="aspect-square rounded-[3px]"
                style={{ background: n === 0 ? 'var(--color-surface-2)' : `rgb(251 96 121 / ${0.2 + (0.8 * n) / max})` }}
              />
            ))}
          </div>
        ))}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center text-[8px] text-faint">
            {h % 6 === 0 ? h : ''}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Every logged craving by weekday and hour. This is what the personal trigger feature C<sub>t</sub> learns from.
      </p>
    </div>
  );
}

export function Forecast() {
  const { forecast, watchWindows, risk, history } = useEngine();
  const t = useNow(5000);
  const upcoming = watchWindows.filter((w) => w.end >= t).slice(0, 4);
  const milestones = milestoneProgress(history, t);
  const recent = [...history.cravings].reverse().slice(0, 8);
  const maxAbs = Math.max(0.5, ...risk.contributions.map((c) => Math.abs(c.contribution)));

  return (
    <div className="px-4 pb-32 pt-3">
      <h1 className="px-1 font-display text-2xl font-semibold">Forecast</h1>
      <p className="px-1 text-sm text-muted">Predicted craving risk for the next 24 hours, assuming you stay vape-free.</p>

      <div className="card mt-4 p-3 pt-4">
        <ForecastChart points={forecast} />
      </div>

      <Section title="Risk windows">
        {upcoming.length === 0 ? (
          <div className="card p-4 text-sm text-muted">Nothing above 50% in the next day. Keep checking in so the forecast stays sharp.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((w) => {
              const high = w.peakP >= INTERVENTION_THRESHOLD;
              return (
              <div key={w.start} className="card flex items-center gap-3 p-3.5">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${high ? 'bg-danger/15 text-danger' : 'bg-amber/15 text-amber'}`}>
                  {high ? <Zap size={18} /> : <Eye size={18} />}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">
                    {formatClock(w.start)} – {formatClock(w.end + 15 * 60_000)}
                  </div>
                  <div className="text-xs text-muted">
                    {high ? 'High risk' : 'Watch'} · peaks at {pct(w.peakP)} around {formatClock(w.peakAt)}
                  </div>
                </div>
                <div className="text-xs font-medium text-muted">{w.start <= t ? 'now' : formatIn(w.start - t)}</div>
              </div>
              );
            })}
            <p className="px-1 text-xs text-faint">High-risk windows (75%+) get a nudge up to 30 minutes before they start.</p>
          </div>
        )}
      </Section>

      <Section title="What’s driving it right now">
        <div className="card p-4">
          {risk.contributions.map((c) => (
            <div key={c.key} className="mb-3 last:mb-0">
              <div className="flex justify-between text-xs">
                <span>{FEATURE_LABELS[c.key]}</span>
                <span className="tabular-nums text-muted">
                  {c.contribution >= 0 ? '+' : ''}
                  {c.contribution.toFixed(2)}
                </span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-surface-3">
                <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    background: c.contribution >= 0 ? 'var(--color-danger)' : 'var(--color-mint)',
                    left: c.contribution >= 0 ? '50%' : `${50 - (50 * Math.abs(c.contribution)) / maxAbs}%`,
                    width: `${(50 * Math.abs(c.contribution)) / maxAbs}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <p className="mt-3 text-xs text-muted">
            Each bar is weight × feature value in your personal model. Red pushes risk up, green pulls it down.
          </p>
        </div>
      </Section>

      <Section title="Trigger map">
        <TriggerMap />
      </Section>

      <Section title="Body recovery">
        <div className="card divide-y divide-line">
          {milestones.map((m) => (
            <div key={m.id} className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {m.progress >= 1 && <Check size={14} className="text-mint" />}
                  {m.label}
                </span>
                <span className="text-xs tabular-nums text-muted">{m.progress >= 1 ? 'Done' : formatDuration(m.remaining)}</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={m.progress} color={m.progress >= 1 ? 'var(--color-mint)' : 'var(--color-coral)'} height={6} />
              </div>
              <p className="mt-2 text-xs text-muted">{m.detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-faint">
          Estimates adapted from smoking-cessation research (CDC, American Cancer Society). Vaping-specific recovery data is still
          emerging. Not medical advice.
        </p>
      </Section>

      <Section title="Recent log">
        <div className="card divide-y divide-line">
          {recent.length === 0 && <div className="p-4 text-sm text-muted">Nothing logged yet.</div>}
          {recent.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3.5 text-sm">
              <div
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: c.outcome === 'RESISTED' ? 'var(--color-mint)' : 'var(--color-danger)' }}
              />
              <div className="flex-1">
                <div>{c.outcome === 'RESISTED' ? 'Craving beaten' : 'Slip logged'}</div>
                <div className="text-xs text-muted">
                  {formatDay(c.at)} · {formatClock(c.at)} · {LOCATION_LABELS[c.location]}
                </div>
              </div>
              <div className="text-right text-xs text-muted">
                predicted
                <div className="font-semibold tabular-nums text-text">{pct(c.predictedRisk)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
