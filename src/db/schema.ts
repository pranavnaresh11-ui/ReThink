/** Same relational model the native app uses with SQLite / SwiftData. */
export const SCHEMA = /* sql */ `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profile (
  user_id                    INTEGER PRIMARY KEY CHECK (user_id = 1),
  name                       TEXT    NOT NULL,
  created_at                 INTEGER NOT NULL,
  quit_start_timestamp       INTEGER NOT NULL,
  baseline_fagerstrom_score  REAL    NOT NULL CHECK (baseline_fagerstrom_score BETWEEN 0 AND 1),
  daily_vape_cost            REAL    NOT NULL DEFAULT 0,
  lock_minutes               INTEGER NOT NULL DEFAULT 30 CHECK (lock_minutes >= 15),
  locked_apps                TEXT    NOT NULL DEFAULT '[]',
  current_xp                 INTEGER NOT NULL DEFAULT 0,
  streak_freeze_tokens       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS craving_events (
  event_id                INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp               INTEGER NOT NULL,
  hour_sin                REAL    NOT NULL,
  hour_cos                REAL    NOT NULL,
  stress_level            INTEGER CHECK (stress_level BETWEEN 1 AND 5),
  location_tag            TEXT    NOT NULL CHECK (location_tag IN ('SCHOOL','HOME','SOCIAL','OTHER')),
  predicted_risk_score    REAL    NOT NULL,
  outcome                 TEXT    NOT NULL CHECK (outcome IN ('RESISTED','RELAPSED')),
  intervention_completed  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_craving_time ON craving_events(timestamp);

CREATE TABLE IF NOT EXISTS lock_sessions (
  lock_id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  triggered_by_event_id         INTEGER REFERENCES craving_events(event_id) ON DELETE SET NULL,
  reason                        TEXT    NOT NULL CHECK (reason IN ('RELAPSE','MISSED_CHECKIN')),
  start_time                    INTEGER NOT NULL,
  end_time                      INTEGER NOT NULL,
  minutes_reduced_by_breathing  INTEGER NOT NULL DEFAULT 0,
  status                        TEXT    NOT NULL CHECK (status IN ('ACTIVE','COMPLETED'))
);

CREATE TABLE IF NOT EXISTS check_ins (
  check_in_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp     INTEGER NOT NULL,
  stress_level  INTEGER NOT NULL CHECK (stress_level BETWEEN 1 AND 5),
  location_tag  TEXT    NOT NULL CHECK (location_tag IN ('SCHOOL','HOME','SOCIAL','OTHER')),
  craving_now   INTEGER NOT NULL DEFAULT 0 CHECK (craving_now IN (0,1,2))
);
CREATE INDEX IF NOT EXISTS idx_check_in_time ON check_ins(timestamp);

CREATE TABLE IF NOT EXISTS app_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
`;

export const TABLES = ['user_profile', 'craving_events', 'lock_sessions', 'check_ins', 'app_state'] as const;
export type TableName = (typeof TABLES)[number];
