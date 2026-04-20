const express = require('express');
const router = express.Router();
const db = require('../database');
const { indexEntry } = require('../services/embeddingService');
const { requireAuth } = require('../middleware/auth');
const { getMoonPhase, getSkyNotes } = require('../services/skyService');
const { encryptField, safeDecrypt } = require('../services/rowCrypto');

router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTags(raw) {
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

// Decrypt the encrypted columns on an entries row in-place and return it.
function decryptEntryRow(userId, row) {
  if (!row) return row;
  if (row.body !== undefined)      row.body      = safeDecrypt(userId, row.body);
  if (row.body_text !== undefined) row.body_text = safeDecrypt(userId, row.body_text);
  return row;
}

function entryRow(userId, row) {
  if (!row) return null;
  decryptEntryRow(userId, row);
  return {
    ...row,
    tags: parseTags(row.tags),
    auto_tags: parseTags(row.auto_tags),
  };
}

// Dedupe + normalise: lowercase, trim, drop empties, dedupe, and (when both
// arrays are passed) ensure manual `tags` always wins — anything in `tags`
// is removed from `auto_tags` so a tag never appears in both at once.
function normaliseTagPair(tags, autoTags) {
  const norm = (arr) => {
    const seen = new Set();
    const out = [];
    for (const t of (arr || [])) {
      const c = String(t || '').trim().toLowerCase();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  };
  const manual = norm(tags);
  const manualSet = new Set(manual);
  const auto = norm(autoTags).filter((t) => !manualSet.has(t));
  return { tags: manual, auto_tags: auto };
}

// ── GET /api/entries ─────────────────────────────────────────────────────────
// Search happens in JS after decryption because body_text is now ciphertext
// with random IVs — server-side LIKE cannot match a plaintext substring.
router.get('/', (req, res) => {
  const { tag, search, limit = 5000, offset = 0 } = req.query;

  const rows = db.prepare(
    `SELECT id, title, body_text, date, tags, auto_tags, linked_session_id, created_at, updated_at
     FROM entries WHERE user_id = ?
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(req.userId, Number(limit), Number(offset));

  let entries = rows.map((r) => entryRow(req.userId, r));

  if (search) {
    const needle = String(search).toLowerCase();
    entries = entries.filter((e) =>
      (e.title || '').toLowerCase().includes(needle) ||
      (e.body_text || '').toLowerCase().includes(needle),
    );
  }
  if (tag) {
    entries = entries.filter((e) => e.tags.includes(tag));
  }

  res.json(entries);
});

// ── GET /api/entries/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json(entryRow(req.userId, row));
});

// ── POST /api/entries ────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { title = 'Untitled', body = '', body_text = '', date, tags = [] } = req.body;

  // Tag with current sky conditions
  const now = new Date();
  const moon = getMoonPhase(now);
  const skyNotes = getSkyNotes(now);

  const encBody = encryptField(req.userId, body);
  const encBodyText = encryptField(req.userId, body_text);

  const result = db
    .prepare(
      `INSERT INTO entries (title, body, body_text, date, tags, user_id, moon_phase, moon_sign, sky_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, encBody, encBodyText, date || now.toISOString().split('T')[0], JSON.stringify(tags), req.userId, moon.phase, moon.moonSign, skyNotes || null);

  const entry = entryRow(req.userId, db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid));

  // Index in background — don't block the response. Pass the plaintext so the
  // embedding captures semantics, not ciphertext.
  if (body_text) {
    indexEntry(entry.id, body_text).catch(() => {});
  }

  res.status(201).json(entry);
});

// ── PUT /api/entries/:id ─────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });


  const { title, body, body_text, date, tags, auto_tags, linked_session_id, locked } = req.body;

  const fields = [];
  const params = [];

  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (body !== undefined) { fields.push('body = ?'); params.push(encryptField(req.userId, body)); }
  if (body_text !== undefined) { fields.push('body_text = ?'); params.push(encryptField(req.userId, body_text)); }
  if (date !== undefined) { fields.push('date = ?'); params.push(date); }
  if (linked_session_id !== undefined) { fields.push('linked_session_id = ?'); params.push(linked_session_id); }
  if (locked !== undefined) { fields.push('locked = ?'); params.push(locked ? 1 : 0); }

  // Tag updates run through normalisation so a tag can never end up in both
  // arrays. If only one of the two is being updated, merge with the existing
  // value of the other before normalising — that way a manual-tag write
  // automatically demotes a matching auto tag, and vice-versa.
  if (tags !== undefined || auto_tags !== undefined) {
    const existingTags = tags !== undefined ? tags : parseTags(existing.tags);
    const existingAuto = auto_tags !== undefined ? auto_tags : parseTags(existing.auto_tags);
    const normalised = normaliseTagPair(existingTags, existingAuto);
    fields.push('tags = ?');      params.push(JSON.stringify(normalised.tags));
    fields.push('auto_tags = ?'); params.push(JSON.stringify(normalised.auto_tags));
  }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id, req.userId);

  db.prepare(`UPDATE entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);

  const updated = entryRow(req.userId, db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId));

  // Re-index in background if text changed
  if (body_text !== undefined && body_text) {
    indexEntry(updated.id, body_text).catch(() => {});
  }

  res.json(updated);
});

// ── DELETE /api/entries/:id ──────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id, linked_session_id FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  // Cascade: remove the linked Oracle conversation so orphaned chats don't
  // linger after the entry they were spawned from is deleted.
  if (existing.linked_session_id) {
    db.prepare('DELETE FROM oracle_sessions WHERE id = ? AND user_id = ?').run(existing.linked_session_id, req.userId);
  }

  db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

// True if a Tiptap HTML body contains a non-text node worth versioning even
// when no prose has been typed (card pull, image, youtube embed, drawing, etc.).
function hasNonTextNode(html) {
  if (!html) return false;
  return /(data-card-reading|data-image-embed|data-youtube-embed|data-drawing|<img\b|<canvas\b)/i.test(html);
}

// ── POST /api/entries/:id/snapshot ───────────────────────────────────────────
// Called by the frontend after a successful save (throttled client-side to ~1 min).
router.post('/:id/snapshot', (req, res) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing?.body) return res.json({ skipped: true });

  // Decrypt to inspect content — ciphertext comparisons are meaningless
  // because each write uses a random IV, so "same plaintext" produces
  // different ciphertexts.
  const plainBody     = safeDecrypt(req.userId, existing.body);
  const plainBodyText = safeDecrypt(req.userId, existing.body_text);

  const hasText = !!(plainBodyText && plainBodyText.trim());
  const hasNonTextContent = hasNonTextNode(plainBody);
  if (!hasText && !hasNonTextContent) {
    return res.json({ skipped: true });
  }

  // Skip if the latest version already has identical content (plaintext
  // comparison).
  const latest = db.prepare(
    'SELECT body FROM entry_versions WHERE entry_id = ? ORDER BY saved_at DESC LIMIT 1'
  ).get(req.params.id);
  if (latest && safeDecrypt(req.userId, latest.body) === plainBody) {
    return res.json({ skipped: true });
  }

  // Store the already-encrypted ciphertext straight into the version row.
  // Saves re-encryption cost and preserves the exact on-disk bytes that
  // matched the entry at snapshot time.
  db.prepare(
    'INSERT INTO entry_versions (entry_id, user_id, title, body, body_text) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, req.userId, existing.title || '', existing.body, existing.body_text || '');

  const old = db.prepare(
    'SELECT id FROM entry_versions WHERE entry_id = ? ORDER BY saved_at DESC LIMIT -1 OFFSET 10'
  ).all(req.params.id);
  if (old.length) db.prepare(`DELETE FROM entry_versions WHERE id IN (${old.map(() => '?').join(',')})`).run(...old.map(v => v.id));

  res.json({ ok: true });
});

// ── DELETE /api/entries/:id/versions/blank — clean up empty snapshots ───────
// Removes versions with no body_text content. Called once on mount from the
// VersionsPanel so existing users don't have to live with the historical
// blank snapshots created before the guard above existed.
router.delete('/:id/versions/blank', (req, res) => {
  const existing = db.prepare('SELECT id FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  // We can't LIKE against encrypted body_text anymore — fetch candidates and
  // decide in JS. Limit to this entry's versions so we never scan the whole
  // table.
  const rows = db.prepare(
    'SELECT id, body, body_text FROM entry_versions WHERE entry_id = ? AND user_id = ?'
  ).all(req.params.id, req.userId);

  const blankIds = rows
    .filter((r) => {
      const txt  = safeDecrypt(req.userId, r.body_text);
      const body = safeDecrypt(req.userId, r.body);
      const noText = !txt || !txt.trim();
      return noText && !hasNonTextNode(body);
    })
    .map((r) => r.id);

  if (!blankIds.length) return res.json({ deleted: 0 });
  const result = db.prepare(
    `DELETE FROM entry_versions WHERE id IN (${blankIds.map(() => '?').join(',')})`
  ).run(...blankIds);
  res.json({ deleted: result.changes });
});

// ── GET /api/entries/:id/versions ────────────────────────────────────────────
router.get('/:id/versions', (req, res) => {
  const existing = db.prepare('SELECT id FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  const versions = db.prepare(
    'SELECT id, saved_at, title, body_text FROM entry_versions WHERE entry_id = ? ORDER BY saved_at DESC LIMIT 10'
  ).all(req.params.id);

  res.json(versions.map(v => {
    const bt = safeDecrypt(req.userId, v.body_text) || '';
    return {
      id: v.id,
      saved_at: v.saved_at,
      title: v.title,
      body_text: bt,
      preview: bt.replace(/\s+/g, ' ').trim().slice(0, 100),
    };
  }));
});

// ── POST /api/entries/:id/versions/:versionId/restore ─────────────────────────
router.post('/:id/versions/:versionId/restore', (req, res) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  const version = db.prepare('SELECT * FROM entry_versions WHERE id = ? AND entry_id = ?').get(req.params.versionId, req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  // Save current state as a new version before restoring (so restore is undoable).
  // Both existing.body and the new version row live as ciphertext — copy as-is.
  if (existing.body) {
    db.prepare(
      'INSERT INTO entry_versions (entry_id, user_id, title, body, body_text) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, req.userId, existing.title || '', existing.body, existing.body_text || '');

    const oldVersions = db.prepare(
      'SELECT id FROM entry_versions WHERE entry_id = ? ORDER BY saved_at DESC LIMIT -1 OFFSET 10'
    ).all(req.params.id);
    if (oldVersions.length > 0) {
      const ids = oldVersions.map(v => v.id);
      db.prepare(`DELETE FROM entry_versions WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
  }

  // Restore the version. Ciphertext → ciphertext copy; both encrypted with the
  // same per-user key so the target row remains readable.
  db.prepare(
    'UPDATE entries SET title = ?, body = ?, body_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(version.title, version.body, version.body_text, req.params.id, req.userId);

  const updated = entryRow(req.userId, db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId));
  res.json(updated);
});

module.exports = router;
