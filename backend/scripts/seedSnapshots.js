/**
 * Seed an initial entry_versions snapshot for every entry that has no
 * version history yet — including the ~104 Notion imports that never
 * got a chance to be snapshotted, plus older entries that predate the
 * versioning system.
 *
 * Safe to re-run: only inserts for entries with zero existing versions.
 *
 * Usage: node backend/scripts/seedSnapshots.js
 */

const path = require('path');

if (!process.env.LIMINAL_USER_DATA) {
  process.env.LIMINAL_USER_DATA = path.join(process.env.APPDATA || '', 'Liminal');
}
const db = require(path.join(__dirname, '..', 'database'));

const candidates = db.prepare(`
  SELECT e.id, e.user_id, e.title, e.body, e.body_text
  FROM entries e
  LEFT JOIN entry_versions v ON v.entry_id = e.id
  WHERE v.id IS NULL
`).all();

const insert = db.prepare(`
  INSERT INTO entry_versions (entry_id, user_id, title, body, body_text, saved_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const tx = db.transaction((rows) => {
  for (const r of rows) {
    insert.run(r.id, r.user_id || 1, r.title || '', r.body || '', r.body_text || '');
  }
});

console.log(`Seeding snapshots for ${candidates.length} entries…`);
tx(candidates);
console.log('Done.');
