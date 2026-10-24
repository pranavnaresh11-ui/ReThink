import type { Database } from 'sql.js';

/**
 * Deletes every user row, keeping only the listed app_state keys, then VACUUMs. Without the
 * VACUUM, SQLite leaves deleted rows in free pages, and the snapshot saved to IndexedDB is
 * the whole file, so "deleted" data would still be stored on the device.
 */
export function wipeUserData(db: Database, keepState: readonly string[] = []): void {
  db.exec('DELETE FROM lock_sessions; DELETE FROM craving_events; DELETE FROM check_ins; DELETE FROM user_profile;');
  if (keepState.length === 0) db.exec('DELETE FROM app_state;');
  else db.run(`DELETE FROM app_state WHERE key NOT IN (${keepState.map(() => '?').join(', ')})`, [...keepState]);
  db.exec('VACUUM;');
}
