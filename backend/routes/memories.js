const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { invalidateSynthesisCache } = require('../services/memoryService');

router.use(requireAuth);

// ── GET /api/memories ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM memories WHERE user_id = ? ORDER BY pinned DESC, created_at DESC'
  ).all(req.userId);
  res.json(rows);
});

// ── POST /api/memories ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });

  const trimmed = content.trim();
  const normalized = trimmed.toLowerCase().replace(/\n/g, ' ').replace(/  /g, ' ');

  // Dedupe: if a memory with this content already exists for the user, return it
  const existing = db.prepare(
    "SELECT * FROM memories WHERE user_id = ? AND LOWER(TRIM(REPLACE(REPLACE(content, CHAR(10), ' '), '  ', ' '))) = ?"
  ).get(req.userId, normalized);
  if (existing) return res.status(200).json(existing);

  const result = db.prepare(
    'INSERT INTO memories (user_id, content, pinned) VALUES (?, ?, 1)'
  ).run(req.userId, trimmed);

  invalidateSynthesisCache(req.userId);
  res.status(201).json(db.prepare('SELECT * FROM memories WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT /api/memories/:id ────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM memories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Memory not found' });

  const { content, pinned } = req.body;
  const fields = [];
  const params = [];

  if (content !== undefined) { fields.push('content = ?'); params.push(content.trim()); }
  if (pinned !== undefined)  { fields.push('pinned = ?');  params.push(pinned ? 1 : 0); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id, req.userId);
  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  invalidateSynthesisCache(req.userId);
  res.json(db.prepare('SELECT * FROM memories WHERE id = ?').get(req.params.id));
});

// ── DELETE /api/memories/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM memories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Memory not found' });

  db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  invalidateSynthesisCache(req.userId);
  res.json({ success: true });
});

// ── DELETE /api/memories ─────────────────────────────────────────────────────
// Default: clears auto-extracted items only (preserves pinned).
// ?all=true clears everything (requires password).
router.delete('/', async (req, res) => {
  if (req.query.all === 'true') {
    // Full wipe requires password verification
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Password required to delete all memories' });

    const bcrypt = require('bcryptjs');
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    db.prepare('DELETE FROM memories WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM memory WHERE user_id = ?').run(req.userId);
  } else {
    db.prepare('DELETE FROM memories WHERE user_id = ? AND pinned = 0').run(req.userId);
  }
  invalidateSynthesisCache(req.userId);
  res.json({ success: true });
});

module.exports = router;
