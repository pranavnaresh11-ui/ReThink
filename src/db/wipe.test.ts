import { test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { SCHEMA } from './schema.ts';
import { wipeUserData } from './wipe.ts';

const SECRET = 'Zephyrine-Secret';

async function populated() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(SCHEMA);
  db.run(
    'INSERT INTO user_profile (user_id, name, created_at, quit_start_timestamp, baseline_fagerstrom_score) VALUES (1, ?, 0, 0, 0.5)',
    [SECRET],
  );
  for (let i = 0; i < 200; i++) {
    db.run(
      "INSERT INTO craving_events (timestamp, hour_sin, hour_cos, location_tag, predicted_risk_score, outcome) VALUES (?, 0, 1, 'HOME', 0.5, 'RESISTED')",
      [i],
    );
    db.run('INSERT INTO app_state (key, value) VALUES (?, ?)', [`note-${i}`, JSON.stringify(`${SECRET} note ${i}`)]);
  }
  db.run("INSERT INTO app_state (key, value) VALUES ('judge_mode', 'true')");
  return db;
}

const contains = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(text);

test('plain DELETEs leave deleted data in the saved file (why the wipe must VACUUM)', async () => {
  const db = await populated();
  db.exec('DELETE FROM user_profile; DELETE FROM app_state;');
  assert.equal(contains(db.export(), SECRET), true);
});

test('wiping removes every row and leaves no trace of it in the saved file', async () => {
  const db = await populated();
  wipeUserData(db);
  for (const table of ['user_profile', 'craving_events', 'check_ins', 'lock_sessions', 'app_state']) {
    assert.equal(db.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0], 0, table);
  }
  assert.equal(contains(db.export(), SECRET), false);
});

test('a wipe can keep named settings, and only those', async () => {
  const db = await populated();
  wipeUserData(db, ['judge_mode']);
  assert.deepEqual(db.exec('SELECT key FROM app_state')[0].values, [['judge_mode']]);
  assert.equal(contains(db.export(), SECRET), false);
});
