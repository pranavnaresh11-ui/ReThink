import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { SCHEMA } from './schema.ts';

const IDB_NAME = 'exhale';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'main.db';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadBytes(): Promise<Uint8Array | null> {
  try {
    const idb = await openIdb();
    return await new Promise((resolve, reject) => {
      const req = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function saveBytes(bytes: Uint8Array): Promise<void> {
  const idb = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let db: Database | null = null;
let saveTimer: number | undefined;

/** Opens the on-device SQLite database, restoring the last snapshot from IndexedDB. */
export async function openDatabase(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await loadBytes();
  try {
    db = saved ? new SQL.Database(saved) : new SQL.Database();
    db.exec(SCHEMA);
  } catch {
    // A corrupt snapshot shouldn't brick the app.
    db = new SQL.Database();
    db.exec(SCHEMA);
  }
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not opened');
  return db;
}

/** Debounced write-back. sql.js keeps the DB in memory, so we snapshot after changes. */
export function schedulePersist(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!db) return;
    const bytes = db.export();
    // export() resets connection-level pragmas.
    db.exec('PRAGMA foreign_keys = ON;');
    void saveBytes(bytes);
  }, 250);
}
