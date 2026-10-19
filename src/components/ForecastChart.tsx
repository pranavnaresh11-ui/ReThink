import { useId, useRef, useState, type PointerEvent } from 'react';
import type { ForecastPoint } from '../engine/predictor.ts';
import { INTERVENTION_THRESHOLD } from '../engine/predictor.ts';
import { formatClock, pct } from '../lib/format.ts';

const W = 340;
const H = 160;
const PAD = { l: 30, r: 8, t: 12, b: 24 };

export function ForecastChart({ points }: { points: ForecastPoint[] }) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (p: number) => PAD.t + (1 - p) * (H - PAD.t - PAD.b);
  const line = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(pt.p).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`;
  const yThreshold = y(INTERVENTION_THRESHOLD);

  const ticks = points
    .map((pt, i) => ({ i, d: new Date(pt.at) }))
    .filter(({ d, i }) => i > 0 && d.getMinutes() < 15 && d.getHours() % 6 === 0);

  const onMove = (e: PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((vx - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  const hp = hover == null ? null : points[hover];
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full touch-none select-none"
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label="Craving risk forecast for the next 24 hours"
    >
      <defs>
        <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-hot`}>
          <rect x="0" y="0" width={W} height={yThreshold} />
        </clipPath>
      </defs>

      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(p)} y2={y(p)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={PAD.l - 6} y={y(p) + 3.5} textAnchor="end" fontSize="9" fill="var(--color-faint)">
            {p * 100}%
          </text>
        </g>
      ))}

      <path d={area} fill={`url(#${id}-area)`} />
      <path d={area} fill="#fb6079" fillOpacity="0.35" clipPath={`url(#${id}-hot)`} />
      <path d={line} fill="none" stroke="#7dd3fc" strokeWidth="2" strokeLinejoin="round" />
      <path d={line} fill="none" stroke="#fb6079" strokeWidth="2.2" strokeLinejoin="round" clipPath={`url(#${id}-hot)`} />

      <line x1={PAD.l} x2={W - PAD.r} y1={yThreshold} y2={yThreshold} stroke="#fb6079" strokeDasharray="4 4" strokeOpacity="0.8" />
      <text x={W - PAD.r} y={yThreshold - 4} textAnchor="end" fontSize="9" fill="#fb6079">
        alert at 75%
      </text>

      <circle cx={x(0)} cy={y(points[0].p)} r="4" fill="var(--color-text)" />
      <text x={x(0)} y={H - 6} fontSize="9" fill="var(--color-muted)" textAnchor="start">
        Now
      </text>
      {ticks.map(({ i, d }) => (
        <text key={i} x={x(i)} y={H - 6} fontSize="9" fill="var(--color-faint)" textAnchor="middle">
          {d.toLocaleTimeString([], { hour: 'numeric' })}
        </text>
      ))}

      {hp && hover != null && (
        <g pointerEvents="none">
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke="var(--color-text)" strokeOpacity="0.3" />
          <circle cx={x(hover)} cy={y(hp.p)} r="4.5" fill="var(--color-bg)" stroke="var(--color-text)" strokeWidth="2" />
          <g transform={`translate(${Math.min(W - 86, Math.max(PAD.l, x(hover) - 40))} ${PAD.t})`}>
            <rect width="80" height="30" rx="8" fill="var(--color-surface-3)" stroke="var(--color-line)" />
            <text x="40" y="12" textAnchor="middle" fontSize="9" fill="var(--color-muted)">
              {formatClock(hp.at)}
            </text>
            <text x="40" y="24" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-text)">
              {pct(hp.p)}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}
