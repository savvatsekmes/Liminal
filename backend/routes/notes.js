const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { buildYoutubeContext } = require('./youtube');
const { buildImageContext } = require('./images');
const { buildCardContext } = require('./cards');
const threadService = require('../services/threadService');
const { encryptField, safeDecrypt } = require('../services/rowCrypto');
const { applyPatchWithEditTracking, applyPutWithEditTracking, sanitiseQuote } = require('../services/reflectionEdits');

router.use(requireAuth);

function parseTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}
function noteRow(userId, row) {
  if (!row) return null;
  if (row.body !== undefined) row.body = safeDecrypt(userId, row.body);
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
  res.json(rows.map((r) => noteRow(req.userId, r)));
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
// Converts notes in a custom tag category to type 'idea' rather than deleting them
router.delete('/custom-tags/:tag', (req, res) => {
  db.prepare(
    "UPDATE notes SET type = 'idea', custom_tag = NULL WHERE type = 'custom' AND custom_tag = ? AND user_id = ?"
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
    .run(type, encryptField(req.userId, body), attribution || null, target_date || null, custom_tag || null, JSON.stringify(normalised.tags), JSON.stringify(normalised.auto_tags), req.userId);

  // Rosary bead: thread this note into the graph if it already has content.
  // Empty shells (created before autosave fills them) are skipped — the
  // subsequent PUT will thread them once their body materialises.
  if ((body || '').trim()) {
    const noteId = result.lastInsertRowid;
    const userId = req.userId;
    setImmediate(() => {
      threadService.threadSingleItem('note', noteId, userId).catch((err) => {
        console.error('[notes] thread bead failed:', err.message);
      });
    });
  }

  res.status(201).json(noteRow(req.userId, db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid)));
});

// ── PUT /api/notes/:id ────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Note not found' });


  const { type, body, attribution, target_date, custom_tag, tags, auto_tags, locked } = req.body;
  const fields = [];
  const params = [];

  if (type !== undefined)        { fields.push('type = ?');        params.push(type); }
  if (body !== undefined)        { fields.push('body = ?');        params.push(encryptField(req.userId, body)); }
  if (attribution !== undefined) { fields.push('attribution = ?'); params.push(attribution || null); }
  if (target_date !== undefined) { fields.push('target_date = ?'); params.push(target_date || null); }
  if (custom_tag !== undefined)  { fields.push('custom_tag = ?');  params.push(custom_tag || null); }
  if (req.body.title !== undefined) { fields.push('title = ?');    params.push(req.body.title); }
  if (locked !== undefined)      { fields.push('locked = ?');      params.push(locked ? 1 : 0); }

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

  // Rosary bead: thread on first substantive save (threaded_at NULL + body
  // non-empty). Subsequent edits don't re-thread to avoid 20+ LLM calls
  // during autosave. The before-quit sweep / Re-thread handle significant
  // rewrites. Tag-only updates still trigger threading since tags are strong
  // match signals.
  const tagsChanged = tags !== undefined || auto_tags !== undefined;
  const current = db.prepare('SELECT body, threaded_at FROM notes WHERE id = ?').get(req.params.id);
  if (current && (current.body || '').trim() && (!current.threaded_at || tagsChanged)) {
    const noteId = Number(req.params.id);
    const userId = req.userId;
    setImmediate(() => {
      threadService.threadSingleItem('note', noteId, userId).catch((err) => {
        console.error('[notes] thread bead failed:', err.message);
      });
    });
  }

  res.json(noteRow(req.userId, db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)));
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

  // Ciphertexts differ on every write (random IV), so the dedupe comparison
  // has to happen on plaintext.
  const latest = db.prepare(
    'SELECT body FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC LIMIT 1'
  ).get(req.params.id);
  if (latest && safeDecrypt(req.userId, latest.body) === safeDecrypt(req.userId, existing.body)) {
    return res.json({ skipped: true });
  }

  // Copy ciphertext straight into the version row — already encrypted with
  // the per-user key so no re-encryption needed.
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

  res.json(versions.map(v => {
    const body = safeDecrypt(req.userId, v.body) || '';
    const text = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      id: v.id,
      saved_at: v.saved_at,
      body_text: text,
      preview: text.slice(0, 100),
    };
  }));
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

  res.json(noteRow(req.userId, db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id)));
});

// ── POST /api/notes/:id/reflect ───────────────────────────────────────────────
// Generate a Mirror-style reflection on a note
router.post('/:id/reflect', async (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  // Decrypt body in-place so downstream prompt-building code sees plaintext.
  note.body = safeDecrypt(req.userId, note.body);
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

  // Resolve voice for single-archetype mode (custom prompt overrides built-in).
  // Custom prompts go through getSafeCustomArchetypePrompt so the immutable
  // safety suffix wins over any jailbreak text in the user description.
  let archetypeVoice = null;
  if (singleArchetype) {
    archetypeVoice = memoryService.getSafeCustomArchetypePrompt(portrait, singleArchetype);
    if (!archetypeVoice) archetypeVoice = memoryService.getArchetypeVoice(singleArchetype);
  }
  const shortMemory = memorySummary && memorySummary.length > 600 ? memorySummary.slice(0, 600) + '…' : (memorySummary || '');

  // Slider-driven voice + candor + tone permissions. Note reflection used to
  // bypass all of these — response-style sliders, candor mode, swearing, and
  // sexual_content_enabled silently did nothing on this surface. Wire them in
  // the same way Reflect / Oracle do so the user's settings carry through
  // consistently across journal, notes, and conversations.
  const sliderVoiceNote = memoryService.translateSlidersToVoice(portrait);
  const candorBlockNote = memoryService.buildCandorInstruction(portrait);
  const toneBlockNote   = memoryService.buildTonePermissions(portrait);
  // Build the portrait section the same way Reflect / Oracle / Ask do, then
  // apply the same three-tier portrait_weight directive (LOW / BALANCED /
  // HIGH). Previously notes dumped `character_description` raw, which already
  // contained astrology + tarot text from the AI portrait synthesis — so the
  // sky / rational-spiritual gates we added in buildPortraitSection never
  // applied to notes, and "Taurus root and Aries fire" / "the Hierophant"
  // kept leaking into note reflections.
  const portraitWeight = portrait?.slider_portrait_weight ?? 50;
  let portraitBlockNote = '';
  if (portrait && portraitWeight > 0) {
    const portraitSection = memoryService.buildPortraitSection
      ? memoryService.buildPortraitSection(portrait)
      : '';
    if (portraitSection) {
      if (portraitWeight < 30) {
        portraitBlockNote = `${portraitSection}\n\n## PORTRAIT EMPHASIS: LOW\nDo NOT lean on MBTI / Enneagram / astrology / Human Design / tarot / archetype lenses to frame the reflection. Meet them as the specific person who wrote this note. Treat the portrait above as far-background only.`;
      } else if (portraitWeight > 70) {
        portraitBlockNote = `${portraitSection}\n\n## PORTRAIT EMPHASIS: HIGH\nActively weave their portrait identity (MBTI, Enneagram, signs, archetypes, soul / life-path cards as relevant) into the reflection. Speak through this lens — not generically.`;
      } else {
        portraitBlockNote = `${portraitSection}\n\n## PORTRAIT EMPHASIS: BALANCED\nUse the portrait above to understand who the user is, but do NOT invoke sign / type-chart / archetype references anywhere in the reflection ("as a Taurus…", "your Aries fire…", "the Hierophant in you…", "your ENFP nature…") unless the note directly maps to that detail. Reflect on what they wrote, not on their chart.`;
      }
    }
  } else if (portrait) {
    portraitBlockNote = `## PORTRAIT EMPHASIS: OFF\nThe user has turned profile weighting off. Reflect on what they actually wrote. Do NOT invoke MBTI / Enneagram / astrology / Human Design / tarot / archetype framing.`;
  }
  // Soften the synthesized memory the same way Oracle does — it's background
  // about who they are, not specific imagery to quote back.
  const NOTE_MEM_CAP = 600;
  const memBackgroundLabel = shortMemory
    ? `## WHAT'S BEEN LEARNED ABOUT THIS PERSON (BACKGROUND ONLY)\n${shortMemory.length > NOTE_MEM_CAP ? shortMemory.slice(0, NOTE_MEM_CAP) + '…' : shortMemory}\n\n(Use this to understand them. Do NOT quote specific scenes, rituals, or imagery from it as openers; reflect on the note itself.)`
    : '';

  const systemPrompt = singleArchetype
    ? `You are the ${singleArchetype} voice. Speak ONLY as ${singleArchetype} — no other voice, tradition, or register.

${archetypeVoice || ''}

${portraitBlockNote ? portraitBlockNote + '\n' : ''}
${memBackgroundLabel ? memBackgroundLabel + '\n' : ''}
${sliderVoiceNote ? `The user has also set these response style preferences. Honour them while staying in the ${singleArchetype} voice:\n${sliderVoiceNote}\n` : ''}
${candorBlockNote ? `${candorBlockNote}\n` : ''}
${typePrompt}

Respond with a JSON object:
{
  "blocks": [
    { "title": "A Theme Title (replace with one drawn from THIS note)", "body": "There's a specific honesty in how a vending machine glows on an empty street at night. It isn't asking for anything; it's just available. **The light wasn't trying to be seen — it just couldn't help being visible.** That's what attention is, sometimes. (NOTE: format example only — setup, ONE bolded landing sentence, release. Replace the vending-machine imagery entirely with content drawn from THIS note. Do NOT mention vending machines or glow.)", "quote": null, "archetype": "${singleArchetype}" }
  ]
}

Rules:
- 1-2 blocks only (notes are shorter than journal entries)
- Each block body must be 100-150 words. Not shorter, not longer.
- Bold the strongest line in each block using **double asterisks**. REQUIRED — every block must contain exactly one bolded key sentence or phrase (never more than one bold span per block). Pick the line that lands hardest.
- Write in prose, no bullet points
- Speak directly to the person ("you")
- Return ONLY the JSON

${toneBlockNote}

VOICE REMINDER: stay unmistakably in the ${singleArchetype} voice. Vocabulary, rhythm, and imagery must make it obvious which voice is speaking.`
    : `You are Liminal's Mirror — a reflection system for a personal journaling app.
${typePrompt}

${portraitBlockNote ? portraitBlockNote + '\n' : ''}
${memBackgroundLabel ? memBackgroundLabel + '\n' : ''}

${sliderVoiceNote ? `## RESPONSE STYLE\n${sliderVoiceNote}\n` : ''}
${candorBlockNote ? `${candorBlockNote}\n` : ''}

Respond with a JSON object:
{
  "blocks": [
    { "title": "A Theme Title (replace with one drawn from THIS note)", "body": "There's a specific honesty in how a vending machine glows on an empty street at night. It isn't asking for anything; it's just available. **The light wasn't trying to be seen — it just couldn't help being visible.** That's what attention is, sometimes. (NOTE: format example only — setup, ONE bolded landing sentence, release. Replace the vending-machine imagery entirely with content drawn from THIS note. Do NOT mention vending machines or glow.)", "quote": null, "archetype": "Lens name" }
  ]
}

Rules:
- 1-2 blocks only (notes are shorter than journal entries)
- Each block body must be 100-150 words. Not shorter, not longer.
- Bold the strongest line in each block using **double asterisks**. REQUIRED — every block must contain exactly one bolded key sentence or phrase (never more than one bold span per block). Pick the line that lands hardest.
- Write in prose, no bullet points
- Speak directly to the person ("you")
- Return ONLY the JSON

${toneBlockNote}`;

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

  // Stream blocks to the client via SSE as the model produces them. Same
  // pattern as /api/reflect (journal); reflectStream handles the incremental
  // JSON parsing and the route does the per-block post-processing.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const reflectStream = require('../services/reflectStream');
  const quoteBank = require('../services/quoteBank');
  const lang = (req.body?.language || req.body?.lang || 'en').toLowerCase().slice(0, 2);

  const sendEvent = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.warn('[notes/reflect] sendEvent failed:', e.message);
    }
  };

  // Dedupe within this reflection: same quote can't appear on two blocks.
  const usedQuoteTexts = new Set();

  async function postProcessBlock(rawBlock, index) {
    let b = rawBlock;
    if (singleArchetype) b = { ...b, archetype: singleArchetype };
    b = sanitiseQuote(b);
    if (b && typeof b.body === 'string') {
      let body = b.body;
      const stars = (body.match(/\*\*/g) || []).length;
      if (stars % 2 !== 0) body = body.replace(/\*\*(?=[^*]*$)/, '');
      b = { ...b, body: body.trim() };
    }
    if (b && typeof b.body === 'string') {
      try {
        const picked = await quoteBank.findBestQuote(b.body, lang, { excludeTexts: usedQuoteTexts });
        if (picked) {
          usedQuoteTexts.add(picked.text);
          b = { ...b, quote: `${picked.text} — ${picked.author}` };
        } else {
          b = { ...b, quote: null };
        }
      } catch {
        b = { ...b, quote: null };
      }
    }
    return { ...b, _index: index };
  }

  const finalBlocks = [];
  let blockIndex = 0;

  try {
    await reflectStream.run(systemPrompt, userMessage, { maxTokens: 1000 }, {
      onBlock: async (rawBlock) => {
        const processed = await postProcessBlock(rawBlock, blockIndex);
        blockIndex++;
        finalBlocks.push(processed);
        sendEvent('block', processed);
      },
      onDone: async () => {
        // Truly empty fallback — surface raw text rather than blank panel.
        if (finalBlocks.length === 0) {
          const fallback = await postProcessBlock(
            { title: 'Reflection', body: '', quote: null, archetype: singleArchetype || 'Mirror' },
            0,
          );
          finalBlocks.push(fallback);
          sendEvent('block', fallback);
        }

        // Persist (strip our internal _index field).
        const savedBlocks = finalBlocks.map(({ _index, ...rest }) => rest);
        try {
          db.prepare(`
            INSERT INTO note_reflections (note_id, user_id, blocks, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(note_id, user_id) DO UPDATE SET blocks = excluded.blocks, updated_at = CURRENT_TIMESTAMP
          `).run(note.id, req.userId, encryptField(req.userId, JSON.stringify(savedBlocks)));
        } catch (e) {
          console.error('[notes/reflect] save failed:', e.message);
        }

        sendEvent('done', { blockCount: savedBlocks.length });
        res.end();
      },
      onError: (err) => {
        sendEvent('error', { error: err.message || 'Stream failed' });
        res.end();
      },
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      try { res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); } catch {}
    }
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

  let oldBlocks = [];
  try {
    const prev = db.prepare('SELECT blocks FROM note_reflections WHERE note_id = ? AND user_id = ?').get(noteId, req.userId);
    if (prev) oldBlocks = JSON.parse(safeDecrypt(req.userId, prev.blocks));
  } catch {}
  const tracked = applyPutWithEditTracking(oldBlocks, blocks);

  try {
    db.prepare(`
      INSERT INTO note_reflections (note_id, user_id, blocks, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(note_id, user_id) DO UPDATE SET blocks = excluded.blocks, updated_at = CURRENT_TIMESTAMP
    `).run(noteId, req.userId, encryptField(req.userId, JSON.stringify(tracked)));
    res.json({ blocks: tracked });
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
    const blocks = JSON.parse(safeDecrypt(req.userId, row.blocks));
    if (!Array.isArray(blocks) || index < 0 || index >= blocks.length) {
      return res.status(400).json({ error: 'index out of range' });
    }
    blocks[index] = applyPatchWithEditTracking(blocks[index], patch);
    db.prepare(`
      INSERT INTO note_reflections (note_id, user_id, blocks, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(note_id, user_id) DO UPDATE SET blocks = excluded.blocks, updated_at = CURRENT_TIMESTAMP
    `).run(noteId, req.userId, encryptField(req.userId, JSON.stringify(blocks)));
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
    res.json({ blocks: JSON.parse(safeDecrypt(req.userId, row.blocks)) });
  } catch {
    res.json({ blocks: [] });
  }
});

module.exports = router;
