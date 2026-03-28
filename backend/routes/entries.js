const express = require('express');
const router = express.Router();
const db = require('../database');
const { indexEntry } = require('../services/embeddingService');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTags(raw) {
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function entryRow(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseTags(row.tags),
  };
}

// ── GET /api/entries ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { tag, search, limit = 100, offset = 0 } = req.query;

  let query = `SELECT id, title, body_text, date, tags, created_at, updated_at
               FROM entries`;
  const params = [];
  const conditions = [`user_id = ?`];
  params.push(req.userId);

  if (search) {
    conditions.push(`(title LIKE ? OR body_text LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` WHERE ${conditions.join(' AND ')}`;
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(query).all(...params);
  let entries = rows.map(entryRow);

  // Filter by tag in JS (tags stored as JSON array)
  if (tag) {
    entries = entries.filter((e) => e.tags.includes(tag));
  }

  res.json(entries);
});

// ── GET /api/entries/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  res.json(entryRow(row));
});

// ── POST /api/entries ────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { title = 'Untitled', body = '', body_text = '', date, tags = [] } = req.body;

  const result = db
    .prepare(
      `INSERT INTO entries (title, body, body_text, date, tags, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(title, body, body_text, date || new Date().toISOString().split('T')[0], JSON.stringify(tags), req.userId);

  const entry = entryRow(db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid));

  // Index in background — don't block the response
  if (body_text) {
    indexEntry(entry.id, body_text).catch(() => {});
  }

  res.status(201).json(entry);
});

// ── PUT /api/entries/:id ─────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });


  const { title, body, body_text, date, tags } = req.body;

  const fields = [];
  const params = [];

  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (body !== undefined) { fields.push('body = ?'); params.push(body); }
  if (body_text !== undefined) { fields.push('body_text = ?'); params.push(body_text); }
  if (date !== undefined) { fields.push('date = ?'); params.push(date); }
  if (tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(tags)); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id, req.userId);

  db.prepare(`UPDATE entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);

  const updated = entryRow(db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId));

  // Re-index in background if text changed
  if (body_text !== undefined && body_text) {
    indexEntry(updated.id, body_text).catch(() => {});
  }

  res.json(updated);
});

// ── DELETE /api/entries/:id ──────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

// ── POST /api/entries/:id/snapshot ───────────────────────────────────────────
// Called by the frontend after a successful save (throttled client-side to ~1 min).
router.post('/:id/snapshot', (req, res) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing?.body) return res.json({ skipped: true });

  db.prepare(
    'INSERT INTO entry_versions (entry_id, user_id, title, body, body_text) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, req.userId, existing.title || '', existing.body, existing.body_text || '');

  const old = db.prepare(
    'SELECT id FROM entry_versions WHERE entry_id = ? ORDER BY saved_at DESC LIMIT -1 OFFSET 10'
  ).all(req.params.id);
  if (old.length) db.prepare(`DELETE FROM entry_versions WHERE id IN (${old.map(() => '?').join(',')})`).run(...old.map(v => v.id));

  res.json({ ok: true });
});

// ── GET /api/entries/:id/versions ────────────────────────────────────────────
router.get('/:id/versions', (req, res) => {
  const existing = db.prepare('SELECT id FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  const versions = db.prepare(
    'SELECT id, saved_at, title, body_text FROM entry_versions WHERE entry_id = ? ORDER BY saved_at DESC LIMIT 10'
  ).all(req.params.id);

  res.json(versions.map(v => ({
    id: v.id,
    saved_at: v.saved_at,
    title: v.title,
    preview: (v.body_text || '').replace(/\s+/g, ' ').trim().slice(0, 100),
  })));
});

// ── POST /api/entries/:id/versions/:versionId/restore ─────────────────────────
router.post('/:id/versions/:versionId/restore', (req, res) => {
  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });

  const version = db.prepare('SELECT * FROM entry_versions WHERE id = ? AND entry_id = ?').get(req.params.versionId, req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  // Save current state as a new version before restoring (so restore is undoable)
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

  // Restore the version
  db.prepare(
    'UPDATE entries SET title = ?, body = ?, body_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(version.title, version.body, version.body_text, req.params.id, req.userId);

  const updated = entryRow(db.prepare('SELECT * FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.userId));
  res.json(updated);
});

module.exports = router;
