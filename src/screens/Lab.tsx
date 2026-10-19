import { Bell, Database, FastForward, RotateCcw, ShieldAlert, Sparkles, Trash2, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { RiskGauge } from '../components/RiskGauge.tsx';
import { Section } from '../components/ui.tsx';
import { resetAll, seedDemo, tableRows } from '../db/repo.ts';
import { TABLES, type TableName } from '../db/schema.ts';
import { MS_PER_DAY } from '../engine/features.ts';
import { FEATURE_KEYS, FEATURE_LABELS } from '../engine/logistic.ts';
import { COLD_START_DAYS } from '../engine/predictor.ts';
import { LOCATIONS, LOCATION_LABELS } from '../engine/types.ts';
import { formatClock, formatDay, formatMinuteOfDay, pct } from '../lib/format.ts';
import { issueHonestyCheck } from '../state/actions.ts';
import { clockOffset, now, resetClock, warp } from '../state/clock.ts';
import { useEngine } from '../state/engine.tsx';
import { nextSchoolDay, setSim, useSim } from '../state/simulator.ts';
import { useUI } from '../state/ui.tsx';

const f2 = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2);
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function Slider({ label, value, display, min, max, step, onChange }: { label: string; value: number; display: ReactNode; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono tabular-nums text-text">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Equation() {
  const { risk, model } = useEngine();
  const w0 = model.weights[0];
  return (
    <div className="card p-4 font-mono text-[11.5px] leading-relaxed">
      <div className="text-muted">z = w₀ + Σ wᵢ·xᵢ</div>
      <div className="mt-1 flex flex-wrap gap-x-2">
        <span className="text-violet">{w0.toFixed(2)}</span>
        {risk.contributions.map((c) => (
          <span key={c.key} className="whitespace-nowrap">
            {f2(c.weight)}·<span className="text-sky">{c.key}</span>
            <span className="text-faint">({c.value.toFixed(2)})</span>
          </span>
        ))}
      </div>
      <div className="mt-1">
        = <span className="text-text">{risk.logit.toFixed(2)}</span> → σ(z) = <span className="text-sky">{pct(risk.pPersonal)}</span> personal
      </div>
      <div className="mt-3 border-t border-line pt-3 text-muted">P = w_h·P_heuristic + (1 − w_h)·P_personal</div>
      <div className="mt-1">
        = {risk.wHeuristic.toFixed(2)}·<span className="text-amber">{pct(risk.pHeuristic)}</span> + {(1 - risk.wHeuristic).toFixed(2)}·
        <span className="text-sky">{pct(risk.pPersonal)}</span> = <span className="font-bold text-text">{pct(risk.p)}</span>
      </div>
    </div>
  );
}

function ModelCard() {
  const { model, risk, history, t } = useEngine();
  const days = (t - history.trackingStart) / MS_PER_DAY;
  const phaseLabel = { COLD_START: 'Cold start (clinical heuristic)', BLENDING: 'Blending → personal', PERSONAL: 'Personal model' }[risk.phase];
  return (
    <div className="card p-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="eyebrow">Phase</div>
          <div className="mt-1 font-semibold">{phaseLabel}</div>
        </div>
        <div>
          <div className="eyebrow">Day</div>
          <div className="mt-1 font-semibold">
            {Math.floor(days) + 1}
            <span className="text-xs font-normal text-muted"> (hand-over starts day {COLD_START_DAYS + 1})</span>
          </div>
        </div>
        <div>
          <div className="eyebrow">Training samples</div>
          <div className="mt-1 font-semibold tabular-nums">
            {model.positives} <span className="text-xs font-normal text-muted">cravings</span> · {model.negatives}{' '}
            <span className="text-xs font-normal text-muted">quiet</span>
          </div>
        </div>
        <div>
          <div className="eyebrow">Hold-out AUC</div>
          <div className="mt-1 font-semibold tabular-nums">
            {model.holdout?.auc != null ? (
              <>
                <span className="text-sky">{model.holdout.auc.toFixed(2)}</span>
                <span className="text-xs font-normal text-muted"> vs {model.holdout.heuristicAuc?.toFixed(2) ?? '–'} heuristic</span>
              </>
            ) : (
              <span className="text-xs font-normal text-muted">needs more data</span>
            )}
          </div>
        </div>
      </div>

      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="text-left text-faint">
            <th className="pb-1.5 font-medium">Weight</th>
            <th className="pb-1.5 text-right font-medium">Population prior</th>
            <th className="pb-1.5 text-right font-medium">Learned for you</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {['bias', ...FEATURE_KEYS].map((k, i) => {
            const delta = model.weights[i] - model.prior[i];
            return (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5 font-sans text-muted">{k === 'bias' ? 'w₀ bias' : FEATURE_LABELS[k as (typeof FEATURE_KEYS)[number]]}</td>
                <td className="py-1.5 text-right text-faint">{model.prior[i].toFixed(2)}</td>
                <td className="py-1.5 text-right">
                  {model.weights[i].toFixed(2)}
                  <span className={delta >= 0 ? 'text-danger' : 'text-mint'}> {f2(delta)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        On-device logistic regression, trained by gradient descent with a Gaussian prior centred on population weights (MAP), so a few
        logs nudge it instead of overfitting. AUC is measured on the most recent 25% of samples, which the model never saw.
      </p>
    </div>
  );
}

function DbInspector() {
  const { dbVersion } = useEngine();
  const [table, setTable] = useState<TableName>('craving_events');
  void dbVersion;
  const { columns, rows, total } = tableRows(table, 12);
  const fmt = (col: string, v: unknown) => {
    if (v == null) return <span className="text-faint">NULL</span>;
    if (typeof v === 'number' && /time|timestamp|created_at/.test(col) && v > 1e12) return `${formatDay(v)} ${formatClock(v)}`;
    if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(3);
    const s = String(v);
    return s.length > 28 ? `${s.slice(0, 28)}…` : s;
  };
  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-1.5">
        {TABLES.map((tname) => (
          <button key={tname} className="chip px-2.5 py-1 font-mono text-[11px]" data-on={table === tname} onClick={() => setTable(tname)}>
            {tname}
          </button>
        ))}
      </div>
      <div className="mt-3 font-mono text-[10.5px] text-faint">
        SELECT * FROM {table} … → {total} row{total === 1 ? '' : 's'}
      </div>
      <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-line no-scrollbar">
        <table className="w-max min-w-full font-mono text-[10.5px]">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-sky">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((v, j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-1.5 text-muted">
                    {fmt(columns[j], v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Real SQLite (compiled to WebAssembly), stored only on this device. Nothing is uploaded.</p>
    </div>
  );
}

export function Lab() {
  const { risk, simulated, profile } = useEngine();
  const sim = useSim();
  const { toast, setNudge } = useUI();
  const offset = clockOffset();

  const loadDemo = () => {
    resetClock();
    seedDemo(now(), profile.lockedApps);
    setSim({ enabled: false });
    toast('Loaded 14 days of demo history. Model retrained.', 'info');
  };

  const highRiskScenario = () => {
    setNudge(null);
    setSim({ enabled: true, weekday: nextSchoolDay(), minute: 15 * 60 + 10, minutesSinceUse: 540, stress: 0.85, location: 'SCHOOL' });
  };

  return (
    <div className="px-4 pb-32 pt-3">
      <div className="flex items-center justify-between px-1">
        <h1 className="font-display text-2xl font-semibold">Lab</h1>
        <span className="rounded-full bg-violet/15 px-2.5 py-1 text-[11px] font-semibold text-violet">Judge mode</span>
      </div>
      <p className="px-1 text-sm text-muted">Look inside the prediction engine. Override the sensors and watch the model react.</p>

      <div className="card mt-4 p-4">
        <div className="flex justify-center">
          <RiskGauge p={risk.p} size={230} simulated={simulated} />
        </div>
        <label className="mt-4 flex items-center justify-between rounded-2xl bg-surface-2 px-3.5 py-3 text-sm">
          <span>
            <span className="font-semibold">Override sensors</span>
            <span className="block text-xs text-muted">Replaces live time, withdrawal and stress</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-[var(--color-mint)]" checked={sim.enabled} onChange={(e) => setSim({ enabled: e.target.checked })} />
        </label>
        <fieldset disabled={!sim.enabled} className="mt-4 flex flex-col gap-4 transition-opacity disabled:opacity-40">
          <div>
            <div className="mb-1.5 text-xs text-muted">Day of week</div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((d, i) => (
                <button key={i} className="chip px-0 py-1.5" data-on={sim.weekday === i} onClick={() => setSim({ weekday: i })} aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <Slider label="Time of day (T)" value={sim.minute} display={formatMinuteOfDay(sim.minute)} min={0} max={1435} step={5} onChange={(v) => setSim({ minute: v })} />
          <Slider
            label="Since last nicotine (D)"
            value={sim.minutesSinceUse}
            display={sim.minutesSinceUse < 120 ? `${sim.minutesSinceUse} min` : `${(sim.minutesSinceUse / 60).toFixed(1)} h`}
            min={0}
            max={4320}
            step={10}
            onChange={(v) => setSim({ minutesSinceUse: v })}
          />
          <Slider label="Stress (S)" value={sim.stress} display={sim.stress.toFixed(2)} min={0} max={1} step={0.05} onChange={(v) => setSim({ stress: v })} />
          <div>
            <div className="mb-1.5 text-xs text-muted">Location (affects C)</div>
            <div className="flex gap-1.5">
              {LOCATIONS.map((l) => (
                <button key={l} className="chip px-3 py-1.5" data-on={sim.location === l} onClick={() => setSim({ location: l })}>
                  {LOCATION_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn btn-ghost px-3 text-sm" onClick={() => setSim({ enabled: true, weekday: nextSchoolDay(), minute: 10 * 60 + 45, minutesSinceUse: 30, stress: 0.15, location: 'SCHOOL' })}>
            Calm morning
          </button>
          <button className="btn btn-ghost px-3 text-sm" onClick={highRiskScenario}>
            <Zap size={15} className="text-danger" /> 3:10 PM, stressed
          </button>
        </div>
      </div>

      <Section title="Live equation">
        <Equation />
      </Section>

      <Section title="Model">
        <ModelCard />
      </Section>

      <Section title="Time machine">
        <div className="card p-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">App clock</span>
            <span className="font-mono tabular-nums">
              {formatDay(now())} {formatClock(now())}
            </span>
          </div>
          {offset !== 0 && <div className="mt-1 text-right text-xs text-amber">{(offset / 3_600_000).toFixed(1)} h ahead of real time</div>}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              ['+15m', 15 * 60_000],
              ['+1h', 3_600_000],
              ['+1d', MS_PER_DAY],
              ['+1w', 7 * MS_PER_DAY],
            ].map(([label, ms]) => (
              <button key={label} className="btn btn-ghost px-2 py-2.5 text-sm" onClick={() => warp(ms as number)}>
                <FastForward size={14} /> {label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost mt-2 w-full py-2.5 text-sm" disabled={offset === 0} onClick={resetClock}>
            <RotateCcw size={14} /> Back to real time
          </button>
          <p className="mt-2 text-xs text-muted">Jump ahead to watch lungs heal, locks expire and the model hand over from heuristic to personal.</p>
        </div>
      </Section>

      <Section title="Demo controls">
        <div className="card flex flex-col gap-2 p-4">
          <button className="btn btn-primary text-sm" onClick={loadDemo}>
            <Sparkles size={16} /> Load 14-day demo user
          </button>
          <button
            className="btn btn-ghost text-sm"
            onClick={() => {
              issueHonestyCheck(90_000);
              toast('Honesty check-in issued (90 s for the demo).', 'info');
            }}
          >
            <ShieldAlert size={16} className="text-violet" /> Trigger honesty check-in
          </button>
          <button
            className="btn btn-ghost text-sm"
            onClick={async () => {
              if (!('Notification' in window)) return toast('Notifications aren’t supported in this browser.', 'warn');
              const r = await Notification.requestPermission();
              toast(r === 'granted' ? 'Notifications on.' : 'Notifications blocked.', r === 'granted' ? 'info' : 'warn');
            }}
          >
            <Bell size={16} /> Enable notifications
          </button>
          <button
            className="btn btn-danger text-sm"
            onClick={() => {
              if (window.confirm('Delete all data on this device and start over?')) {
                setSim({ enabled: false });
                resetClock();
                resetAll();
              }
            }}
          >
            <Trash2 size={16} /> Reset everything
          </button>
        </div>
      </Section>

      <Section title="On-device database" action={<Database size={14} className="text-faint" />}>
        <DbInspector />
      </Section>
    </div>
  );
}
