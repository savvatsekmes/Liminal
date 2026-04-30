const express = require('express');
const router = express.Router();
const db = require('../database');
const llm = require('../services/llmService');
const memory = require('../services/memoryService');
const { indexEntry, embed, querySimilar } = require('../services/embeddingService');
const threadService = require('../services/threadService');
const { requireAuth } = require('../middleware/auth');
const { buildYoutubeContext } = require('./youtube');
const { buildImageContext } = require('./images');
const { buildCardContext } = require('./cards');
const { encryptField, safeDecrypt } = require('../services/rowCrypto');
const { applyPatchWithEditTracking, applyPutWithEditTracking, sanitiseQuote } = require('../services/reflectionEdits');
const quoteBank = require('../services/quoteBank');
const reflectStream = require('../services/reflectStream');

router.use(requireAuth);

// ── POST /api/reflect ────────────────────────────────────────────────────────
// Body: { entryId, entryBody, entryText }
// Returns: { blocks: [{title, body, quote, archetype}] }
router.post('/', async (req, res) => {
  const { entryId, entryBody, entryText, archetype } = req.body;
  const singleArchetype = archetype && archetype !== 'Auto' ? archetype : null;
  console.log(`[reflect] POST entryId=${entryId} userId=${req.userId} textLen=${(entryText||entryBody||'').length} archetype=${singleArchetype || 'Auto'}`);

  if (!entryText && !entryBody) {
    return res.status(400).json({ error: 'entryText is required' });
  }

  const text = entryText || entryBody;

  // Load portrait
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);

  try {
    // 1. Build system prompt — single-archetype voice if requested, otherwise blended Auto
    const preferredName = require('../services/settingsService').getForUser('display_name', req.userId)?.trim() || null;
    const systemPrompt = singleArchetype
      ? await buildSingleArchetypeReflectPrompt(portrait, singleArchetype, req.userId)
      : await memory.buildReflectSystemPrompt(portrait, text, entryId || null, req.userId, preferredName);

    // 2. LLM call — read HTML body from DB to avoid sending huge base64 over HTTP
    const entryRow = entryId ? db.prepare('SELECT body FROM entries WHERE id = ? AND user_id = ?').get(entryId, req.userId) : null;
    const htmlBody = safeDecrypt(req.userId, entryRow?.body) || entryBody || '';
    const ytContext = buildYoutubeContext(req.userId, htmlBody);
    const imgContext = buildImageContext(req.userId, htmlBody);
    const cardContext = buildCardContext(htmlBody);
    // The journal entry is the SUBJECT. Everything else the user embedded
    // (videos, images, tarot pulls) is REFERENCE — material they linked
    // alongside their writing, not the writing itself. The labels below
    // make this distinction explicit so the model doesn't mirror the
    // video's language back as the user's own voice.
    const userMessage = `# TODAY'S JOURNAL ENTRY (primary subject of your reflection)\n\n${text}`
      + (ytContext ? `\n\n---\n# REFERENCE: videos the user embedded (background only — do NOT treat these as the user's words or let them set the topic)\n\n${ytContext}` : '')
      + (imgContext ? `\n\n---\n# REFERENCE: images in the entry (background only)\n\n${imgContext}` : '')
      + (cardContext ? `\n\n---\n# REFERENCE: tarot cards pulled in the entry\n\n${cardContext}` : '');
    // 3. Stream blocks to the client as the model produces them. Each block
    // is post-processed (sanitiseQuote, orphan-bold strip, quote bank match)
    // before being sent over SSE. The full reflection is saved to DB at end
    // of stream after the echo callout runs (which needs all blocks present).
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable any reverse-proxy buffering
    res.flushHeaders?.();

    const lang = (req.body.language || req.body.lang || 'en').toLowerCase().slice(0, 2);
    const sendEvent = (event, data) => {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (e) {
        console.warn('[reflect] sendEvent failed:', e.message);
      }
    };

    // Track quote texts already attached to this reflection so the same
    // quote can't appear on two blocks. The bank's findBestQuote skips any
    // text in this set when picking.
    const usedQuoteTexts = new Set();

    // Per-block post-processing: archetype tag, sanitise quote, strip orphan
    // bold, replace quote with curated-bank match. All synchronous except
    // the bank lookup (which embeds the body and picks via cosine).
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
    let openingFinal = null;
    let blockIndex = 0;

    await reflectStream.run(systemPrompt, userMessage, { maxTokens: 2500 }, {
      onOpening: (txt) => {
        openingFinal = txt;
        sendEvent('opening', { opening: txt });
      },
      onBlock: async (rawBlock) => {
        const processed = await postProcessBlock(rawBlock, blockIndex);
        blockIndex++;
        finalBlocks.push(processed);
        sendEvent('block', processed);
      },
      onDone: async (final) => {
        // Salvage path: if the streaming parser couldn't extract any blocks
        // (model emitted truly broken JSON), try the legacy structural salvage
        // on the full raw text and emit those blocks now. Better late than
        // empty.
        if (finalBlocks.length === 0) {
          const salvaged = salvageReflection(final.raw);
          if (salvaged && salvaged.blocks.length) {
            console.warn(`[reflect] salvaged ${salvaged.blocks.length} blocks from end-of-stream`);
            if (!openingFinal && salvaged.opening) {
              openingFinal = salvaged.opening;
              sendEvent('opening', { opening: salvaged.opening });
            }
            for (const rb of salvaged.blocks) {
              const processed = await postProcessBlock(rb, blockIndex);
              blockIndex++;
              finalBlocks.push(processed);
              sendEvent('block', processed);
            }
          }
        }
        // Truly empty fallback — at least surface the raw text so user sees
        // something rather than blank panel.
        if (finalBlocks.length === 0) {
          const fallback = await postProcessBlock(
            { title: 'Reflection', body: final.raw, quote: null, archetype: singleArchetype || 'Auto' },
            0,
          );
          finalBlocks.push(fallback);
          sendEvent('block', fallback);
        }

        // Echo: find a relevant snippet from a past entry and attach to one
        // block. After streaming finishes since echo needs to compare across
        // all blocks. Mutates the matched block's `echo` field; we re-emit
        // that block as an `update` event so the frontend can patch.
        if (entryId && text && text.length >= 200 && finalBlocks.length) {
          try {
            await attachEcho(finalBlocks, text, entryId, req.userId);
            // Find which block got the echo and re-emit. attachEcho mutates
            // exactly one block (the best match) by adding an `echo` field.
            const echoed = finalBlocks.findIndex((b) => b && b.echo);
            if (echoed >= 0) {
              sendEvent('update', finalBlocks[echoed]);
            }
          } catch (e) {
            console.warn('[reflect] echo attach failed:', e.message);
          }
        }

        // Save consolidated reflection to DB (strip our internal _index field).
        const savedBlocks = finalBlocks.map(({ _index, ...rest }) => rest);
        const savedData = { opening: openingFinal, blocks: savedBlocks };
        console.log(`[reflect] Saving ${savedBlocks.length} blocks for entryId=${entryId}, archetypes=${savedBlocks.map(b => b.archetype).join(',')}`);
        if (entryId) {
          try {
            db.prepare(
              `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, updated_at)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
            ).run(entryId, req.userId, encryptField(req.userId, JSON.stringify(savedData)));
            console.log(`[reflect] Saved OK`);
          } catch (e) {
            console.error('[reflect] Failed to save reflections:', e.message);
          }
        } else {
          console.log(`[reflect] Skipped save — no entryId`);
        }

        sendEvent('done', { blockCount: savedBlocks.length });
        res.end();
      },
      onError: (err) => {
        sendEvent('error', { error: err.message || 'Stream failed' });
        res.end();
      },
    });

    // 6. Background: index entry, extract memories, auto-tag
    const userId = req.userId;
    setImmediate(async () => {
      try {
        // Index entry for future RAG retrieval
        if (entryId) {
          await indexEntry(entryId, text);
          db.prepare(
            `INSERT OR REPLACE INTO entry_embeddings (entry_id, embedded_at) VALUES (?, CURRENT_TIMESTAMP)`
          ).run(entryId);
        }

        // Extract discrete memory items from this entry
        await memory.extractAndStoreMemories(text, buildPortraitString(portrait), userId, entryId);

        // Auto-tagging on reflect was removed by request — the user found the
        // LLM-applied tags noisy and not particularly useful. Manual tags are
        // the only source of truth for entry tagging now. Threads still get a
        // bead per entry (below); they just lose auto_tags as a match signal.

        // Place a rosary bead on the Threads graph: match this entry against
        // existing threads. User already has their reflection on screen.
        if (entryId) {
          try {
            await threadService.threadSingleItem('entry', entryId, userId);
          } catch (err) {
            console.error('[reflect] thread bead failed:', err.message);
          }
        }
      } catch (err) {
        console.error('[reflect] Background tasks failed:', err.message);
      }
    });
  } catch (err) {
    console.error('[reflect] Error:', err.message);
    // If headers haven't been sent yet (failure before SSE init), respond
    // with a normal JSON 500. If we're already streaming, just close.
    if (!res.headersSent) {
      res.status(500).json({ error: 'Reflection failed. Check your LLM API key and provider settings.' });
    } else {
      try { res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); } catch {}
    }
  }
});

// ── GET /api/reflect/:entryId ────────────────────────────────────────────────
// Load saved reflections for an entry
router.get('/:entryId', (req, res) => {
  const row = db.prepare(
    'SELECT blocks FROM reflections WHERE entry_id = ? AND user_id = ?'
  ).get(req.params.entryId, req.userId);
  console.log(`[reflect] GET entryId=${req.params.entryId} userId=${req.userId} found=${!!row}`);
  if (!row) return res.json({ opening: null, blocks: [] });
  const saved = JSON.parse(safeDecrypt(req.userId, row.blocks));
  // Support old format (plain array) and new format ({ opening, blocks })
  if (Array.isArray(saved)) {
    console.log(`[reflect] GET archetypes=${saved.map(b => b.archetype).join(',')}`);
    res.json({ opening: null, blocks: saved });
  } else {
    console.log(`[reflect] GET archetypes=${(saved.blocks || []).map(b => b.archetype).join(',')}`);
    res.json({ opening: saved.opening || null, blocks: saved.blocks || [] });
  }
});

// ── PUT /api/reflect/:entryId/blocks ─────────────────────────────────────────
// Overwrite the saved reflection for an entry with a user-edited blocks array.
// Body: { opening?: string|null, blocks: [{title, body, quote, archetype}] }
router.put('/:entryId/blocks', (req, res) => {
  const entryId = Number(req.params.entryId);
  if (!entryId) return res.status(400).json({ error: 'invalid entryId' });
  const { opening = null, blocks } = req.body || {};
  if (!Array.isArray(blocks)) return res.status(400).json({ error: 'blocks must be an array' });

  // Verify the entry belongs to this user before writing
  const owns = db.prepare('SELECT 1 FROM entries WHERE id = ? AND user_id = ?').get(entryId, req.userId);
  if (!owns) return res.status(404).json({ error: 'entry not found' });

  // Pull the previous saved blocks so we can flag any block whose content
  // differs from what was there before as `edited: true`.
  let oldBlocks = [];
  try {
    const prev = db.prepare('SELECT blocks FROM reflections WHERE entry_id = ? AND user_id = ?').get(entryId, req.userId);
    if (prev) {
      const saved = JSON.parse(safeDecrypt(req.userId, prev.blocks));
      oldBlocks = Array.isArray(saved) ? saved : (saved.blocks || []);
    }
  } catch {}
  const tracked = applyPutWithEditTracking(oldBlocks, blocks);

  try {
    db.prepare(
      `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(entryId, req.userId, encryptField(req.userId, JSON.stringify({ opening, blocks: tracked })));
    res.json({ opening, blocks: tracked });
  } catch (err) {
    console.error('[reflect] PUT blocks failed:', err.message);
    res.status(500).json({ error: 'Save failed.' });
  }
});

// ── PATCH /api/reflect/:entryId/blocks/:index ────────────────────────────────
// Patch a single block in the saved reflection. Server reads existing blocks,
// merges the patch into the indexed block, writes back. Lets the frontend save
// a single field without needing the full blocks array (avoids races when the
// user edits and immediately switches entries).
// Body: { patch: { title?, body?, quote?, archetype? } }
router.patch('/:entryId/blocks/:index', (req, res) => {
  const entryId = Number(req.params.entryId);
  const index = Number(req.params.index);
  if (!entryId || Number.isNaN(index)) return res.status(400).json({ error: 'invalid params' });
  const { patch } = req.body || {};
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'patch required' });

  const owns = db.prepare('SELECT 1 FROM entries WHERE id = ? AND user_id = ?').get(entryId, req.userId);
  if (!owns) return res.status(404).json({ error: 'entry not found' });

  const row = db.prepare('SELECT blocks FROM reflections WHERE entry_id = ? AND user_id = ?').get(entryId, req.userId);
  if (!row) return res.status(404).json({ error: 'reflection not found' });

  try {
    const saved = JSON.parse(safeDecrypt(req.userId, row.blocks));
    const opening = Array.isArray(saved) ? null : (saved.opening || null);
    const blocks = Array.isArray(saved) ? saved : (saved.blocks || []);
    if (index < 0 || index >= blocks.length) return res.status(400).json({ error: 'index out of range' });
    blocks[index] = applyPatchWithEditTracking(blocks[index], patch);
    db.prepare(
      `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(entryId, req.userId, encryptField(req.userId, JSON.stringify({ opening, blocks })));
    res.json({ opening, blocks });
  } catch (err) {
    console.error('[reflect] PATCH block failed:', err.message);
    res.status(500).json({ error: 'Save failed.' });
  }
});

// ── POST /api/reflect/block ──────────────────────────────────────────────────
// Regenerate a single Mirror block with an optional archetype override.
// Body: { entryText, archetype, blockTitle }
// archetype = "Auto" → blended aggregate voice using sliders
// archetype = "Zen" etc → single archetype voice
router.post('/block', async (req, res) => {
  const { entryText, archetype, blockTitle } = req.body;
  if (!entryText) return res.status(400).json({ error: 'entryText is required' });

  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  const summary = await memory.synthesizeMemory(req.userId);
  const isAuto = !archetype || archetype === 'Auto';

  let systemPrompt;
  if (isAuto) {
    // Blended aggregate voice using slider settings
    let activeArchetypes = ['Zen', 'Jungian', 'Stoic', 'Direct Friend'];
    try { activeArchetypes = JSON.parse(portrait?.active_archetypes || '[]'); } catch {}

    const voiceInstructions = memory.translateSlidersToVoice(portrait);
    systemPrompt = `You are an integrated, wise voice blending: ${activeArchetypes.join(', ')}.

Your voice is shaped by these qualities:
${voiceInstructions}

${summary ? `Context about this person:\n${summary}\n` : ''}

Respond to the journal entry below with ONE reflection block focused on the theme: "${blockTitle || 'this entry'}".

Return JSON with this shape:
{
  "title": "A Named Theme",
  "body": "Prose reflection...",
  "quote": "Optional quote or null",
  "archetype": "Auto"
}

Rules: prose only, no bullets, bold sparingly (1-2 phrases max). Speak as one coherent voice — do not label which archetype you draw from. Show both sides. Speak directly using "you".
Return ONLY the JSON object.`;
  } else {
    // Single archetype voice — custom prompt overrides built-in voice.
    // Wrapped via getSafeCustomArchetypePrompt so the immutable safety suffix
    // sits below any user-controlled text.
    let voice = memory.getSafeCustomArchetypePrompt(portrait, archetype);
    if (!voice) voice = memory.getArchetypeVoice(archetype);

    // Voice anchoring strategy: lead with the voice instructions, keep the
    // biographical summary short so it can't drown out the voice's attention
    // mass, then ECHO the voice anchor immediately before generation. Smaller
    // models (qwen 9B etc) need the voice to be both first AND last in context.
    const shortSummary = summary && summary.length > 600 ? summary.slice(0, 600) + '…' : (summary || '');

    systemPrompt = `You are the ${archetype} voice. Speak ONLY as ${archetype} — no other voice, tradition, or register.

${voice || ''}

${shortSummary ? `Brief context about this person (do not let it pull you out of voice):\n${shortSummary}\n` : ''}

Task: respond to the journal entry below with ONE reflection block focused on the theme: "${blockTitle || 'this entry'}".

Return JSON with this shape:
{
  "title": "A Named Theme",
  "body": "Prose reflection...",
  "quote": "Optional quote or null",
  "archetype": "${archetype}"
}

Format rules: prose only, no bullets, bold sparingly (1-2 phrases max). Show both sides. Speak directly as "you".

VOICE REMINDER — this is the most important rule: stay unmistakably in the ${archetype} voice throughout. Your vocabulary, sentence rhythm, imagery, and frame must make it obvious to a reader which voice is speaking. If you sound like a generic "wise reflection", you have failed. Re-read the USE / AVOID list above before writing.

Return ONLY the JSON object.`;
  }

  try {
    const raw = await llm.call(systemPrompt, `Journal entry:\n\n${entryText}`, { maxTokens: 600 });
    const parsed = extractJsonObject(raw);
    const block = sanitiseQuote(parsed || { title: blockTitle || 'Reflection', body: raw, quote: null, archetype: isAuto ? 'Auto' : archetype });
    res.json(block);
  } catch (err) {
    console.error('[reflect/block] Error:', err.message);
    res.status(500).json({ error: 'Block regeneration failed.' });
  }
});

// ── POST /api/reflect/polish ─────────────────────────────────────────────────
// Polish text — fix spelling, grammar, and readability while preserving voice.
// Body: { text, format? }  (format: 'html' | 'plain', default 'html')
// Returns: { polished }
router.post('/polish', async (req, res) => {
  const { text, format } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const isHtml = format !== 'plain';
  const systemPrompt = `You are a gentle writing editor for personal journal entries and notes.

Your job:
- Fix spelling and grammar mistakes
- Improve sentence flow and readability where awkward
- Clean up punctuation and capitalisation
- Break run-on sentences into clearer ones

Rules:
- PRESERVE the writer's voice, tone, personality, and emotional register exactly
- Do NOT add new ideas, metaphors, or flourishes
- Do NOT remove meaning or cut content
- Keep approximately the same length
- Do NOT add a title or heading
- ${isHtml ? 'The input is HTML. Preserve all HTML tags, structure, and formatting exactly. Only change the text content within tags.' : 'Return plain text only.'}
- Return ONLY the polished text, no commentary or explanation`;

  try {
    const maxTokens = Math.max(1000, Math.ceil(text.length / 2));
    const polished = await llm.call(systemPrompt, text, { maxTokens, language: false });
    res.json({ polished: polished.trim() });
  } catch (err) {
    console.error('[reflect/polish] Error:', err.message);
    res.status(500).json({ error: 'Polish failed.' });
  }
});

// ── POST /api/reflect/title — generate a title from text ────────────────────

router.post('/title', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length < 10) return res.status(400).json({ error: 'text too short to generate a title' });

  const systemPrompt = `You generate short, evocative titles for personal journal entries and notes.

Rules:
- Return ONLY the title, nothing else — no quotes, no punctuation wrapping, no explanation
- 2–8 words maximum
- Capture the essence or emotional centre of the text
- Use the writer's own language/tone where possible
- Do NOT use generic titles like "My Thoughts" or "Daily Reflection"
- Do NOT use colons or subtitle formats`;

  try {
    const title = await llm.call(systemPrompt, plain.slice(0, 2000), { maxTokens: 30, language: false });
    res.json({ title: title.trim().replace(/^["']|["']$/g, '') });
  } catch (err) {
    console.error('[reflect/title] Error:', err.message);
    res.status(500).json({ error: 'Title generation failed.' });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

// Extract the first balanced { ... } object from an LLM response and JSON.parse
// it. Tolerates leading prose, trailing prose, and ```json fences. Returns the
// parsed object or null if no parseable object is found. We try the largest
// candidate first (outermost braces) and progressively shrink on failure to
// handle the rare case where the response contains an inner JSON-shaped string.
function extractJsonObject(raw) {
  if (!raw) return null;

  // Strip ```json or ``` fences if present — the JSON often lives inside.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const haystack = fenced ? fenced[1] : raw;

  const start = haystack.indexOf('{');
  if (start === -1) return null;

  // Walk forward tracking string state + brace depth so braces inside string
  // literals are ignored. Try parsing each balanced candidate from largest to
  // smallest match.
  const candidates = [];
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"')  { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        candidates.push(haystack.slice(start, i + 1));
        break; // outermost match — that's what we want
      }
    }
  }

  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
    // Repair pass: LLMs sometimes omit the comma between top-level pairs,
    // producing e.g. `"opening": "..." "blocks": [...]`. Insert commas where
    // a closing " or } or ] is followed by whitespace then `"key":` without
    // a separator. Only runs outside of string literals.
    try { return JSON.parse(repairLlmJson(c)); } catch {}
  }
  if (raw) console.warn('[reflect] JSON parse failed; raw head:', raw.slice(0, 200));
  return null;
}

// Last-resort structural extraction when extractJsonObject can't recover.
// Pulls top-level "opening" plus each {"title":..., "body":..., ...} block
// independently via brace-matching, so even if the surrounding JSON is broken
// (e.g. unclosed array, misplaced top-level keys inside the array) we still
// reconstruct a usable reflection instead of dumping raw JSON to the user.
function salvageReflection(raw) {
  if (!raw) return null;
  const result = { opening: null, blocks: [] };

  // Pull top-level "opening" via regex, decoding escapes via JSON.parse.
  const openingMatch = raw.match(/"opening"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (openingMatch) {
    try { result.opening = JSON.parse('"' + openingMatch[1] + '"'); } catch {}
  }

  // Walk the string finding each `{ "title": ... }` object via brace-matching.
  // Skip braces inside string literals (same logic as extractJsonObject).
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '{') continue;
    if (!/^\{\s*"title"\s*:/.test(raw.slice(i, Math.min(i + 50, raw.length)))) continue;

    let depth = 0, inStr = false, escape = false, end = -1;
    for (let j = i; j < raw.length; j++) {
      const ch = raw[j];
      if (inStr) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inStr = false; }
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = j + 1; break; }
      }
    }
    if (end === -1) continue;

    const candidate = raw.slice(i, end);
    let block = null;
    try { block = JSON.parse(candidate); }
    catch { try { block = JSON.parse(repairLlmJson(candidate)); } catch {} }

    if (block && typeof block.title === 'string' && typeof block.body === 'string') {
      result.blocks.push({
        title: block.title,
        body: block.body,
        quote: block.quote || null,
        archetype: block.archetype || 'Auto',
      });
      i = end - 1;
    }
  }

  return result;
}

function repairLlmJson(s) {
  let out = '';
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    // Trailing-comma stripping: outside a string, skip any comma whose next
    // non-whitespace char is `}` or `]`. Smaller LLMs (qwen 4b, llama 3 8b)
    // frequently slip into JS-style trailing commas which strict JSON.parse
    // rejects, breaking otherwise-good reflection output.
    if (!inStr && ch === ',') {
      let p = i + 1;
      while (p < s.length && /\s/.test(s[p])) p++;
      if (s[p] === '}' || s[p] === ']') continue;
    }
    out += ch;
    let justClosedStructural = false;
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = false; justClosedStructural = true; }
      else continue;
    } else {
      if (ch === '"') { inStr = true; continue; }
      if (ch === '}' || ch === ']') justClosedStructural = true;
    }
    if (!justClosedStructural) continue;
    // Look ahead past whitespace for a `"<key>":` with no separator.
    let j = i + 1;
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] !== '"') continue;
    let k = j + 1;
    let esc = false;
    while (k < s.length) {
      const c2 = s[k];
      if (esc) { esc = false; k++; continue; }
      if (c2 === '\\') { esc = true; k++; continue; }
      if (c2 === '"') break;
      k++;
    }
    let m = k + 1;
    while (m < s.length && /\s/.test(s[m])) m++;
    if (s[m] === ':') out += ',';
  }
  return out;
}

// Build a single-archetype reflect prompt: same multi-block JSON shape that
// /api/reflect normally returns, but spoken in ONE specific voice (Taoist, Zen,
// custom etc) instead of the blended Auto voice. Voice anchored at start AND
// end so smaller models stay in-character.
async function buildSingleArchetypeReflectPrompt(portrait, archetype, userId) {
  const summary = await memory.synthesizeMemory(userId);
  const shortSummary = summary && summary.length > 600 ? summary.slice(0, 600) + '…' : (summary || '');

  // Custom archetype prompt overrides the built-in voice if the user defined one.
  // memory.getSafeCustomArchetypePrompt wraps user text with an immutable safety
  // suffix so jailbreaks inside the description can't bypass crisis/medical rules.
  let voice = memory.getSafeCustomArchetypePrompt(portrait, archetype);
  if (!voice) voice = memory.getArchetypeVoice(archetype);

  // Inject response style sliders so they apply even in single-archetype mode
  const sliderVoice = memory.translateSlidersToVoice(portrait);

  return `You are the ${archetype} voice. Speak ONLY as ${archetype} — no other voice, tradition, or register.

${voice || ''}

${sliderVoice ? `The user has also set these response style preferences. Honour them while staying in the ${archetype} voice:\n${sliderVoice}\n` : ''}

${shortSummary ? `Brief context about this person (do not let it pull you out of voice):\n${shortSummary}\n` : ''}

Task: respond to the journal entry below with 2–4 reflection blocks, each focused on a different theme you notice in the entry.

Return JSON with this exact shape:
{
  "opening": "One short evocative line that names what you sense in this entry, in the ${archetype} voice",
  "blocks": [
    {
      "title": "A Named Theme",
      "body": "Prose reflection in the ${archetype} voice",
      "quote": "Optional quote or null",
      "archetype": "${archetype}"
    }
  ]
}

Format rules: prose only, no bullets, bold sparingly (1-2 phrases max). Show both sides. Speak directly as "you". Each block titled with the THEME, not the archetype name.

VOICE REMINDER — this is the most important rule: stay unmistakably in the ${archetype} voice throughout every block. Your vocabulary, sentence rhythm, imagery, and frame must make it obvious to a reader which voice is speaking. If you sound like a generic "wise reflection", you have failed. Re-read the USE / AVOID list above before writing.

Return ONLY the JSON object.`;
}

function buildPortraitString(portrait) {
  if (!portrait) return '';
  const parts = [];
  if (portrait.mbti) parts.push(`MBTI: ${portrait.mbti}`);
  if (portrait.enneagram) parts.push(`Enneagram: ${portrait.enneagram}`);
  return parts.join('\n');
}

const TAG_CATEGORIES = [
  'identity', 'career', 'spirituality', 'relationships', 'self-work',
  'creativity', 'health', 'ideas', 'grief', 'body', 'fear', 'joy',
  'transition', 'work', 'family', 'nature', 'dreams', 'money',
];

async function autoTag(text) {
  const systemPrompt = `You are a journal entry tagger. Given a journal entry, return the 2-5 most relevant tags.

Available categories: ${TAG_CATEGORIES.join(', ')}

You may also suggest new tags if none of the above fit well.

Return ONLY a JSON array of tag strings, e.g.: ["identity", "career", "transition"]
No explanation. No other text.`;

  try {
    const raw = await llm.call(systemPrompt, text, { maxTokens: 100, language: false });
    const cleaned = raw.trim().replace(/```(?:json)?|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

// ── Echo callout ─────────────────────────────────────────────────────────────
// After the LLM generates blocks, find one relevant snippet from a past entry
// and staple it onto the block whose body is closest to that snippet. Mutates
// `blocks` in place. All embeddings are normalised by Xenova/all-MiniLM-L6-v2,
// so dot product == cosine similarity.

const ECHO_MIN_SIMILARITY = 0.30; // raise if echoes feel forced
const ECHO_SNIPPET_MAX_CHARS = 140;
const ECHO_SNIPPET_MIN_CHARS = 30;

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function splitSentences(text) {
  // Crude but adequate. Strips HTML if any leaks through.
  const plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return [];
  return plain
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trimSnippet(s) {
  const clean = String(s || '').trim();
  if (clean.length <= ECHO_SNIPPET_MAX_CHARS) return clean;
  const slice = clean.slice(0, ECHO_SNIPPET_MAX_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 60 ? slice.slice(0, lastSpace) : slice).replace(/[,;:\-]+$/, '') + '…';
}

async function attachEcho(blocks, currentText, currentEntryId, userId) {
  const hits = await querySimilar(currentText, 5, [Number(currentEntryId)]);
  console.log(`[reflect] echo candidates: ${hits.length} hits, top scores=${hits.slice(0,3).map(h => `${h.entryId}:${h.score.toFixed(3)}`).join(' ')} (floor=${ECHO_MIN_SIMILARITY})`);
  if (!hits || !hits.length) return;
  const top = hits[0];
  if (!top || top.score < ECHO_MIN_SIMILARITY) {
    console.log(`[reflect] echo skipped: top score ${top?.score?.toFixed(3) || 'n/a'} below floor ${ECHO_MIN_SIMILARITY}`);
    return;
  }

  const source = db.prepare(
    'SELECT id, title, body_text, created_at FROM entries WHERE id = ? AND user_id = ?'
  ).get(top.entryId, userId);
  if (!source || !source.body_text) return;
  source.body_text = safeDecrypt(userId, source.body_text);
  if (!source.body_text) return;

  // Pick the sentence in the source most similar to the current entry text.
  const sentences = splitSentences(source.body_text)
    .filter((s) => s.length >= ECHO_SNIPPET_MIN_CHARS);
  if (!sentences.length) return;

  const currentVec = await embed(currentText);
  let bestIdx = -1;
  let bestScore = -Infinity;
  const sentVecs = [];
  for (let i = 0; i < sentences.length; i++) {
    const v = await embed(sentences[i]);
    sentVecs.push(v);
    const score = dot(currentVec, v);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestIdx === -1) return;
  const snippet = trimSnippet(sentences[bestIdx]);
  if (snippet.length < ECHO_SNIPPET_MIN_CHARS) return;
  const snippetVec = sentVecs[bestIdx];

  // Pick which block to attach to: highest cosine between block.body and snippet.
  let bestBlock = 0;
  let bestBlockScore = -Infinity;
  for (let i = 0; i < blocks.length; i++) {
    const body = blocks[i]?.body || '';
    if (!body.trim()) continue;
    const bv = await embed(body);
    const score = dot(snippetVec, bv);
    if (score > bestBlockScore) { bestBlockScore = score; bestBlock = i; }
  }

  blocks[bestBlock] = {
    ...blocks[bestBlock],
    echo: {
      snippet,
      source_id: source.id,
      source_title: source.title || 'Untitled',
      source_date: source.created_at,
    },
  };
  console.log(`[reflect] echo attached to block ${bestBlock} from entry ${source.id} (sim=${top.score.toFixed(3)})`);
}

module.exports = router;
module.exports.__test__ = { extractJsonObject, salvageReflection, repairLlmJson };
