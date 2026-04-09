const express = require('express');
const router = express.Router();
const llm = require('../services/llmService');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Same baseline categories as reflect.js autoTag — keeps the live-suggested
// pills consistent with the post-reflect tags so users don't see two different
// vocabularies for the same content.
const TAG_CATEGORIES = [
  'identity', 'career', 'spirituality', 'relationships', 'self-work',
  'creativity', 'health', 'ideas', 'grief', 'body', 'fear', 'joy',
  'transition', 'work', 'family', 'nature', 'dreams', 'money',
];

// ── POST /api/tags/suggest ──────────────────────────────────────────────────
// Body: { text, existing?: string[] }
// Returns: { tags: string[] }
//
// Live tag suggestions for the editor's tag bar. Called debounced from the
// frontend as the user writes. Returns 2–5 single-word lowercase tag keys.
// `existing` is optional — if provided, suggestions already on the entry are
// filtered out so the bar only shows fresh additions.
router.post('/suggest', async (req, res) => {
  const text = (req.body?.text || '').trim();
  const existing = Array.isArray(req.body?.existing) ? req.body.existing : [];

  // Skip very short content — single sentences rarely have meaningful tags
  // and burning an LLM call on every keystroke is wasteful.
  if (text.length < 80) return res.json({ tags: [] });

  const systemPrompt = `You are a tag generator for a personal journaling app. Given a passage of writing, return the 2-5 most relevant single-word tags that describe its themes.

Prefer these existing categories when they fit: ${TAG_CATEGORIES.join(', ')}

If none of the categories fit well, suggest a new short single-word lowercase tag.

Rules:
- Output ONLY a JSON array of lowercase tag strings, e.g.: ["identity", "career", "transition"]
- Single words only — no phrases, no hyphens unless they belong to a category above
- 2-5 tags maximum
- No explanation, no markdown, no other text`;

  try {
    // Cap input to keep latency low — first ~2000 chars is plenty for tag inference
    const truncated = text.length > 2000 ? text.slice(0, 2000) : text;
    const raw = await llm.call(systemPrompt, truncated, { maxTokens: 80, language: false });
    const cleaned = raw.trim().replace(/```(?:json)?|```/g, '').trim();
    let tags = [];
    try { tags = JSON.parse(cleaned); } catch {}
    if (!Array.isArray(tags)) tags = [];
    // Normalise + filter out anything already on the entry
    const existingSet = new Set(existing.map(t => String(t).toLowerCase()));
    const seen = new Set();
    const out = [];
    for (const t of tags) {
      const clean = String(t || '').trim().toLowerCase();
      if (!clean || clean.length > 24 || existingSet.has(clean) || seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
      if (out.length >= 5) break;
    }
    res.json({ tags: out });
  } catch (err) {
    console.error('[tags/suggest] failed:', err.message);
    res.json({ tags: [] });
  }
});

module.exports = router;
