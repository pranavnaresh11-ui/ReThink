import { motion } from 'framer-motion';
import { useMemo } from 'react';

const SICK = [118, 102, 90];
const HEALTHY = [255, 138, 122];

function mix(a: number[], b: number[], t: number, alpha = 1): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/** Flip a path of absolute x/y pairs across the trachea (x = 120). */
function mirror(path: string): string {
  let i = 0;
  return path.replace(/-?\d+(\.\d+)?/g, (n) => String(i++ % 2 === 0 ? 240 - Number(n) : Number(n)));
}

const LOBE = 'M104 70 C80 62 50 82 40 120 C30 160 38 196 66 202 C88 206 104 194 108 172 C111 150 110 100 104 70 Z';
const BRANCHES = [
  'M120 78 C118 94 108 102 96 108',
  'M96 108 C84 116 74 128 68 146',
  'M96 108 C90 126 88 148 90 172',
  'M82 118 C72 118 62 114 56 108',
  'M72 136 C62 142 56 154 54 168',
  'M89 148 C81 160 76 172 74 186',
];
/** Branch tips where leaves sprout as the lungs heal: [x, y, angle]. */
const TIPS: [number, number, number][] = [
  [68, 146, 120],
  [90, 172, 95],
  [56, 108, 200],
  [54, 168, 110],
  [74, 186, 105],
];
const ALVEOLI: [number, number][] = [
  [60, 126], [76, 110], [88, 124], [54, 146], [70, 154], [84, 140],
  [100, 134], [64, 178], [80, 166], [98, 156], [58, 190], [88, 192],
];

function seeded(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function LungAvatar({ health, size = 240, recentSlip = false }: { health: number; size?: number; recentSlip?: boolean }) {
  const h = Math.max(0, Math.min(1, health));
  const fill = mix(SICK, HEALTHY, h, 0.92);
  const fillDeep = mix([84, 72, 64], [232, 92, 96], h, 0.95);
  const branch = mix([70, 60, 52], [255, 196, 186], h, 0.85);
  const smogCount = Math.round((1 - h) * 14) + (recentSlip ? 6 : 0);

  const smog = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        x: 40 + seeded(i) * 160,
        y: 70 + seeded(i + 40) * 130,
        r: 7 + seeded(i + 80) * 9,
        drift: 4 + seeded(i + 120) * 8,
        dur: 5 + seeded(i + 160) * 5,
      })),
    [],
  );

  const sides = [false, true];
  return (
    <svg viewBox="0 0 240 220" width={size} height={(size * 220) / 240} role="img" aria-label={`Lungs ${Math.round(h * 100)}% recovered`}>
      <defs>
        <radialGradient id="lung-glow" cx="50%" cy="58%" r="55%">
          <stop offset="0%" stopColor="#5eead4" stopOpacity={0.28 * h} />
          <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lung-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor={fillDeep} />
        </linearGradient>
        <filter id="smog-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      <ellipse cx="120" cy="135" rx="118" ry="90" fill="url(#lung-glow)" />

      <motion.g
        style={{ transformOrigin: '120px 130px' }}
        animate={{ scale: [1, 1.035, 1] }}
        transition={{ duration: 4 + (1 - h) * 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* trachea */}
        <rect x="113" y="16" width="14" height="64" rx="7" fill={mix([90, 80, 72], [255, 205, 196], h, 0.9)} />
        {[26, 38, 50, 62].map((y) => (
          <line key={y} x1="114" x2="126" y1={y} y2={y} stroke="rgba(0,0,0,0.18)" strokeWidth="2" />
        ))}

        {sides.map((right) => (
          <g key={String(right)}>
            <path d={right ? mirror(LOBE) : LOBE} fill="url(#lung-fill)" stroke={mix([60, 52, 46], [255, 170, 160], h)} strokeWidth="1.5" />
            {BRANCHES.map((b) => (
              <path key={b} d={right ? mirror(b) : b} fill="none" stroke={branch} strokeWidth="3" strokeLinecap="round" />
            ))}
            {ALVEOLI.map(([x, y], i) => (
              <circle
                key={i}
                cx={right ? 240 - x : x}
                cy={y}
                r={3.2}
                fill="#fff"
                opacity={0.08 + 0.45 * Math.max(0, h - i / ALVEOLI.length / 1.3)}
              />
            ))}
            {TIPS.map(([x, y, angle], i) => {
              const grow = Math.max(0, Math.min(1, (h - 0.25 - i * 0.12) / 0.2));
              const cx = right ? 240 - x : x;
              const a = right ? 180 - angle : angle;
              return (
                <ellipse
                  key={i}
                  cx={cx}
                  cy={y}
                  rx={7 * grow}
                  ry={3.4 * grow}
                  fill="#5eead4"
                  opacity={0.85 * grow}
                  transform={`rotate(${a} ${cx} ${y})`}
                />
              );
            })}
          </g>
        ))}
      </motion.g>

      <g filter="url(#smog-blur)">
        {smog.slice(0, smogCount).map((s, i) => (
          <motion.circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="#2c2620"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.65, 0.35], x: [0, s.drift, 0], y: [0, -s.drift / 2, 0] }}
            transition={{ duration: s.dur, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </g>
    </svg>
  );
}
