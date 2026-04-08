const express = require('express');
const router = express.Router();
const db = require('../database');
const llm = require('../services/llmService');
const memory = require('../services/memoryService');
const { indexEntry } = require('../services/embeddingService');
const { requireAuth } = require('../middleware/auth');
const { buildYoutubeContext } = require('./youtube');
const { buildImageContext } = require('./images');
const { buildCardContext } = require('./cards');

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
    const preferredName = portrait?.preferred_name?.trim() || null;
    const systemPrompt = singleArchetype
      ? await buildSingleArchetypeReflectPrompt(portrait, singleArchetype, req.userId)
      : await memory.buildReflectSystemPrompt(portrait, text, entryId || null, req.userId, preferredName);

    // 2. LLM call — read HTML body from DB to avoid sending huge base64 over HTTP
    const entryRow = entryId ? db.prepare('SELECT body FROM entries WHERE id = ? AND user_id = ?').get(entryId, req.userId) : null;
    const htmlBody = entryRow?.body || entryBody || '';
    const ytContext = buildYoutubeContext(req.userId, htmlBody);
    const imgContext = buildImageContext(req.userId, htmlBody);
    const cardContext = buildCardContext(htmlBody);
    const userMessage = `Here is today's journal entry:\n\n${text}`
      + (ytContext ? `\n\n---\nVIDEOS EMBEDDED IN THIS ENTRY:\n${ytContext}` : '')
      + (imgContext ? `\n\n---\nIMAGES IN THIS ENTRY:\n${imgContext}` : '')
      + (cardContext ? `\n\n---\nCARDS PULLED IN THIS ENTRY:\n${cardContext}` : '');
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

    // 4. Save blocks (with opening) and return response
    const savedData = { opening, blocks };
    console.log(`[reflect] Saving ${blocks.length} blocks for entryId=${entryId}, archetypes=${blocks.map(b => b.archetype).join(',')}`);
    if (entryId) {
      try {
        db.prepare(
          `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
        ).run(entryId, req.userId, JSON.stringify(savedData));
        console.log(`[reflect] Saved OK`);
      } catch (e) {
        console.error('[reflect] Failed to save reflections:', e.message);
      }
    } else {
      console.log(`[reflect] Skipped save — no entryId`);
    }
    res.json({ opening, blocks });

    // 5. Background: index entry, extract memories, auto-tag
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

        // Auto-tag
        if (entryId) {
          const tags = await autoTag(text);
          if (tags.length) {
            db.prepare('UPDATE entries SET tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(
              JSON.stringify(tags),
              entryId,
              userId
            );
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
  const saved = JSON.parse(row.blocks);
  // Support old format (plain array) and new format ({ opening, blocks })
  if (Array.isArray(saved)) {
    console.log(`[reflect] GET archetypes=${saved.map(b => b.archetype).join(',')}`);
    res.json({ opening: null, blocks: saved });
  } else {
    console.log(`[reflect] GET archetypes=${(saved.blocks || []).map(b => b.archetype).join(',')}`);
    res.json({ opening: saved.opening || null, blocks: saved.blocks || [] });
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
    const polished = await llm.call(systemPrompt, text, { maxTokens });
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
    const title = await llm.call(systemPrompt, plain.slice(0, 2000), { maxTokens: 30 });
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

  return `You are the ${archetype} voice. Speak ONLY as ${archetype} — no other voice, tradition, or register.

${voice || ''}

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
    const raw = await llm.call(systemPrompt, text, { maxTokens: 100 });
    const cleaned = raw.trim().replace(/```(?:json)?|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

module.exports = router;
