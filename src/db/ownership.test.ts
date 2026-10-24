import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_KEY, OWNER_KEY, liveSnapshotKey, mayWrite, planClaim, snapshotKey } from './ownership.ts';

/**
 * IndexedDB runs overlapping readwrite transactions one at a time, so the store can be
 * modelled as a Map where each helper below is one whole transaction, mirroring sqlite.ts.
 */
type Store = Map<string, unknown>;

function claim(store: Store, tab: string): unknown {
  const plan = planClaim(tab, store.get(OWNER_KEY), [...store.keys()]);
  const loaded = plan.source ? store.get(plan.source) : null;
  store.set(OWNER_KEY, tab);
  if (loaded != null) store.set(plan.target, loaded);
  plan.remove.forEach((k) => store.delete(k));
  return loaded;
}
/** Debounced save while the page is alive: fenced on ownership. */
function save(store: Store, tab: string, data: string): boolean {
  if (!mayWrite(tab, store.get(OWNER_KEY))) return false;
  store.set(snapshotKey(tab), data);
  return true;
}
/** Hide/unload save: written blindly, because there's no time to read the owner first. */
function unloadSave(store: Store, tab: string, data: string): void {
  store.set(snapshotKey(tab), data);
}
const live = (store: Store) => {
  const key = liveSnapshotKey(store.get(OWNER_KEY), [...store.keys()]);
  return key ? store.get(key) : null;
};

test('a stale tab that missed the takeover cannot overwrite the new owner, even on unload', () => {
  const store: Store = new Map();
  claim(store, 'A');
  save(store, 'A', 'a1');
  assert.equal(claim(store, 'B'), 'a1', 'B starts from A’s latest save');
  save(store, 'B', 'b1');

  // A never heard about B: its routine save is refused...
  assert.equal(save(store, 'A', 'a-stale'), false);
  // ...and its blind unload save lands in A's own key, which nothing reads.
  unloadSave(store, 'A', 'a-stale');
  assert.equal(live(store), 'b1');

  // The stray copy is cleaned up by the next claim, and B's data is what loads.
  assert.equal(claim(store, 'C'), 'b1');
  assert.equal(store.has(snapshotKey('A')), false);
});

test('a reload keeps the save made while the page was closing', () => {
  const store: Store = new Map();
  claim(store, 'A');
  save(store, 'A', 'a1');
  unloadSave(store, 'A', 'a2');
  assert.equal(claim(store, 'A-reloaded'), 'a2');
});

test('nearly simultaneous opens: the later claim wins and starts from the earlier copy', () => {
  const store: Store = new Map([[LEGACY_KEY, 'old']]);
  assert.equal(claim(store, 'A'), 'old');
  assert.equal(claim(store, 'B'), 'old');
  assert.equal(save(store, 'A', 'a1'), false, 'A was overtaken before it saved');
  assert.equal(save(store, 'B', 'b1'), true);
  assert.equal(live(store), 'b1');
});

test('a tab that claims and closes before its first save loses nothing', () => {
  const store: Store = new Map();
  claim(store, 'A');
  save(store, 'A', 'a1');
  claim(store, 'B'); // closes without saving
  assert.equal(claim(store, 'C'), 'a1');
});

test('data saved by older builds under one key is migrated, and corruption backups are kept', () => {
  const store: Store = new Map<string, unknown>([
    [LEGACY_KEY, 'legacy'],
    ['main.db.corrupt-1', 'damaged'],
    ['corrupt-backup:2', 'damaged'],
  ]);
  assert.equal(claim(store, 'A'), 'legacy');
  assert.deepEqual([...store.keys()].sort(), ['corrupt-backup:2', 'main.db.corrupt-1', OWNER_KEY, snapshotKey('A')].sort());
});

test('a fresh install starts empty and never adopts a stray snapshot', () => {
  assert.equal(claim(new Map(), 'A'), null);
  // An orphaned copy whose owner record is gone must not be loaded as live data.
  assert.equal(liveSnapshotKey(undefined, [snapshotKey('ghost')]), null);
  assert.equal(liveSnapshotKey('B', [snapshotKey('ghost')]), null);
});
