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
    const rawResponse = await llm.call(systemPrompt, userMessage, { maxTokens: 2500 });

    // 3. Parse Mirror blocks from JSON response
    //
    // The LLM is asked to return strict JSON, but in practice it sometimes:
    //   a) wraps the JSON in ```json fences
    //   b) prefaces it with a sentence ("Here's your reflection: { ... }")
    //   c) adds a trailing question or remark *after* the closing brace
    // (a) and (c) both make JSON.parse(rawResponse) throw. We handle all three
    // by locating the outermost { ... } via brace-matching and parsing that.
    let blocks = [];
    let opening = null;
    const parsed = extractJsonObject(rawResponse);
    if (parsed) {
      blocks = parsed.blocks || [];
      opening = parsed.opening || null;
    }
    // Final fallback: treat the whole response as a single prose block
    if (!blocks.length) {
      blocks = [{ title: 'Reflection', body: rawResponse, quote: null, archetype: singleArchetype || 'Auto' }];
    }

    // Force-tag every block with the chosen archetype so the frontend voice
    // override resolves correctly even if the LLM forgot the field.
    if (singleArchetype) {
      blocks = blocks.map(b => ({ ...b, archetype: singleArchetype }));
    }

    // 4. Echo: find a relevant snippet from a past entry and attach it to the
    // most thematically related block. Best-effort, never blocks the response.
    if (entryId && text && text.length >= 200 && blocks.length) {
      try {
        await attachEcho(blocks, text, entryId, req.userId);
      } catch (e) {
        console.warn('[reflect] echo attach failed:', e.message);
      }
    }

    // 5. Save blocks (with opening) and return response
    const savedData = { opening, blocks };
    console.log(`[reflect] Saving ${blocks.length} blocks for entryId=${entryId}, archetypes=${blocks.map(b => b.archetype).join(',')}`);
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
    res.json({ opening, blocks });

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

        // Auto-tag — write to auto_tags so the LLM-origin tags stay separate
        // from the user's manual tags. Manual wins: anything already in `tags`
        // is dropped from the auto set so a tag never lives in both at once.
        if (entryId) {
          const generated = await autoTag(text);
          if (generated.length) {
            const existing = db.prepare('SELECT tags FROM entries WHERE id = ? AND user_id = ?').get(entryId, userId);
            let manual = [];
            try { manual = JSON.parse(existing?.tags || '[]'); } catch {}
            const manualSet = new Set(manual.map((t) => String(t || '').trim().toLowerCase()));
            const seen = new Set();
            const auto = [];
            for (const t of generated) {
              const c = String(t || '').trim().toLowerCase();
              if (!c || seen.has(c) || manualSet.has(c)) continue;
              seen.add(c);
              auto.push(c);
            }
            db.prepare('UPDATE entries SET auto_tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(
              JSON.stringify(auto),
              entryId,
              userId
            );
          }
        }

        // Place a rosary bead on the Threads graph: match this entry against
        // existing threads now that auto_tags have been written (auto_tags are
        // a strong match signal). User already has their reflection on screen.
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
    res.status(500).json({ error: 'Reflection failed. Check your LLM API key and provider settings.' });
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

  try {
    db.prepare(
      `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(entryId, req.userId, encryptField(req.userId, JSON.stringify({ opening, blocks })));
    res.json({ opening, blocks });
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
    blocks[index] = { ...blocks[index], ...patch };
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
    // Single archetype voice — custom archetype prompt overrides built-in voice
    let voice = null;
    try {
      const customs = JSON.parse(portrait?.custom_archetypes || '[]');
      const match = customs.find(c => c.name === archetype);
      if (match?.prompt) voice = match.prompt;
    } catch {}
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
    const block = parsed || { title: blockTitle || 'Reflection', body: raw, quote: null, archetype: isAuto ? 'Auto' : archetype };
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
  }
  return null;
}

// Build a single-archetype reflect prompt: same multi-block JSON shape that
// /api/reflect normally returns, but spoken in ONE specific voice (Taoist, Zen,
// custom etc) instead of the blended Auto voice. Voice anchored at start AND
// end so smaller models stay in-character.
async function buildSingleArchetypeReflectPrompt(portrait, archetype, userId) {
  const summary = await memory.synthesizeMemory(userId);
  const shortSummary = summary && summary.length > 600 ? summary.slice(0, 600) + '…' : (summary || '');

  // Custom archetype prompt overrides the built-in voice if the user defined one
  let voice = null;
  try {
    const customs = JSON.parse(portrait?.custom_archetypes || '[]');
    const match = customs.find(c => c.name === archetype);
    if (match?.prompt) voice = match.prompt;
  } catch {}
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
