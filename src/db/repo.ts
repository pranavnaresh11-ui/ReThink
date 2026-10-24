import type { BindParams, SqlValue } from 'sql.js';
import { generateDemoHistory } from '../engine/demo.ts';
import { encodeTimeOfDay, minuteOfDay } from '../engine/features.ts';
import type { CheckIn, CravingEvent, CravingLevel, History, LocationTag, Outcome } from '../engine/types.ts';
import type { TableName } from './schema.ts';
import { eraseStoredCopies, getDb, schedulePersist } from './sqlite.ts';
import { wipeUserData } from './wipe.ts';

// ── change notification ──────────────────────────────────────────────────────
let version = 0;
const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const getVersion = () => version;

function commit(): void {
  version++;
  schedulePersist();
  listeners.forEach((fn) => fn());
}

// ── query helpers ────────────────────────────────────────────────────────────
type Row = Record<string, SqlValue>;

function all<T = Row>(sql: string, params: BindParams = []): T[] {
  const stmt = getDb().prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

function run(sql: string, params: BindParams = []): number {
  getDb().run(sql, params);
  return Number(getDb().exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0);
}

/** Corrupt JSON in one cell shouldn't take the whole app down. */
function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

// ── user_profile ─────────────────────────────────────────────────────────────
export interface Profile {
  name: string;
  createdAt: number;
  quitStart: number;
  dependence: number;
  dailyCost: number;
  lockMinutes: number;
  lockedApps: string[];
  xp: number;
  skipPasses: number;
}

interface ProfileRow {
  name: string;
  created_at: number;
  quit_start_timestamp: number;
  baseline_fagerstrom_score: number;
  daily_vape_cost: number;
  lock_minutes: number;
  locked_apps: string;
  current_xp: number;
  streak_freeze_tokens: number;
}

export function getProfile(): Profile | null {
  const r = all<ProfileRow>('SELECT * FROM user_profile WHERE user_id = 1')[0];
  if (!r) return null;
  return {
    name: r.name,
    createdAt: r.created_at,
    quitStart: r.quit_start_timestamp,
    dependence: r.baseline_fagerstrom_score,
    dailyCost: r.daily_vape_cost,
    lockMinutes: r.lock_minutes,
    lockedApps: parseJson<string[]>(r.locked_apps, []),
    xp: r.current_xp,
    skipPasses: r.streak_freeze_tokens,
  };
}

function writeProfile(p: Profile): void {
  run(
    `INSERT OR REPLACE INTO user_profile
       (user_id, name, created_at, quit_start_timestamp, baseline_fagerstrom_score, daily_vape_cost,
        lock_minutes, locked_apps, current_xp, streak_freeze_tokens)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.name, p.createdAt, p.quitStart, p.dependence, p.dailyCost, p.lockMinutes, JSON.stringify(p.lockedApps), p.xp, p.skipPasses],
  );
}

export function createProfile(p: Profile): void {
  writeProfile(p);
  commit();
}

export function updateProfile(patch: Partial<Profile>): void {
  const current = getProfile();
  if (!current) return;
  writeProfile({ ...current, ...patch });
  commit();
}

export function addXp(amount: number): void {
  run('UPDATE user_profile SET current_xp = current_xp + ? WHERE user_id = 1', [Math.round(amount)]);
  commit();
}

// ── craving_events & check_ins ───────────────────────────────────────────────
interface CravingRow {
  event_id: number;
  timestamp: number;
  stress_level: number | null;
  location_tag: LocationTag;
  predicted_risk_score: number;
  outcome: Outcome;
  intervention_completed: number;
}

export function listCravings(): CravingEvent[] {
  return all<CravingRow>('SELECT * FROM craving_events ORDER BY timestamp').map((r) => ({
    id: r.event_id,
    at: r.timestamp,
    stress: r.stress_level,
    location: r.location_tag,
    predictedRisk: r.predicted_risk_score,
    outcome: r.outcome,
    interventionCompleted: r.intervention_completed === 1,
  }));
}

function insertCraving(e: Omit<CravingEvent, 'id'>): number {
  const t = encodeTimeOfDay(minuteOfDay(e.at));
  return run(
    `INSERT INTO craving_events
       (timestamp, hour_sin, hour_cos, stress_level, location_tag, predicted_risk_score, outcome, intervention_completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.at, t.sin, t.cos, e.stress, e.location, e.predictedRisk, e.outcome, e.interventionCompleted ? 1 : 0],
  );
}

export function logCraving(e: Omit<CravingEvent, 'id'>): number {
  const id = insertCraving(e);
  commit();
  return id;
}

interface CheckInRow {
  check_in_id: number;
  timestamp: number;
  stress_level: number;
  location_tag: LocationTag;
  craving_now: CravingLevel;
}

export function listCheckIns(): CheckIn[] {
  return all<CheckInRow>('SELECT * FROM check_ins ORDER BY timestamp').map((r) => ({
    id: r.check_in_id,
    at: r.timestamp,
    stress: r.stress_level,
    location: r.location_tag,
    cravingNow: r.craving_now,
  }));
}

function insertCheckIn(c: Omit<CheckIn, 'id'>): number {
  return run('INSERT INTO check_ins (timestamp, stress_level, location_tag, craving_now) VALUES (?, ?, ?, ?)', [
    c.at,
    c.stress,
    c.location,
    c.cravingNow,
  ]);
}

export function logCheckIn(c: Omit<CheckIn, 'id'>): number {
  const id = insertCheckIn(c);
  commit();
  return id;
}

export function countInterventionWins(): number {
  return Number(
    all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM craving_events WHERE outcome = 'RESISTED' AND intervention_completed = 1",
    )[0].n,
  );
}

export function loadHistory(p: Profile): History {
  return {
    trackingStart: p.createdAt,
    quitStart: p.quitStart,
    dependence: p.dependence,
    cravings: listCravings(),
    checkIns: listCheckIns(),
  };
}

// ── lock_sessions ────────────────────────────────────────────────────────────
export type LockReason = 'RELAPSE' | 'MISSED_CHECKIN';

export interface LockSession {
  id: number;
  triggeredBy: number | null;
  reason: LockReason;
  start: number;
  /** Planned end before any breathing reductions. */
  end: number;
  reducedMinutes: number;
  status: 'ACTIVE' | 'COMPLETED';
}

export const effectiveLockEnd = (l: LockSession) => l.end - l.reducedMinutes * 60_000;

interface LockRow {
  lock_id: number;
  triggered_by_event_id: number | null;
  reason: LockReason;
  start_time: number;
  end_time: number;
  minutes_reduced_by_breathing: number;
  status: 'ACTIVE' | 'COMPLETED';
}

const toLock = (r: LockRow): LockSession => ({
  id: r.lock_id,
  triggeredBy: r.triggered_by_event_id,
  reason: r.reason,
  start: r.start_time,
  end: r.end_time,
  reducedMinutes: r.minutes_reduced_by_breathing,
  status: r.status,
});

export function listLocks(): LockSession[] {
  return all<LockRow>('SELECT * FROM lock_sessions ORDER BY start_time DESC').map(toLock);
}

export function getActiveLock(): LockSession | null {
  const r = all<LockRow>("SELECT * FROM lock_sessions WHERE status = 'ACTIVE' ORDER BY start_time DESC LIMIT 1")[0];
  return r ? toLock(r) : null;
}

export function startLock(reason: LockReason, start: number, minutes: number, triggeredBy: number | null = null): void {
  // One lock at a time: a new trigger replaces (and extends) the current one.
  run("UPDATE lock_sessions SET status = 'COMPLETED' WHERE status = 'ACTIVE'");
  run(
    `INSERT INTO lock_sessions (triggered_by_event_id, reason, start_time, end_time, minutes_reduced_by_breathing, status)
     VALUES (?, ?, ?, ?, 0, 'ACTIVE')`,
    [triggeredBy, reason, start, start + minutes * 60_000],
  );
  commit();
}

export function reduceLock(id: number, minutes: number): void {
  run('UPDATE lock_sessions SET minutes_reduced_by_breathing = minutes_reduced_by_breathing + ? WHERE lock_id = ?', [
    minutes,
    id,
  ]);
  commit();
}

/**
 * After the time machine jumps back to real time, a lock started in the "future" would
 * otherwise last until that future arrives. Slide it so it starts now, same length.
 */
export function rebaseFutureLock(now: number): void {
  const active = getActiveLock();
  if (!active || active.start <= now) return;
  const shift = active.start - now;
  run('UPDATE lock_sessions SET start_time = start_time - ?, end_time = end_time - ? WHERE lock_id = ?', [shift, shift, active.id]);
  commit();
}

/** The DeviceActivityMonitor `intervalDidEnd` equivalent. Returns true if a lock ended. */
export function settleLocks(now: number): boolean {
  const active = getActiveLock();
  if (!active || effectiveLockEnd(active) > now) return false;
  run("UPDATE lock_sessions SET status = 'COMPLETED' WHERE lock_id = ?", [active.id]);
  commit();
  return true;
}

// ── app_state (key/value) ────────────────────────────────────────────────────
export function kvGet<T>(key: string): T | null {
  const r = all<{ value: string }>('SELECT value FROM app_state WHERE key = ?', [key])[0];
  return r ? parseJson<T | null>(r.value, null) : null;
}

export function kvSet(key: string, value: unknown): void {
  run('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
  commit();
}

export function kvDelete(key: string): void {
  run('DELETE FROM app_state WHERE key = ?', [key]);
  commit();
}

// ── demo & maintenance ───────────────────────────────────────────────────────
function wipe(): void {
  // Loading the demo from the Lab shouldn't kick the judge out of the Lab.
  wipeUserData(getDb(), ['clock_offset_ms', 'judge_mode']);
}

/** "Delete my data": every row, then every stored copy on the device. */
export function resetAll(): void {
  wipeUserData(getDb());
  commit();
  void eraseStoredCopies();
}

/** Replaces all data with two weeks of history from a demo user, so the personal model has something to learn. */
export function seedDemo(now: number, keepLockedApps?: string[]): void {
  const demo = generateDemoHistory(now);
  wipe();
  const db = getDb();
  db.exec('BEGIN');
  try {
    writeProfile({
      name: 'Alex',
      createdAt: demo.history.trackingStart,
      quitStart: demo.history.quitStart,
      dependence: demo.history.dependence,
      dailyCost: 4.5,
      lockMinutes: 30,
      lockedApps: keepLockedApps ?? ['tiktok', 'instagram', 'snapchat', 'youtube', 'games'],
      xp: 0,
      skipPasses: 1,
    });
    let xp = 0;
    let lastRelapseId: number | null = null;
    let lastRelapseAt = 0;
    for (const c of demo.cravings) {
      const id = insertCraving(c);
      if (c.outcome === 'RELAPSED') {
        lastRelapseId = id;
        lastRelapseAt = c.at;
        xp += 5;
      } else if (c.interventionCompleted) xp += 60;
      else xp += 20;
    }
    for (const c of demo.checkIns) {
      insertCheckIn(c);
      xp += 10;
    }
    if (lastRelapseId != null) {
      run(
        `INSERT INTO lock_sessions (triggered_by_event_id, reason, start_time, end_time, minutes_reduced_by_breathing, status)
         VALUES (?, 'RELAPSE', ?, ?, 10, 'COMPLETED')`,
        [lastRelapseId, lastRelapseAt, lastRelapseAt + 30 * 60_000],
      );
    }
    run('UPDATE user_profile SET current_xp = ? WHERE user_id = 1', [xp]);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  commit();
}

export function tableRows(table: TableName, limit = 25): { columns: string[]; rows: SqlValue[][]; total: number } {
  const order = table === 'user_profile' || table === 'app_state' ? '' : 'ORDER BY 1 DESC';
  const columns = all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
  const res = getDb().exec(`SELECT * FROM ${table} ${order} LIMIT ${limit}`)[0];
  const total = Number(getDb().exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0]);
  return { columns, rows: res?.values ?? [], total };
}
