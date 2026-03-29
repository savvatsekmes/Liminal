const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── GET /api/portrait ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const row = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  if (!row) return res.json({});

  // Parse JSON arrays
  const parsed = {
    ...row,
    archetypes: parseJSON(row.archetypes, []),
    active_archetypes: parseJSON(row.active_archetypes, []),
  };
  res.json(parsed);
});

// ── PUT /api/portrait ────────────────────────────────────────────────────────
router.put('/', (req, res) => {
  const {
    mbti, enneagram, human_design,
    sun_sign, moon_sign, rising_sign,
    birth_date, birth_time, birth_location,
    context_note,
    slider_rational_spiritual,
    slider_gentle_direct,
    slider_reflective_action,
    slider_light_deep,
    slider_conversational_poetic,
    slider_encouraging_challenging,
    slider_character_influence,
    slider_candor,
    archetypes,
    active_archetypes,
    language,
    chinese_zodiac, chinese_element,
    character_description,
    sex, pronouns,
  } = req.body;

  const fields = [];
  const params = [];

  const stringFields = {
    mbti, enneagram, human_design,
    sun_sign, moon_sign, rising_sign,
    birth_date, birth_time, birth_location,
    context_note, language,
    chinese_zodiac, chinese_element,
    character_description,
    sex, pronouns,
  };

  const intFields = {
    slider_rational_spiritual,
    slider_gentle_direct,
    slider_reflective_action,
    slider_light_deep,
    slider_conversational_poetic,
    slider_encouraging_challenging,
    slider_character_influence,
    slider_candor,
  };

  for (const [key, val] of Object.entries(stringFields)) {
    if (val !== undefined) { fields.push(`${key} = ?`); params.push(val); }
  }

  for (const [key, val] of Object.entries(intFields)) {
    if (val !== undefined) {
      const clamped = Math.max(0, Math.min(100, Number(val)));
      fields.push(`${key} = ?`);
      params.push(clamped);
    }
  }

  if (archetypes !== undefined) {
    fields.push('archetypes = ?');
    params.push(JSON.stringify(archetypes));
  }

  if (active_archetypes !== undefined) {
    fields.push('active_archetypes = ?');
    params.push(JSON.stringify(active_archetypes));
  }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.userId);

  db.prepare(`UPDATE portrait SET ${fields.join(', ')} WHERE user_id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  res.json({
    ...updated,
    archetypes: parseJSON(updated.archetypes, []),
    active_archetypes: parseJSON(updated.active_archetypes, []),
  });
});

// ── POST /api/portrait/generate ──────────────────────────────────────────────
// Generate a character portrait description from portrait data using the LLM.
// Saves the result to the DB and returns it.
router.post('/generate', async (req, res) => {
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  if (!portrait) return res.status(404).json({ error: 'Portrait not found' });

  const llm = require('../services/llmService');

  const systemPrompt = `You are a character description writer for a personal journaling app called Liminal.
Your task is to synthesise everything known about a person into a vivid, insightful character portrait — 2 to 3 rich paragraphs.

Write in third person, present tense. Be specific and evocative, not generic. Capture:
- Who this person is at their core — their energy, contradictions, the texture of how they move through the world
- Their relationship with themselves: strengths, patterns, growth edges
- The feel of their inner life: what they value, what pulls at them, how they process experience

Do NOT list their traits mechanically. Weave everything together into prose that reads like a novelist's character sketch — the kind that, when the person reads it, makes them feel seen.
Return only the portrait text. No headers, no preamble.`;

  const lines = ['Here is everything known about this person:'];
  if (portrait.mbti)          lines.push(`MBTI: ${portrait.mbti}`);
  if (portrait.enneagram)     lines.push(`Enneagram: ${portrait.enneagram}`);
  if (portrait.human_design)  lines.push(`Human Design: ${portrait.human_design}`);
  if (portrait.sun_sign)      lines.push(`Astrology: Sun ${portrait.sun_sign}${portrait.moon_sign ? ', Moon ' + portrait.moon_sign : ''}${portrait.rising_sign ? ', Rising ' + portrait.rising_sign : ''}`);
  if (portrait.chinese_zodiac) lines.push(`Chinese zodiac: ${portrait.chinese_element || ''} ${portrait.chinese_zodiac}`.trim());
  if (portrait.birth_date)    lines.push(`Born: ${portrait.birth_date}${portrait.birth_location ? ' in ' + portrait.birth_location : ''}`);
  if (portrait.context_note)  lines.push(`\nCurrent life context:\n${portrait.context_note}`);

  try {
    const active = JSON.parse(portrait.active_archetypes || '[]');
    if (active.length) lines.push(`\nActive reflection lenses: ${active.join(', ')}`);
  } catch {}

  lines.push('\nWrite the character portrait now:');

  try {
    const description = await llm.call(systemPrompt, lines.join('\n'), { maxTokens: 600 });
    const trimmed = description.trim();

    db.prepare('UPDATE portrait SET character_description = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(trimmed, req.userId);

    res.json({ character_description: trimmed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/portrait/astrology ─────────────────────────────────────────────
// Calculate astrological values from birth data (does not save to DB)
router.post('/astrology', async (req, res) => {
  const { birth_date, birth_time, birth_location } = req.body;
  if (!birth_date) return res.status(400).json({ error: 'birth_date required' });

  try {
    const astro = require('../services/astrologyService');
    const result = await astro.calculate({ birth_date, birth_time, birth_location });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseJSON(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

module.exports = router;
