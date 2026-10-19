import { motion } from 'framer-motion';
import { INTERVENTION_THRESHOLD } from '../engine/predictor.ts';
import { riskBand } from '../lib/format.ts';

const R = 90;
const CX = 110;
const CY = 108;

function pointAt(p: number, r = R): [number, number] {
  const theta = Math.PI * (1 - p);
  return [CX + r * Math.cos(theta), CY - r * Math.sin(theta)];
}

export function RiskGauge({ p, size = 220, simulated = false }: { p: number; size?: number; simulated?: boolean }) {
  const band = riskBand(p);
  const [tx1, ty1] = pointAt(INTERVENTION_THRESHOLD, R - 13);
  const [tx2, ty2] = pointAt(INTERVENTION_THRESHOLD, R + 13);
  const [nx, ny] = pointAt(p);
  const arc = `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <div className="relative" style={{ width: size, height: (size * 130) / 220 }}>
      <svg viewBox="0 0 220 130" width={size} height={(size * 130) / 220} aria-hidden>
        <defs>
          <linearGradient id="risk-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="55%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#fb6079" />
          </linearGradient>
        </defs>
        <path d={arc} fill="none" stroke="var(--color-surface-3)" strokeWidth="16" strokeLinecap="round" />
        <motion.path
          d={arc}
          fill="none"
          stroke="url(#risk-grad)"
          strokeWidth="16"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: Math.max(0.001, p) }}
          transition={{ type: 'spring', stiffness: 80, damping: 18 }}
        />
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="var(--color-text)" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="3 3" />
        <motion.circle
          r="7"
          fill="var(--color-bg)"
          stroke={band.color}
          strokeWidth="3"
          initial={false}
          animate={{ cx: nx, cy: ny }}
          transition={{ type: 'spring', stiffness: 80, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <div className="font-display text-[2.6rem] font-bold leading-none tabular-nums" style={{ color: band.color }}>
          {Math.round(p * 100)}
          <span className="text-xl">%</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          {band.label}
          {simulated && <span className="rounded-full bg-violet/15 px-1.5 py-0.5 text-[10px] text-violet">Simulated</span>}
        </div>
      </div>
    </div>
  );
}
