export function formatClock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatMinuteOfDay(minute: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minute / 60), Math.round(minute % 60));
  return formatClock(d.getTime());
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatIn(ms: number): string {
  if (ms <= 60_000) return 'now';
  return `in ${formatDuration(ms / 1000)}`;
}

export const pct = (p: number): string => `${Math.round(p * 100)}%`;

export function formatDay(t: number): string {
  return new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function riskBand(p: number): { label: string; color: string } {
  if (p >= 0.75) return { label: 'High risk', color: 'var(--color-danger)' };
  if (p >= 0.45) return { label: 'Elevated', color: 'var(--color-amber)' };
  return { label: 'Low', color: 'var(--color-mint)' };
}
