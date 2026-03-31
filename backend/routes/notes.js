const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { buildYoutubeContext } = require('./youtube');
const { buildImageContext } = require('./images');

router.use(requireAuth);

// ── GET /api/notes ────────────────────────────────────────────────────────────
// Optional ?type=quote or ?type=custom&custom_tag=MyTag
router.get('/', (req, res) => {
  const { type, custom_tag } = req.query;

  let query = 'SELECT * FROM notes';
  const params = [];
  const conditions = [`user_id = ?`];
  params.push(req.userId);

  if (type && type !== 'all') {
    conditions.push('type = ?');
    params.push(type);
    if (type === 'custom' && custom_tag) {
      conditions.push('custom_tag = ?');
      params.push(custom_tag);
    }
  }

  query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';

  res.json(db.prepare(query).all(...params));
});

// ── GET /api/notes/custom-tags ────────────────────────────────────────────────
// Returns distinct custom_tag values so the UI can show them in the filter strip
router.get('/custom-tags', (req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT custom_tag FROM notes WHERE type = 'custom' AND custom_tag IS NOT NULL AND user_id = ? ORDER BY custom_tag")
    .all(req.userId);
  res.json(rows.map((r) => r.custom_tag));
});

// ── DELETE /api/notes/custom-tags/:tag ────────────────────────────────────────
// Converts notes in a custom tag category to type 'none' rather than deleting them
router.delete('/custom-tags/:tag', (req, res) => {
  db.prepare(
    "UPDATE notes SET type = 'none', custom_tag = NULL WHERE type = 'custom' AND custom_tag = ? AND user_id = ?"
  ).run(req.params.tag, req.userId);
  res.json({ success: true });
});

// ── POST /api/notes ───────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { type = 'idea', body = '', attribution, target_date, custom_tag } = req.body;
  const result = db
    .prepare(
      `INSERT INTO notes (type, body, attribution, target_date, custom_tag, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(type, body, attribution || null, target_date || null, custom_tag || null, req.userId);

  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT /api/notes/:id ────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Note not found' });


  const { type, body, attribution, target_date, custom_tag } = req.body;
  const fields = [];
  const params = [];

  if (type !== undefined)        { fields.push('type = ?');        params.push(type); }
  if (body !== undefined)        { fields.push('body = ?');        params.push(body); }
  if (attribution !== undefined) { fields.push('attribution = ?'); params.push(attribution || null); }
  if (target_date !== undefined) { fields.push('target_date = ?'); params.push(target_date || null); }
  if (custom_tag !== undefined)  { fields.push('custom_tag = ?');  params.push(custom_tag || null); }
  if (req.body.title !== undefined) { fields.push('title = ?');    params.push(req.body.title); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id, req.userId);

  db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

// ── DELETE /api/notes/:id ─────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

// ── POST /api/notes/:id/snapshot ─────────────────────────────────────────────
router.post('/:id/snapshot', (req, res) => {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing?.body) return res.json({ skipped: true });

  db.prepare(
    'INSERT INTO note_versions (note_id, user_id, body) VALUES (?, ?, ?)'
  ).run(req.params.id, req.userId, existing.body);

  const old = db.prepare(
    'SELECT id FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC LIMIT -1 OFFSET 10'
  ).all(req.params.id);
  if (old.length) db.prepare(`DELETE FROM note_versions WHERE id IN (${old.map(() => '?').join(',')})`).run(...old.map(v => v.id));

  res.json({ ok: true });
});

// ── GET /api/notes/:id/versions ───────────────────────────────────────────────
router.get('/:id/versions', (req, res) => {
  const existing = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  const versions = db.prepare(
    'SELECT id, saved_at, body FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC LIMIT 10'
  ).all(req.params.id);

  res.json(versions.map(v => ({
    id: v.id,
    saved_at: v.saved_at,
    body_text: (v.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    preview: (v.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100),
  })));
});

// ── POST /api/notes/:id/versions/:versionId/restore ───────────────────────────
router.post('/:id/versions/:versionId/restore', (req, res) => {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  const version = db.prepare('SELECT * FROM note_versions WHERE id = ? AND note_id = ?').get(req.params.versionId, req.params.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  // Save current state as a new version before restoring (so restore is undoable)
  if (existing.body) {
    db.prepare(
      'INSERT INTO note_versions (note_id, user_id, body) VALUES (?, ?, ?)'
    ).run(req.params.id, req.userId, existing.body);

    const oldVersions = db.prepare(
      'SELECT id FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC LIMIT -1 OFFSET 10'
    ).all(req.params.id);
    if (oldVersions.length > 0) {
      const ids = oldVersions.map(v => v.id);
      db.prepare(`DELETE FROM note_versions WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
  }

  // Restore the version
  db.prepare(
    'UPDATE notes SET body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(version.body, req.params.id, req.userId);

  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id));
});

// ── POST /api/notes/:id/reflect ───────────────────────────────────────────────
// Generate a Mirror-style reflection on a note
router.post('/:id/reflect', async (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (!note.body?.trim()) return res.status(400).json({ error: 'Note has no content to reflect on' });

  const llm = require('../services/llmService');
  const memoryService = require('../services/memoryService');
  const db2 = require('../database');
  const portrait = db2.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  const memorySummary = await memoryService.synthesizeMemory(req.userId);

  const typeContext = {
    quote:      'This is a quote the user saved — reflect on what it means for them, why they might have saved it, what it\'s calling forward in them.',
    goal:       'This is a goal the user is working toward. Reflect on the intention behind it, what it reveals about their values, and what might support or challenge them.',
    idea:       'This is an idea the user captured. Explore its potential, its connections to their life, and what it might be pointing toward.',
    reflection: 'This is a personal reflection. Respond to it as you would a journal entry — with depth and care.',
    dream:      'This is a dream the user recorded. Explore its imagery and what it might be saying symbolically.',
    gratitude:  'This is something the user is grateful for. Reflect on why this matters to them and what it reveals about what they value.',
  };

  const typePrompt = typeContext[note.type] || 'Reflect thoughtfully on this note.';

  const systemPrompt = `You are Liminal's Mirror — a reflection system for a personal journaling app.
${typePrompt}

${portrait?.character_description ? `CHARACTER PORTRAIT:\n${portrait.character_description}\n` : ''}
${memorySummary ? `WHAT YOU KNOW ABOUT THIS PERSON:\n${memorySummary}\n` : ''}

Respond with a JSON object:
{
  "blocks": [
    { "title": "A named theme", "body": "Prose reflection...", "quote": null, "archetype": "Lens name" }
  ]
}

Rules:
- 1-2 blocks only (notes are shorter than journal entries)
- Write in prose, no bullet points
- Speak directly to the person ("you")
- Return ONLY the JSON`;

  const ytContext = buildYoutubeContext(req.userId, note.body || '');
  const imgContext = buildImageContext(req.userId, note.body || '');
  // Strip inline base64 image data from body before sending to LLM — descriptions are injected via imgContext
  const cleanBody = (note.body || '').replace(/data-src="data:image\/[^"]*"/g, 'data-src=""');
  const noteText = note.type === 'quote' ? `"${cleanBody}"${note.attribution ? '\n— ' + note.attribution : ''}` : cleanBody;
  const userMessage = noteText
    + (ytContext ? `\n\n---\nVIDEOS EMBEDDED IN THIS NOTE:\n${ytContext}` : '')
    + (imgContext ? `\n\n---\nIMAGES IN THIS NOTE:\n${imgContext}` : '');

  try {
    const raw = await llm.call(systemPrompt, userMessage, { maxTokens: 1000 });

    // Parse JSON from response
    let blocks = [];
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) blocks = JSON.parse(match[0]).blocks || [];
    } catch {
      blocks = [{ title: 'Reflection', body: raw.trim(), quote: null, archetype: 'Mirror' }];
    }

    // Persist the reflection
    db.prepare(`
      INSERT INTO note_reflections (note_id, user_id, blocks, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(note_id, user_id) DO UPDATE SET blocks = excluded.blocks, updated_at = CURRENT_TIMESTAMP
    `).run(note.id, req.userId, JSON.stringify(blocks));

    res.json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/notes/:id/reflect ─────────────────────────────────────────────
// Load a previously saved reflection for a note
router.get('/:id/reflect', (req, res) => {
  const row = db.prepare('SELECT blocks FROM note_reflections WHERE note_id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!row) return res.json({ blocks: [] });
  try {
    res.json({ blocks: JSON.parse(row.blocks) });
  } catch {
    res.json({ blocks: [] });
  }
});

module.exports = router;
