// One-shot migration that runs on the first login of a pre-encryption user.
// The user's key must already be cached in rowCrypto before calling this.
//
// For each table that holds sensitive per-user text, we re-write every row
// owned by `userId` so that its plaintext is replaced with lenc:v1: ciphertext.
// encryptField is a no-op for null/empty/already-sentinel values, so running
// the migration a second time is safe.

const db = require('../database');
const { encryptField } = require('./rowCrypto');

function reencrypt(userId, table, columns, whereSql, whereArgs) {
  const rows = db.prepare(`SELECT id, ${columns.join(', ')} FROM ${table} WHERE ${whereSql}`).all(...whereArgs);
  if (!rows.length) return 0;
  const setSql = columns.map(c => `${c} = ?`).join(', ');
  const upd = db.prepare(`UPDATE ${table} SET ${setSql} WHERE id = ?`);
  let touched = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const vals = columns.map(c => encryptField(userId, row[c]));
      // Only write if at least one field actually changed (avoid touching
      // rows that were already migrated by a partial previous run).
      let changed = false;
      for (let i = 0; i < columns.length; i++) {
        if (vals[i] !== row[columns[i]]) { changed = true; break; }
      }
      if (changed) {
        upd.run(...vals, row.id);
        touched++;
      }
    }
  });
  tx();
  return touched;
}

function migrateLegacyUserRows(userId) {
  const counts = {};
  counts.entries         = reencrypt(userId, 'entries',         ['body', 'body_text'],         'user_id = ?', [userId]);
  counts.notes           = reencrypt(userId, 'notes',           ['body'],                      'user_id = ?', [userId]);
  counts.reflections     = reencrypt(userId, 'reflections',     ['blocks'],                    'user_id = ?', [userId]);
  counts.note_reflections= reencrypt(userId, 'note_reflections',['blocks'],                    'user_id = ?', [userId]);
  counts.memories        = reencrypt(userId, 'memories',        ['content'],                   'user_id = ?', [userId]);
  counts.threads         = reencrypt(userId, 'threads',         ['name', 'description', 'insight'], 'user_id = ?', [userId]);
  counts.entry_versions  = reencrypt(userId, 'entry_versions',  ['body', 'body_text'],         'user_id = ?', [userId]);
  counts.note_versions   = reencrypt(userId, 'note_versions',   ['body'],                      'user_id = ?', [userId]);
  // oracle_messages is linked to the user via oracle_sessions.
  counts.oracle_messages = reencrypt(userId, 'oracle_messages', ['content'],
    'session_id IN (SELECT id FROM oracle_sessions WHERE user_id = ?)', [userId]);
  console.log(`[migration] user ${userId} row encryption:`, counts);
  return counts;
}

module.exports = { migrateLegacyUserRows };
