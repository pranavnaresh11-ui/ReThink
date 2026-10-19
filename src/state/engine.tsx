import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getActiveLock, getProfile, getVersion, loadHistory, subscribe, type LockSession, type Profile } from '../db/repo.ts';
import {
  assessRisk,
  fitPersonalModel,
  forecastRisk,
  riskWindows,
  WATCH_THRESHOLD,
  type ForecastPoint,
  type PersonalModel,
  type RiskAssessment,
  type RiskWindow,
} from '../engine/predictor.ts';
import type { History } from '../engine/types.ts';
import { now } from './clock.ts';
import { useSim } from './simulator.ts';

const TICK_MS = 10_000;

export interface EngineValue {
  /** Engine time, 10 s resolution. */
  t: number;
  dbVersion: number;
  profile: Profile;
  history: History;
  model: PersonalModel;
  risk: RiskAssessment;
  simulated: boolean;
  forecast: ForecastPoint[];
  /** Stretches above the 75% intervention threshold. */
  windows: RiskWindow[];
  /** Stretches above 50%: worth planning around, no push. */
  watchWindows: RiskWindow[];
  lock: LockSession | null;
}

const EngineContext = createContext<EngineValue | null>(null);

export function useDbVersion(): number {
  return useSyncExternalStore(subscribe, getVersion);
}

/** Ticks every 10 s of app time; jumps immediately when the time machine moves. */
function useEngineTick(dbVersion: number): number {
  const [tick, setTick] = useState(() => Math.floor(now() / TICK_MS));
  useEffect(() => {
    const id = window.setInterval(() => setTick(Math.floor(now() / TICK_MS)), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    setTick(Math.floor(now() / TICK_MS));
  }, [dbVersion]);
  return tick * TICK_MS;
}

export function EngineProvider({ profile, children }: { profile: Profile; children: ReactNode }) {
  const dbVersion = useDbVersion();
  const t = useEngineTick(dbVersion);
  const sim = useSim();
  const hourKey = Math.floor(t / 3_600_000);
  const minuteKey = Math.floor(t / 60_000);

  // dbVersion is the cache key for anything read from SQLite.
  const history = useMemo(() => loadHistory(profile), [profile, dbVersion]);
  // Retrain when the data changes, or hourly as new quiet hours accumulate.
  const model = useMemo(() => fitPersonalModel(history, now()), [history, hourKey]);
  const risk = useMemo(
    () =>
      assessRisk(
        history,
        model,
        t,
        sim.enabled
          ? { weekday: sim.weekday, minute: sim.minute, minutesSinceUse: sim.minutesSinceUse, stress: sim.stress, location: sim.location }
          : {},
      ),
    [history, model, t, sim],
  );
  const forecast = useMemo(() => forecastRisk(history, model, minuteKey * 60_000), [history, model, minuteKey]);
  const windows = useMemo(() => riskWindows(forecast), [forecast]);
  const watchWindows = useMemo(() => riskWindows(forecast, WATCH_THRESHOLD), [forecast]);
  const lock = useMemo(() => getActiveLock(), [dbVersion]);

  const value: EngineValue = {
    t,
    dbVersion,
    profile,
    history,
    model,
    risk,
    simulated: sim.enabled,
    forecast,
    windows,
    watchWindows,
    lock,
  };
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineValue {
  const v = useContext(EngineContext);
  if (!v) throw new Error('useEngine outside EngineProvider');
  return v;
}

/** Reads the profile straight from SQLite, re-rendering on change. */
export function useProfile(): Profile | null {
  const v = useDbVersion();
  return useMemo(() => getProfile(), [v]);
}
