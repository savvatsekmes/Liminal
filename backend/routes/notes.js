const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { buildYoutubeContext } = require('./youtube');
const { buildImageContext } = require('./images');
const { buildCardContext } = require('./cards');

router.use(requireAuth);

function parseTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}
function noteRow(row) {
  if (!row) return null;
  return { ...row, tags: parseTags(row.tags), auto_tags: parseTags(row.auto_tags) };
}

// Same dedupe + manual-wins rule as entries.js — manual `tags` always
// shadows `auto_tags` so a tag never lives in both at once.
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

// ── GET /api/notes ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json(rows.map(noteRow));
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
  const { type = 'idea', body = '', attribution, target_date, custom_tag, tags = [], auto_tags = [] } = req.body;
  const normalised = normaliseTagPair(tags, auto_tags);
  const result = db
    .prepare(
      `INSERT INTO notes (type, body, attribution, target_date, custom_tag, tags, auto_tags, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(type, body, attribution || null, target_date || null, custom_tag || null, JSON.stringify(normalised.tags), JSON.stringify(normalised.auto_tags), req.userId);

  res.status(201).json(noteRow(db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid)));
});

// ── PUT /api/notes/:id ────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Note not found' });


  const { type, body, attribution, target_date, custom_tag, tags, auto_tags } = req.body;
  const fields = [];
  const params = [];

  if (type !== undefined)        { fields.push('type = ?');        params.push(type); }
  if (body !== undefined)        { fields.push('body = ?');        params.push(body); }
  if (attribution !== undefined) { fields.push('attribution = ?'); params.push(attribution || null); }
  if (target_date !== undefined) { fields.push('target_date = ?'); params.push(target_date || null); }
  if (custom_tag !== undefined)  { fields.push('custom_tag = ?');  params.push(custom_tag || null); }
  if (req.body.title !== undefined) { fields.push('title = ?');    params.push(req.body.title); }

  // Tag updates: merge with existing values for the field that wasn't passed,
  // then normalise so manual `tags` always shadows `auto_tags`.
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

  db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  res.json(noteRow(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)));
});

// ── DELETE /api/notes/:id ─────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id, linked_session_id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  // Cascade: remove the linked Oracle conversation so orphaned chats don't
  // linger after the note they were spawned from is deleted.
  if (existing.linked_session_id) {
    db.prepare('DELETE FROM oracle_sessions WHERE id = ? AND user_id = ?').run(existing.linked_session_id, req.userId);
  }

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

  res.json(noteRow(db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)));
});

// ── POST /api/notes/:id/reflect ───────────────────────────────────────────────
// Generate a Mirror-style reflection on a note
router.post('/:id/reflect', async (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (!note.body?.trim()) return res.status(400).json({ error: 'Note has no content to reflect on' });

  const { archetype } = req.body || {};
  const singleArchetype = archetype && archetype !== 'Auto' ? archetype : null;

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

  // Resolve voice for single-archetype mode (custom prompt overrides built-in)
  let archetypeVoice = null;
  if (singleArchetype) {
    try {
      const customs = JSON.parse(portrait?.custom_archetypes || '[]');
      const match = customs.find(c => c.name === singleArchetype);
      if (match?.prompt) archetypeVoice = match.prompt;
    } catch {}
    if (!archetypeVoice) archetypeVoice = memoryService.getArchetypeVoice(singleArchetype);
  }
  const shortMemory = memorySummary && memorySummary.length > 600 ? memorySummary.slice(0, 600) + '…' : (memorySummary || '');

  const systemPrompt = singleArchetype
    ? `You are the ${singleArchetype} voice. Speak ONLY as ${singleArchetype} — no other voice, tradition, or register.

${archetypeVoice || ''}

${typePrompt}

${shortMemory ? `Brief context about this person (do not let it pull you out of voice):\n${shortMemory}\n` : ''}

Respond with a JSON object:
{
  "blocks": [
    { "title": "A named theme", "body": "Prose reflection in the ${singleArchetype} voice", "quote": null, "archetype": "${singleArchetype}" }
  ]
}

Rules:
- 1-2 blocks only (notes are shorter than journal entries)
- Write in prose, no bullet points
- Speak directly to the person ("you")
- Return ONLY the JSON

VOICE REMINDER: stay unmistakably in the ${singleArchetype} voice. Vocabulary, rhythm, and imagery must make it obvious which voice is speaking.`
    : `You are Liminal's Mirror — a reflection system for a personal journaling app.
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
  const cardContext = buildCardContext(note.body || '');
  // Strip inline base64 image data + card-reading divs from body before sending
  // to LLM — both are injected as decoded context below.
  const cleanBody = (note.body || '')
    .replace(/data-src="data:image\/[^"]*"/g, 'data-src=""')
    .replace(/<div\b[^>]*\bdata-card-reading\b[^>]*><\/div>/g, '')
    .replace(/<div\b[^>]*\bdata-card-reading\b[^>]*>[\s\S]*?<\/div>/g, '');
  const noteText = note.type === 'quote' ? `"${cleanBody}"${note.attribution ? '\n— ' + note.attribution : ''}` : cleanBody;
  const userMessage = noteText
    + (ytContext ? `\n\n---\nVIDEOS EMBEDDED IN THIS NOTE:\n${ytContext}` : '')
    + (imgContext ? `\n\n---\nIMAGES IN THIS NOTE:\n${imgContext}` : '')
    + (cardContext ? `\n\n---\nCARDS PULLED IN THIS NOTE:\n${cardContext}` : '');

  try {
    const raw = await llm.call(systemPrompt, userMessage, { maxTokens: 1000 });

    // Parse JSON from response
    let blocks = [];
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) blocks = JSON.parse(match[0]).blocks || [];
    } catch {
      blocks = [{ title: 'Reflection', body: raw.trim(), quote: null, archetype: singleArchetype || 'Mirror' }];
    }

    // Force-tag every block with the chosen archetype so the frontend voice
    // override resolves correctly even if the LLM forgot the field.
    if (singleArchetype) {
      blocks = blocks.map(b => ({ ...b, archetype: singleArchetype }));
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

// ── PUT /api/notes/:id/reflect/blocks ───────────────────────────────────────
// Overwrite the saved reflection for a note with a user-edited blocks array.
// Body: { blocks: [{title, body, quote, archetype}] }
router.put('/:id/reflect/blocks', (req, res) => {
  const noteId = Number(req.params.id);
  if (!noteId) return res.status(400).json({ error: 'invalid id' });
  const { blocks } = req.body || {};
  if (!Array.isArray(blocks)) return res.status(400).json({ error: 'blocks must be an array' });

  const owns = db.prepare('SELECT 1 FROM notes WHERE id = ? AND user_id = ?').get(noteId, req.userId);
  if (!owns) return res.status(404).json({ error: 'note not found' });

  try {
    db.prepare(`
      INSERT INTO note_reflections (note_id, user_id, blocks, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(note_id, user_id) DO UPDATE SET blocks = excluded.blocks, updated_at = CURRENT_TIMESTAMP
    `).run(noteId, req.userId, JSON.stringify(blocks));
    res.json({ blocks });
  } catch (err) {
    console.error('[notes] PUT reflect/blocks failed:', err.message);
    res.status(500).json({ error: 'Save failed.' });
  }
});

// ── PATCH /api/notes/:id/reflect/blocks/:index ───────────────────────────────
// Patch a single block of a note's reflection. Avoids edit-vs-switch races.
router.patch('/:id/reflect/blocks/:index', (req, res) => {
  const noteId = Number(req.params.id);
  const index = Number(req.params.index);
  if (!noteId || Number.isNaN(index)) return res.status(400).json({ error: 'invalid params' });
  const { patch } = req.body || {};
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'patch required' });

  const owns = db.prepare('SELECT 1 FROM notes WHERE id = ? AND user_id = ?').get(noteId, req.userId);
  if (!owns) return res.status(404).json({ error: 'note not found' });

  const row = db.prepare('SELECT blocks FROM note_reflections WHERE note_id = ? AND user_id = ?').get(noteId, req.userId);
  if (!row) return res.status(404).json({ error: 'reflection not found' });

  try {
    const blocks = JSON.parse(row.blocks);
    if (!Array.isArray(blocks) || index < 0 || index >= blocks.length) {
      return res.status(400).json({ error: 'index out of range' });
    }
    blocks[index] = { ...blocks[index], ...patch };
    db.prepare(`
      INSERT INTO note_reflections (note_id, user_id, blocks, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(note_id, user_id) DO UPDATE SET blocks = excluded.blocks, updated_at = CURRENT_TIMESTAMP
    `).run(noteId, req.userId, JSON.stringify(blocks));
    res.json({ blocks });
  } catch (err) {
    console.error('[notes] PATCH reflect block failed:', err.message);
    res.status(500).json({ error: 'Save failed.' });
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
