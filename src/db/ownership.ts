/*
 * Multi-tab snapshot protocol. Each tab holds its own in-memory copy of the database and
 * saves whole snapshots, so two tabs writing to one key would overwrite each other. Instead:
 *
 * - Every tab writes only to its own key, snapshotKey(tab).
 * - OWNER_KEY says whose snapshot is live. Only a claim (a tab opening) changes it, and the
 *   claim copies the live snapshot to the new owner's key in the same transaction.
 * - Loading reads the owner's snapshot.
 *
 * So a stale tab's write, even an unfenced one during unload that never checked ownership,
 * lands in a key nothing reads and is cleaned up by the next claim. It cannot overwrite the
 * owner's data. Routine saves are still fenced (mayWrite) so a stale tab finds out and stops.
 */
export const OWNER_KEY = 'owner';
/** Builds before per-tab snapshots kept the only copy here. */
export const LEGACY_KEY = 'main.db';
const SNAPSHOT_PREFIX = 'snapshot:';

export const snapshotKey = (tab: string): string => SNAPSHOT_PREFIX + tab;

/** The snapshot that holds the live data, given the owner record and the stored keys. */
export function liveSnapshotKey(owner: unknown, keys: readonly string[]): string | null {
  if (typeof owner === 'string' && keys.includes(snapshotKey(owner))) return snapshotKey(owner);
  return keys.includes(LEGACY_KEY) ? LEGACY_KEY : null;
}

export interface ClaimPlan {
  /** Read this and copy it to `target`; null on a fresh install. */
  source: string | null;
  target: string;
  /** Stale snapshots (including the source once copied). Corruption backups are kept. */
  remove: string[];
}

export function planClaim(tab: string, owner: unknown, keys: readonly string[]): ClaimPlan {
  const target = snapshotKey(tab);
  return {
    source: liveSnapshotKey(owner, keys),
    target,
    remove: keys.filter((k) => k !== target && (k === LEGACY_KEY || k.startsWith(SNAPSHOT_PREFIX))),
  };
}

/** A fenced save goes ahead only while this tab is still the recorded owner. */
export const mayWrite = (tab: string, owner: unknown): boolean => owner === tab;
