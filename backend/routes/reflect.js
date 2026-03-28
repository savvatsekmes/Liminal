const express = require('express');
const router = express.Router();
const db = require('../database');
const llm = require('../services/llmService');
const memory = require('../services/memoryService');
const { indexEntry } = require('../services/embeddingService');
const { requireAuth } = require('../middleware/auth');
const { buildYoutubeContext } = require('./youtube');

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
    const systemPrompt = await memory.buildReflectSystemPrompt(portrait, text, entryId || null, req.userId);

    // 2. LLM call
    const ytContext = buildYoutubeContext(req.userId, entryBody || '');
    const userMessage = `Here is today's journal entry:\n\n${text}`
      + (ytContext ? `\n\n---\nVIDEOS EMBEDDED IN THIS ENTRY:\n${ytContext}` : '');
    const rawResponse = await llm.call(systemPrompt, userMessage, { maxTokens: 2500 });

    // 3. Parse Mirror blocks from JSON response
    let blocks = [];
    try {
      const parsed = JSON.parse(rawResponse.trim());
      blocks = parsed.blocks || [];
    } catch {
      // LLM wrapped JSON in markdown — strip it
      const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          blocks = parsed.blocks || [];
        } catch {}
      }
      // Final fallback: treat the whole response as a single prose block
      if (!blocks.length) {
        blocks = [{ title: 'Reflection', body: rawResponse, quote: null, archetype: 'Mirror' }];
      }
    }

    // 4. Save blocks and return response
    console.log(`[reflect] Saving ${blocks.length} blocks for entryId=${entryId}`);
    if (entryId) {
      try {
        db.prepare(
          `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
        ).run(entryId, req.userId, JSON.stringify(blocks));
        console.log(`[reflect] Saved OK`);
      } catch (e) {
        console.error('[reflect] Failed to save reflections:', e.message);
      }
    } else {
      console.log(`[reflect] Skipped save — no entryId`);
    }
    res.json({ blocks });

    // 5. Background: index entry, update rolling summary, auto-tag
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

        // Update rolling summary
        await memory.updateSummary(text, buildPortraitString(portrait), userId);

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
  res.json({ blocks: row ? JSON.parse(row.blocks) : [] });
});

// ── POST /api/reflect/block ──────────────────────────────────────────────────
// Regenerate a single Mirror block with an optional archetype override.
// Body: { entryText, archetype }
router.post('/block', async (req, res) => {
  const { entryText, archetype } = req.body;
  if (!entryText) return res.status(400).json({ error: 'entryText is required' });

  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  const summary = memory.getSummary(req.userId);

  const systemPrompt = `You are the ${archetype || 'Mirror'} voice in Liminal's reflection system.
${summary ? `Context about this person:\n${summary}\n` : ''}

Respond to the journal entry below as the ${archetype || 'Mirror'} archetype — one block only.

Return JSON with this shape:
{
  "title": "A Named Theme",
  "body": "Prose reflection...",
  "quote": "Optional quote or null",
  "archetype": "${archetype || 'Mirror'}"
}

Rules: prose only, no bullets, bold sparingly (1-2 phrases max), warm and direct, show both sides.
Return ONLY the JSON object.`;

  try {
    const raw = await llm.call(systemPrompt, `Journal entry:\n\n${entryText}`, { maxTokens: 600 });
    let block = {};
    try {
      block = JSON.parse(raw.trim());
    } catch {
      const m = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (m) block = JSON.parse(m[1]);
      else block = { title: 'Reflection', body: raw, quote: null, archetype: archetype || 'Mirror' };
    }
    res.json(block);
  } catch (err) {
    console.error('[reflect/block] Error:', err.message);
    res.status(500).json({ error: 'Block regeneration failed.' });
  }
});

// ── POST /api/reflect/polish ─────────────────────────────────────────────────
// Polish a single paragraph.
// Body: { paragraph }
// Returns: { original, polished }
router.post('/polish', async (req, res) => {
  const { paragraph } = req.body;
  if (!paragraph) return res.status(400).json({ error: 'paragraph is required' });

  const systemPrompt = `You are a writing editor. Your job is to polish a paragraph from a personal journal entry.

Rules:
- Preserve the writer's voice, meaning, and tone exactly
- Only improve clarity, coherence, and flow
- Do not add new ideas, remove meaning, or change the emotional register
- Keep approximately the same length
- Return only the polished paragraph text, nothing else`;

  try {
    const polished = await llm.call(systemPrompt, paragraph, { maxTokens: 500 });
    res.json({ original: paragraph, polished: polished.trim() });
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
  if (portrait.context_note) parts.push(`Context: ${portrait.context_note}`);
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
