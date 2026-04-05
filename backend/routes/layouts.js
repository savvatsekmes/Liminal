const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../database');

router.use(requireAuth);

// GET /api/layouts — list all saved layouts for current user
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, name, widget_order, is_active, created_at FROM home_layouts WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.userId);
  res.json(rows.map(r => ({ ...r, widget_order: JSON.parse(r.widget_order), is_active: !!r.is_active })));
});

// POST /api/layouts — save a new named layout
router.post('/', (req, res) => {
  const { name, widget_order } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!Array.isArray(widget_order)) return res.status(400).json({ error: 'widget_order must be an array' });

  const result = db.prepare(
    'INSERT INTO home_layouts (user_id, name, widget_order) VALUES (?, ?, ?)'
  ).run(req.userId, name.trim(), JSON.stringify(widget_order));

  res.json({ id: result.lastInsertRowid, name: name.trim(), widget_order, is_active: false });
});

// PUT /api/layouts/deactivate — revert to default (must be before /:id)
router.put('/deactivate', (req, res) => {
  db.prepare('UPDATE home_layouts SET is_active = 0 WHERE user_id = ?').run(req.userId);
  res.json({ ok: true });
});

// PUT /api/layouts/:id/activate — set as active layout
router.put('/:id/activate', (req, res) => {
  const layout = db.prepare('SELECT * FROM home_layouts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!layout) return res.status(404).json({ error: 'Layout not found' });

  db.prepare('UPDATE home_layouts SET is_active = 0 WHERE user_id = ?').run(req.userId);
  db.prepare('UPDATE home_layouts SET is_active = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// PUT /api/layouts/:id — update an existing layout
router.put('/:id', (req, res) => {
  const { name, widget_order } = req.body || {};
  const layout = db.prepare('SELECT * FROM home_layouts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!layout) return res.status(404).json({ error: 'Layout not found' });

  const updates = [];
  const params = [];
  if (name?.trim()) { updates.push('name = ?'); params.push(name.trim()); }
  if (Array.isArray(widget_order)) { updates.push('widget_order = ?'); params.push(JSON.stringify(widget_order)); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id, req.userId);
  db.prepare(`UPDATE home_layouts SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM home_layouts WHERE id = ?').get(req.params.id);
  res.json({ ...updated, widget_order: JSON.parse(updated.widget_order), is_active: !!updated.is_active });
});

// DELETE /api/layouts/:id — delete a saved layout
router.delete('/:id', (req, res) => {
  const layout = db.prepare('SELECT * FROM home_layouts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!layout) return res.status(404).json({ error: 'Layout not found' });

  db.prepare('DELETE FROM home_layouts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

module.exports = router;
