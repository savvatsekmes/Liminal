const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── GET /api/context ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM life_context WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json(rows);
});

// ── POST /api/context ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { text, source_entry_id, source_entry_title } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const result = db
    .prepare(
      `INSERT INTO life_context (text, source_entry_id, source_entry_title, user_id)
       VALUES (?, ?, ?, ?)`
    )
    .run(text.trim(), source_entry_id || null, source_entry_title || null, req.userId);

  res.status(201).json(db.prepare('SELECT * FROM life_context WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT /api/context/:id ──────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM life_context WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Context item not found' });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  db.prepare('UPDATE life_context SET text = ? WHERE id = ? AND user_id = ?').run(text.trim(), req.params.id, req.userId);
  res.json(db.prepare('SELECT * FROM life_context WHERE id = ?').get(req.params.id));
});

// ── DELETE /api/context/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM life_context WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Context item not found' });

  db.prepare('DELETE FROM life_context WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

module.exports = router;
