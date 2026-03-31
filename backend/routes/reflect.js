const express = require('express');
const router = express.Router();
const db = require('../database');
const llm = require('../services/llmService');
const memory = require('../services/memoryService');
const { indexEntry } = require('../services/embeddingService');
const { requireAuth } = require('../middleware/auth');
const { buildYoutubeContext } = require('./youtube');
const { buildImageContext } = require('./images');

router.use(requireAuth);

// ── POST /api/reflect ────────────────────────────────────────────────────────
// Body: { entryId, entryBody, entryText }
// Returns: { blocks: [{title, body, quote, archetype}] }
router.post('/', async (req, res) => {
  const { entryId, entryBody, entryText } = req.body;
  console.log(`[reflect] POST entryId=${entryId} userId=${req.userId} textLen=${(entryText||entryBody||'').length}`);

  if (!entryText && !entryBody) {
    return res.status(400).json({ error: 'entryText is required' });
  }

  const text = entryText || entryBody;

  // Load portrait
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);

  try {
    // 1. Embed current entry and kick off retrieval + system prompt assembly
    const preferredName = portrait?.preferred_name?.trim() || null;
    const systemPrompt = await memory.buildReflectSystemPrompt(portrait, text, entryId || null, req.userId, preferredName);

    // 2. LLM call — read HTML body from DB to avoid sending huge base64 over HTTP
    const entryRow = entryId ? db.prepare('SELECT body FROM entries WHERE id = ? AND user_id = ?').get(entryId, req.userId) : null;
    const htmlBody = entryRow?.body || entryBody || '';
    const ytContext = buildYoutubeContext(req.userId, htmlBody);
    const imgContext = buildImageContext(req.userId, htmlBody);
    const userMessage = `Here is today's journal entry:\n\n${text}`
      + (ytContext ? `\n\n---\nVIDEOS EMBEDDED IN THIS ENTRY:\n${ytContext}` : '')
      + (imgContext ? `\n\n---\nIMAGES IN THIS ENTRY:\n${imgContext}` : '');
    const rawResponse = await llm.call(systemPrompt, userMessage, { maxTokens: 2500 });

    // 3. Parse Mirror blocks from JSON response
    let blocks = [];
    let opening = null;
    try {
      const parsed = JSON.parse(rawResponse.trim());
      blocks = parsed.blocks || [];
      opening = parsed.opening || null;
    } catch {
      // LLM wrapped JSON in markdown — strip it
      const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          blocks = parsed.blocks || [];
          opening = parsed.opening || null;
        } catch {}
      }
      // Final fallback: treat the whole response as a single prose block
      if (!blocks.length) {
        blocks = [{ title: 'Reflection', body: rawResponse, quote: null, archetype: 'Auto' }];
      }
    }

    // 4. Save blocks (with opening) and return response
    const savedData = { opening, blocks };
    console.log(`[reflect] Saving ${blocks.length} blocks for entryId=${entryId}`);
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
    res.json({ opening: null, blocks: saved });
  } else {
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
    // Single archetype voice — check for custom archetype prompt
    let customContext = '';
    try {
      const customs = JSON.parse(portrait?.custom_archetypes || '[]');
      const match = customs.find(c => c.name === archetype);
      if (match?.prompt) customContext = `\nCharacter context: ${match.prompt}\n`;
    } catch {}

    systemPrompt = `You are the ${archetype} voice in Liminal's reflection system.${customContext}
${summary ? `Context about this person:\n${summary}\n` : ''}

Respond to the journal entry below as the ${archetype} archetype — one block only, focused on the theme: "${blockTitle || 'this entry'}".

Return JSON with this shape:
{
  "title": "A Named Theme",
  "body": "Prose reflection...",
  "quote": "Optional quote or null",
  "archetype": "${archetype}"
}

Rules: prose only, no bullets, bold sparingly (1-2 phrases max), warm and direct, show both sides.
Return ONLY the JSON object.`;
  }

  try {
    const raw = await llm.call(systemPrompt, `Journal entry:\n\n${entryText}`, { maxTokens: 600 });
    let block = {};
    try {
      block = JSON.parse(raw.trim());
    } catch {
      const m = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (m) block = JSON.parse(m[1]);
      else block = { title: blockTitle || 'Reflection', body: raw, quote: null, archetype: isAuto ? 'Auto' : archetype };
    }
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
