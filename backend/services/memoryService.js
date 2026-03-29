/**
 * Memory service — two-layer memory system.
 *
 * Layer 1: Rolling summary (~800 tokens) — stored in SQLite, injected into
 *          every reflect call. Updated via a second LLM call after each entry.
 *
 * Layer 2: Semantic RAG — entries embedded into Vectra. On reflect, the 3-5
 *          most similar past entries are retrieved and included in the prompt.
 */

const db = require('../database');
const llm = require('./llmService');
const embedding = require('./embeddingService');

// ── Rolling Summary ──────────────────────────────────────────────────────────

function getSummary(userId = 1) {
  const row = db.prepare('SELECT summary FROM memory WHERE user_id = ?').get(userId);
  return row ? row.summary : '';
}

async function updateSummary(currentEntry, portrait, userId = 1) {
  const existing = getSummary(userId);

  const systemPrompt = `You are a memory curator for a personal journaling app called Liminal.
Your job is to maintain a concise (~800 token) rolling summary of what you know about this person.
This summary is injected into every future AI reflection so the AI always knows the user's full story.

The summary should capture:
- Who they are (work, creative practice, physical practice, spiritual orientation)
- Key relationships and their names
- Recurring themes and emotional patterns
- Ongoing life situations and transitions
- Growth edges and recurring struggles
- Their relationship with themselves

Be factual, warm, and specific. Use third person ("The user is...").
Never pad. If nothing new emerges from this entry, return the existing summary unchanged.
Keep the summary under 800 tokens.`;

  const userMessage = `EXISTING SUMMARY:
${existing || '(none yet — this is the first entry)'}

NEW ENTRY:
${currentEntry}

${portrait ? `USER PORTRAIT:\n${portrait}` : ''}

Update the summary to incorporate anything genuinely new from this entry. Return only the updated summary text, nothing else.`;

  try {
    const updated = await llm.call(systemPrompt, userMessage, { maxTokens: 900 });
    const trimmed = updated.trim();

    const existing_row = db.prepare('SELECT id FROM memory WHERE user_id = ?').get(userId);
    if (existing_row) {
      db.prepare('UPDATE memory SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(trimmed, userId);
    } else {
      db.prepare('INSERT INTO memory (user_id, summary) VALUES (?, ?)').run(userId, trimmed);
    }

    return trimmed;
  } catch (err) {
    console.error('[memory] Failed to update rolling summary:', err.message);
    return existing;
  }
}

// ── Semantic Retrieval ────────────────────────────────────────────────────────

/**
 * Retrieve 3-5 past entries most similar to the current entry body.
 * Returns full entry rows with their text.
 */
async function retrieveSimilarEntries(currentEntryText, currentEntryId, k = 5) {
  try {
    const results = await embedding.querySimilar(currentEntryText, k, currentEntryId ? [currentEntryId] : []);

    if (!results.length) return [];

    const placeholders = results.map(() => '?').join(',');
    const ids = results.map((r) => r.entryId);
    const rows = db
      .prepare(`SELECT id, title, body_text, date, created_at FROM entries WHERE id IN (${placeholders})`)
      .all(...ids);

    // Re-attach scores and sort by similarity
    const scoreMap = Object.fromEntries(results.map((r) => [r.entryId, r.score]));
    return rows.sort((a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0));
  } catch (err) {
    console.error('[memory] Semantic retrieval failed:', err.message);
    return [];
  }
}

// ── System Prompt Assembly ────────────────────────────────────────────────────

/**
 * Build the full system prompt for a reflect call.
 * @param {object} portrait  Row from the portrait table
 * @param {string} currentEntryText  Plain text of the current entry
 * @param {number|null} currentEntryId
 * @param {number} userId
 */
async function buildReflectSystemPrompt(portrait, currentEntryText, currentEntryId = null, userId = 1) {
  const [summary, similarEntries] = await Promise.all([
    Promise.resolve(getSummary(userId)),
    retrieveSimilarEntries(currentEntryText, currentEntryId),
  ]);

  const sections = [];

  // 1. Portrait
  sections.push(buildPortraitSection(portrait));

  // 2. Life context items (user-curated, high priority)
  const lifeContextDigest = buildLifeContextSection(userId);
  if (lifeContextDigest) sections.push(lifeContextDigest);

  // 3. Rolling summary
  if (summary) {
    sections.push(`## WHAT I KNOW ABOUT YOU\n${summary}`);
  }

  // 4. Notes digest (goals + quotes especially)
  const notesDigest = buildNotesDigest(userId);
  if (notesDigest) sections.push(notesDigest);

  // 5. Relevant past entries
  if (similarEntries.length > 0) {
    const pastContext = similarEntries
      .map((e) => {
        const dateStr = e.date || e.created_at?.split('T')[0] || 'unknown date';
        return `[${dateStr}] ${e.title}\n${e.body_text}`;
      })
      .join('\n\n---\n\n');
    sections.push(`## RELEVANT PAST ENTRIES\nThese past entries are most relevant to what was just written:\n\n${pastContext}`);
  }

  // 6. Candor instruction (injected before mirror instructions so it shapes the whole response)
  const candor = buildCandorInstruction(portrait);
  if (candor) sections.push(candor);

  // 7. Mirror instructions
  sections.push(buildMirrorInstructions(portrait));

  return sections.join('\n\n');
}

function buildLifeContextSection(userId = 1) {
  try {
    const db = require('../database');
    const rows = db.prepare('SELECT text, created_at FROM life_context WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
    if (!rows.length) return null;

    const items = rows.map((r) => {
      const date = r.created_at ? r.created_at.split('T')[0] : '';
      return `- "${r.text}"${date ? ` (added ${date})` : ''}`;
    }).join('\n');

    return `## CURRENT LIFE CONTEXT (user-curated, high priority)\n${items}`;
  } catch {
    return null;
  }
}

function buildNotesDigest(userId = 1) {
  try {
    const db = require('../database');
    const goals = db.prepare("SELECT body, target_date FROM notes WHERE type = 'goal' AND user_id = ? ORDER BY created_at DESC LIMIT 10").all(userId);
    const quotes = db.prepare("SELECT body, attribution FROM notes WHERE type = 'quote' AND user_id = ? ORDER BY created_at DESC LIMIT 5").all(userId);

    if (!goals.length && !quotes.length) return null;

    const lines = [];

    if (goals.length) {
      lines.push('Goals:');
      goals.forEach((g) => {
        lines.push(`- ${g.body}${g.target_date ? ` (by ${g.target_date})` : ''}`);
      });
    }

    if (quotes.length) {
      lines.push('Meaningful quotes:');
      quotes.forEach((q) => {
        lines.push(`- "${q.body}"${q.attribution ? ` — ${q.attribution}` : ''}`);
      });
    }

    return `## NOTES & INTENTIONS\n${lines.join('\n')}`;
  } catch {
    return null;
  }
}

function buildPortraitSection(portrait) {
  if (!portrait) return '';

  const lines = ['## YOUR PORTRAIT'];

  if (portrait.mbti) lines.push(`MBTI: ${portrait.mbti}`);
  if (portrait.enneagram) lines.push(`Enneagram: ${portrait.enneagram}`);
  if (portrait.human_design) lines.push(`Human Design: ${portrait.human_design}`);
  if (portrait.sun_sign || portrait.moon_sign || portrait.rising_sign) {
    lines.push(`Astrology: Sun ${portrait.sun_sign || '?'}, Moon ${portrait.moon_sign || '?'}, Rising ${portrait.rising_sign || '?'}`);
  }
  if (portrait.chinese_zodiac) {
    const czLine = portrait.chinese_element
      ? `Chinese zodiac: ${portrait.chinese_element} ${portrait.chinese_zodiac}`
      : `Chinese zodiac: ${portrait.chinese_zodiac}`;
    lines.push(czLine);
  }
  if (portrait.birth_date) lines.push(`Birth: ${portrait.birth_date}${portrait.birth_time ? ' ' + portrait.birth_time : ''}${portrait.birth_location ? ', ' + portrait.birth_location : ''}`);
  if (portrait.context_note) lines.push(`\nCurrent context:\n${portrait.context_note}`);

  // Character portrait — scaled by influence slider
  const influence = portrait.slider_character_influence ?? 50;
  if (portrait.character_description && influence > 10) {
    const emphasis = influence > 65
      ? '\n(High weight — let this character portrait strongly colour your tone and reflections.)'
      : influence < 35
      ? '\n(Low weight — use this as light background context only.)'
      : '';
    lines.push(`\nCHARACTER PORTRAIT:\n${portrait.character_description}${emphasis}`);
  }

  // Sliders
  const sliders = buildSliderDescription(portrait);
  if (sliders) lines.push(`\nResponse style:\n${sliders}`);

  // Active archetypes
  try {
    const active = JSON.parse(portrait.active_archetypes || '[]');
    if (active.length) lines.push(`\nActive lenses: ${active.join(', ')}`);
  } catch {}

  return lines.join('\n');
}

function buildSliderDescription(portrait) {
  const axes = [
    [portrait.slider_rational_spiritual, 'Rational', 'Spiritual'],
    [portrait.slider_gentle_direct, 'Gentle', 'Direct'],
    [portrait.slider_reflective_action, 'Reflective', 'Action-oriented'],
    [portrait.slider_light_deep, 'Light touch', 'Deep dive'],
    [portrait.slider_conversational_poetic, 'Conversational', 'Poetic'],
    [portrait.slider_encouraging_challenging, 'Encouraging', 'Challenging'],
  ];

  const lines = axes
    .map(([val, low, high]) => {
      const v = val ?? 50;
      if (v < 35) return `Lean ${low}`;
      if (v > 65) return `Lean ${high}`;
      return null;
    })
    .filter(Boolean);

  return lines.join(', ');
}

function buildCandorInstruction(portrait) {
  const v = portrait?.slider_candor ?? 50;
  if (v > 65) {
    return `## CANDOR MODE: HIGH
The user has explicitly asked for truth over comfort. This is their most important setting.
- Do NOT simply validate. Actively look for where they may be wrong, in denial, or avoiding something.
- Name the uncomfortable thing directly. Be the voice they are not giving themselves.
- Ask the question they are not asking. Surface the pattern they may not want to see.
- Devil's advocate is not cruelty — it is respect. Treat them as capable of handling truth.
- Challenge is the gift. Comfort is the last resort, not the first.`;
  }
  if (v < 35) {
    return `## CANDOR MODE: LOW
The user needs emotional support right now. Prioritise warmth and validation over challenge.
- Meet them where they are. Don't push or reframe unless they explicitly ask.
- Comfort first.`;
  }
  return null;
}

function buildMirrorInstructions(portrait) {
  let activeArchetypes = ['Zen', 'Jungian', 'Stoic', 'Direct Friend'];
  try {
    activeArchetypes = JSON.parse(portrait?.active_archetypes || '[]');
  } catch {}

  return `## MIRROR RESPONSE INSTRUCTIONS

You are Liminal's Mirror — an AI reflection system that responds to journal entries.

Your response must be structured as JSON with this exact shape:
{
  "blocks": [
    {
      "title": "A Named Theme",
      "body": "Prose reflection...",
      "quote": "Optional short quote or null",
      "archetype": "Name of the lens used"
    }
  ]
}

Rules:
- Each block is a named reflection from a different lens: ${activeArchetypes.join(', ')}
- Write in prose paragraphs. No bullet points ever. No lists.
- Bold sparingly — at most 1-2 key phrases per block using **bold**. Not whole sentences.
- Titles name the theme, not the voice (e.g. "A Softer Nervous System", not "Zen Response")
- Be warm and direct. Show both sides of what the person wrote. Do not just validate.
- Challenge gently when the entry calls for it. Offer perspective shifts.
- Quote can be a short line from a philosopher, poet, tradition — or null if nothing fits naturally.
- Do NOT reference the user's MBTI, astrology, or portrait data explicitly. Let it inform tone only.
- Speak directly to the person (use "you").
- Return ONLY the JSON object. No preamble, no explanation outside the JSON.`;
}

// ── Ask / Oracle prompts ──────────────────────────────────────────────────────

async function buildAskSystemPrompt(userId, archetype = 'Direct Friend') {
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(userId);
  const summary = getSummary(userId);
  const sections = [];

  if (portrait) sections.push(buildPortraitSection(portrait));
  const lifeCtx = buildLifeContextSection(userId);
  if (lifeCtx) sections.push(lifeCtx);
  if (summary) sections.push(`## WHAT I KNOW ABOUT YOU\n${summary}`);
  const notesDigest = buildNotesDigest(userId);
  if (notesDigest) sections.push(notesDigest);

  const candorAsk = buildCandorInstruction(portrait);
  if (candorAsk) sections.push(candorAsk);

  sections.push(
    `You are ${archetype}. This person has asked you a direct question. ` +
    `Draw on everything you know about them. Answer warmly, personally, and directly ` +
    `in 2-4 prose paragraphs. No lists, no headers, no bullet points. ` +
    `Speak directly to them using "you". Do not restate the question.`
  );

  return sections.join('\n\n');
}

function buildOracleSystemPrompt(userId, archetype = 'Zen') {
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(userId);
  const summary = getSummary(userId);
  const sections = [];

  if (portrait) sections.push(buildPortraitSection(portrait));
  const lifeCtx = buildLifeContextSection(userId);
  if (lifeCtx) sections.push(lifeCtx);
  if (summary) sections.push(`## WHAT I KNOW ABOUT YOU\n${summary}`);
  const notesDigest = buildNotesDigest(userId);
  if (notesDigest) sections.push(notesDigest);

  const candorOracle = buildCandorInstruction(portrait);
  if (candorOracle) sections.push(candorOracle);

  sections.push(
    `You are ${archetype}. You are in an ongoing conversation with this person. ` +
    `You know them deeply through their journal — their patterns, struggles, growth, and what they're moving toward. ` +
    `Respond as ${archetype} would: in their voice, their wisdom tradition, their way of seeing. ` +
    `Prose only — no bullet points, no lists, no headers. Be warm, direct, and personally resonant. ` +
    `Speak to them as "you". Stay in character throughout.`
  );

  return sections.join('\n\n');
}

module.exports = {
  getSummary,
  updateSummary,
  retrieveSimilarEntries,
  buildReflectSystemPrompt,
  buildAskSystemPrompt,
  buildOracleSystemPrompt,
};
