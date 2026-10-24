import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { OWNER_KEY, mayWrite, planClaim, snapshotKey } from './ownership.ts';
import { SCHEMA } from './schema.ts';

const IDB_NAME = 'exhale';
const IDB_STORE = 'sqlite';
/**
 * Save in the next task: the changes from one action (several commits) still go out as one
 * write, but it starts long before anyone could close or reload the page, so the unload-time
 * save (which browsers may cut short) is rarely the only copy.
 */
const SAVE_DELAY_MS = 0;

// Which tab's snapshot is live, and why stale tabs can't overwrite it: see ownership.ts.
const TAB_ID = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const OWN_SNAPSHOT = snapshotKey(TAB_ID);
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('exhale-db') : null;

// ── IndexedDB snapshot store ─────────────────────────────────────────────────
let idb: Promise<IDBDatabase> | null = null;
/** The open connection once available, so a save can start its transaction synchronously. */
let idbConn: IDBDatabase | null = null;

function openIdb(): Promise<IDBDatabase> {
  idb ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => {
      idbConn = req.result;
      // Another tab upgrading the schema would otherwise be blocked by this connection.
      idbConn.onversionchange = () => {
        idbConn?.close();
        idbConn = null;
        idb = null;
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  }).catch((err: unknown) => {
    // Let the next save try again instead of caching the failure forever.
    idb = null;
    throw err;
  });
  return idb;
}

function settle(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Save was aborted'));
  });
}

let owned = false;

/**
 * Makes this tab the owner and copies the live snapshot to this tab's key, all in one
 * transaction, so no other tab's save can land between the read and the claim.
 */
async function claimAndLoad(): Promise<Uint8Array | null> {
  const tx = (await openIdb()).transaction(IDB_STORE, 'readwrite');
  const store = tx.objectStore(IDB_STORE);
  const keysReq = store.getAllKeys();
  const ownerReq = store.get(OWNER_KEY);
  let loaded: Uint8Array | null = null;
  // Requests in a transaction complete in order, so keysReq is done by now.
  ownerReq.onsuccess = () => {
    const keys = keysReq.result.filter((k): k is string => typeof k === 'string');
    const plan = planClaim(TAB_ID, ownerReq.result, keys);
    store.put(TAB_ID, OWNER_KEY);
    const cleanUp = () => plan.remove.forEach((k) => store.delete(k));
    if (!plan.source) return cleanUp();
    const source = store.get(plan.source);
    source.onsuccess = () => {
      loaded = (source.result as Uint8Array | undefined) ?? null;
      if (loaded) store.put(loaded, plan.target);
      cleanUp();
    };
  };
  await settle(tx);
  owned = true;
  channel?.postMessage({ type: 'claim', tab: TAB_ID });
  return loaded;
}

/**
 * @param fenced Only write if this tab still owns the database; resolves false if it doesn't.
 *   Unfenced writes start their transaction synchronously, which unload-time saves need:
 *   during pagehide, waiting for the ownership read can let the page die before the write.
 *   They're still safe from a stale tab, because each tab writes only its own snapshot key.
 */
async function idbPut(key: string, bytes: Uint8Array, fenced = false): Promise<boolean> {
  const conn = idbConn ?? (await openIdb());
  const tx = conn.transaction(IDB_STORE, 'readwrite');
  const store = tx.objectStore(IDB_STORE);
  let written = true;
  if (fenced) {
    const owner = store.get(OWNER_KEY);
    owner.onsuccess = () => {
      if (mayWrite(TAB_ID, owner.result)) store.put(bytes, key);
      else written = false;
    };
  } else {
    store.put(bytes, key);
    // Ask for an immediate commit rather than waiting for the task to end (not in older Safari).
    tx.commit?.();
  }
  await settle(tx);
  return written;
}

// ── persistence status (shown in the UI) ─────────────────────────────────────
export interface PersistState {
  /** Why the latest save failed, if it did. Cleared by the next successful save. */
  error: string | null;
  lastSavedAt: number | null;
  /** The saved snapshot couldn't be read. A copy was kept under this IndexedDB key. */
  corruptBackupKey: string | null;
  /** A newer tab took over the database; this tab has stopped saving. */
  replaced: boolean;
}

let persistState: PersistState = { error: null, lastSavedAt: null, corruptBackupKey: null, replaced: false };
const persistListeners = new Set<() => void>();

function setPersistState(patch: Partial<PersistState>): void {
  persistState = { ...persistState, ...patch };
  persistListeners.forEach((fn) => fn());
}

export function subscribePersist(fn: () => void): () => void {
  persistListeners.add(fn);
  return () => persistListeners.delete(fn);
}
export const getPersistState = (): PersistState => persistState;

function describeStorageError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') return 'This device is out of storage space for Exhale.';
  if (err instanceof Error && err.message) return err.message;
  return 'The browser blocked on-device storage (private browsing can do this).';
}

// ── database ─────────────────────────────────────────────────────────────────
let db: Database | null = null;
let saveTimer: number | undefined;
let dirty = false;

function isHealthy(candidate: Database): boolean {
  candidate.exec(SCHEMA);
  return candidate.exec('PRAGMA quick_check')[0]?.values[0]?.[0] === 'ok';
}

/** Opens the on-device SQLite database, restoring the last snapshot from IndexedDB. */
export async function openDatabase(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  let saved: Uint8Array | null = null;
  try {
    saved = await claimAndLoad();
  } catch (err) {
    // Keep going in memory so the app still works, but say plainly that nothing will stick.
    setPersistState({ error: describeStorageError(err) });
  }

  if (saved) {
    try {
      const restored = new SQL.Database(saved);
      if (isHealthy(restored)) db = restored;
      else restored.close();
    } catch {
      /* handled below */
    }
    if (!db) {
      // Don't let the next save overwrite the only copy: park it under its own key first.
      const backupKey = `corrupt-backup:${Date.now()}`;
      try {
        await idbPut(backupKey, saved);
        setPersistState({ corruptBackupKey: backupKey });
      } catch (err) {
        setPersistState({ error: describeStorageError(err) });
      }
    }
  }

  if (!db) {
    db = new SQL.Database();
    db.exec(SCHEMA);
  }
  installLifecycleFlush();
  // A message is only a hint: it can arrive late, or come from a tab that has itself been replaced.
  channel?.addEventListener('message', (e: MessageEvent<{ type?: string; tab?: string }>) => {
    if (e.data.type === 'claim' && e.data.tab !== TAB_ID) void revalidateOwnership();
  });
  return db;
}

/**
 * Pauses this tab only if the stored owner record names another tab. Also run whenever the
 * tab comes back on screen, so one that was frozen or restored from the back/forward cache,
 * and so missed the claim message, stops before its next unfenced (unload-time) save.
 */
async function revalidateOwnership(): Promise<void> {
  if (!owned || persistState.replaced || !idbConn) return;
  try {
    const tx = idbConn.transaction(IDB_STORE);
    const req = tx.objectStore(IDB_STORE).get(OWNER_KEY);
    await settle(tx);
    if (req.result !== TAB_ID) markReplaced();
  } catch {
    // A failed read proves nothing; the fenced save remains the backstop.
  }
}

function markReplaced(): void {
  // Unsaved changes here can't be merged into the newer tab's copy, so they're dropped.
  window.clearTimeout(saveTimer);
  dirty = false;
  setPersistState({ replaced: true });
}

export function getDb(): Database {
  if (!db) throw new Error('Database not opened');
  return db;
}

/** sql.js keeps the DB in memory, so we snapshot to IndexedDB right after each change. */
export function schedulePersist(): void {
  dirty = true;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flushPersist(), SAVE_DELAY_MS);
}

/**
 * Writes any pending changes now. Safe to call often; does nothing when there's nothing new.
 * Fenced unless the page is being hidden or unloaded (see idbPut).
 */
export async function flushPersist({ fenced = true }: { fenced?: boolean } = {}): Promise<void> {
  window.clearTimeout(saveTimer);
  if (!db || !dirty || persistState.replaced) return;
  dirty = false;
  const bytes = snapshotBytes(db);
  try {
    if (!(await idbPut(OWN_SNAPSHOT, bytes, fenced))) return markReplaced();
    setPersistState({ error: null, lastSavedAt: Date.now() });
  } catch (err) {
    dirty = true;
    setPersistState({ error: describeStorageError(err) });
  }
}

function snapshotBytes(from: Database): Uint8Array {
  const bytes = from.export();
  // export() resets connection-level pragmas.
  from.exec('PRAGMA foreign_keys = ON;');
  return bytes;
}

/**
 * For "Delete my data", after the rows are wiped: atomically replaces every stored copy
 * (this tab's snapshot, stale tabs' snapshots and corruption backups) with the wiped
 * database. Fenced like a save, so a tab that no longer owns the data can't erase it.
 */
export async function eraseStoredCopies(): Promise<void> {
  window.clearTimeout(saveTimer);
  if (!db || persistState.replaced) return;
  dirty = false;
  const bytes = snapshotBytes(db);
  try {
    const tx = (idbConn ?? (await openIdb())).transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    let mine = true;
    const owner = store.get(OWNER_KEY);
    owner.onsuccess = () => {
      mine = mayWrite(TAB_ID, owner.result);
      if (!mine) return;
      store.clear();
      store.put(TAB_ID, OWNER_KEY);
      store.put(bytes, OWN_SNAPSHOT);
    };
    await settle(tx);
    if (!mine) return markReplaced();
    setPersistState({ error: null, lastSavedAt: Date.now(), corruptBackupKey: null });
  } catch (err) {
    dirty = true;
    setPersistState({ error: describeStorageError(err) });
  }
}

let lifecycleInstalled = false;

/**
 * Flush when the page is hidden or being unloaded. Browsers don't promise to finish async
 * work during unload, but `visibilitychange → hidden` fires early enough in practice
 * (it's the last reliable event on mobile), so this narrows the window for data loss.
 */
function installLifecycleFlush(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPersist({ fenced: false });
    else void revalidateOwnership();
  });
  window.addEventListener('pagehide', () => void flushPersist({ fenced: false }));
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void revalidateOwnership();
  });
}

/**
 * Asks the browser not to evict our data under storage pressure. Call from a user action:
 * Firefox shows a permission prompt, other browsers decide silently.
 */
export async function requestDurableStorage(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* best effort */
  }
}
