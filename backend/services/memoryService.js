/**
 * Memory service — hybrid memory system.
 *
 * Layer 1: Discrete memory items — individual facts about the user stored in
 *          the `memories` table. Auto-extracted after each reflect call, plus
 *          manually added/pinned items. Synthesized into a narrative for prompts.
 *
 * Layer 2: Semantic RAG — entries embedded into Vectra. On reflect, the 3-5
 *          most similar past entries are retrieved and included in the prompt.
 */

const db = require('../database');
const llm = require('./llmService');
const embedding = require('./embeddingService');

// ── Discrete Memory Items ───────────────────────────────────────────────────

function getMemories(userId = 1, limit = 50) {
  return db.prepare(
    'SELECT id, content, pinned, created_at FROM memories WHERE user_id = ? ORDER BY pinned DESC, created_at DESC LIMIT ?'
  ).all(userId, limit);
}

// Legacy — still used by Settings memory panel and old code paths
function getSummary(userId = 1) {
  const row = db.prepare('SELECT summary FROM memory WHERE user_id = ?').get(userId);
  return row ? row.summary : '';
}

/**
 * Extract discrete memory items from a journal entry and store them.
 * Replaces the old updateSummary() — instead of rewriting one blob,
 * we extract 0-6 new facts and insert them individually.
 */
async function extractAndStoreMemories(currentEntry, portrait, userId = 1, entryId = null) {
  const existing = getMemories(userId, 50);
  const existingList = existing.map((m) => `- ${m.content}`).join('\n') || '(none yet)';

  const systemPrompt = `You are a memory curator for a personal journaling app called Liminal.
Extract 0-6 discrete, factual memories from this journal entry. Each memory should be a single clear statement about this person.

Focus on:
- Who they are (work, creative practice, relationships, values)
- Key people in their life and the dynamics
- Recurring patterns, themes, emotional tendencies
- Ongoing life situations, transitions, decisions
- Growth edges, fears, aspirations
- Specific facts worth remembering (places, projects, practices)

Rules:
- Each memory is ONE fact, ONE sentence
- Be specific, not vague — names, details, context
- If a fact is already captured in the existing memories below, do NOT repeat it
- If nothing genuinely new emerges from this entry, return an empty array
- Return ONLY valid JSON: { "memories": ["...", "..."] }`;

  const userMessage = `EXISTING MEMORIES:
${existingList}

NEW JOURNAL ENTRY:
${currentEntry}

${portrait ? `USER PORTRAIT:\n${portrait}` : ''}

Extract any genuinely new facts about this person. Return only the JSON.`;

  try {
    const raw = await llm.call(systemPrompt, userMessage, { maxTokens: 500 });
    let newItems = [];
    try {
      const parsed = JSON.parse(raw.trim());
      newItems = parsed.memories || [];
    } catch {
      const match = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (match) {
        try { newItems = JSON.parse(match[1]).memories || []; } catch {}
      }
    }

    if (newItems.length) {
      const ins = db.prepare('INSERT INTO memories (user_id, content, pinned, source_entry_id) VALUES (?, ?, 0, ?)');
      for (const item of newItems) {
        if (typeof item === 'string' && item.trim()) {
          ins.run(userId, item.trim(), entryId || null);
        }
      }
      console.log(`[memory] Extracted ${newItems.length} new memories from entry ${entryId}`);

      // Invalidate synthesis cache
      invalidateSynthesisCache(userId);
    } else {
      console.log(`[memory] No new memories from entry ${entryId}`);
    }

    return newItems;
  } catch (err) {
    console.error('[memory] Failed to extract memories:', err.message);
    return [];
  }
}

/**
 * Synthesize discrete memory items into a coherent narrative for the LLM.
 * Caches the result in the old `memory.summary` field to avoid re-synthesizing
 * on every request. Invalidated when items change.
 */
async function synthesizeMemory(userId = 1) {
  // Check cache — use the old memory table as cache store
  const cached = db.prepare('SELECT summary, updated_at FROM memory WHERE user_id = ?').get(userId);
  const cacheFlag = db.prepare("SELECT value FROM settings WHERE key = ?").get(`memory_dirty_${userId}`);

  // If cache exists and isn't dirty, return it
  if (cached?.summary && (!cacheFlag || cacheFlag.value !== '1')) {
    return cached.summary;
  }

  const items = getMemories(userId, 50);
  if (!items.length) return '';

  const itemList = items.map((m) => {
    const pin = m.pinned ? ' [pinned]' : '';
    return `- ${m.content}${pin}`;
  }).join('\n');

  const systemPrompt = `You are a memory synthesizer for a personal journaling app called Liminal.
Below is a list of discrete facts about a person. Synthesize them into a concise (~800 token), coherent narrative.

This narrative is injected into every AI reflection so the Mirror always knows the person's full story.

Rules:
- Write in third person ("The user is...", "They...")
- Group related facts naturally — don't just list them
- Prioritise pinned items (user-curated, high importance)
- Be factual, warm, and specific
- Capture the person's full picture: identity, relationships, patterns, growth edges
- Keep under 800 tokens
- Return only the narrative text, nothing else`;

  try {
    const narrative = await llm.call(systemPrompt, `MEMORY ITEMS:\n${itemList}`, { maxTokens: 900 });
    const trimmed = narrative.trim();

    // Cache in old memory table
    const existingRow = db.prepare('SELECT id FROM memory WHERE user_id = ?').get(userId);
    if (existingRow) {
      db.prepare('UPDATE memory SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(trimmed, userId);
    } else {
      db.prepare('INSERT INTO memory (user_id, summary) VALUES (?, ?)').run(userId, trimmed);
    }

    // Clear dirty flag
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '0')").run(`memory_dirty_${userId}`);

    console.log(`[memory] Synthesized ${items.length} items into narrative (${trimmed.split(/\s+/).length} words)`);
    return trimmed;
  } catch (err) {
    console.error('[memory] Synthesis failed, falling back to cached:', err.message);
    return cached?.summary || '';
  }
}

function invalidateSynthesisCache(userId = 1) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(`memory_dirty_${userId}`);
}

/**
 * Build the memory section for system prompts.
 * Uses synthesized narrative (cached when possible).
 */
async function buildMemorySection(userId = 1) {
  const narrative = await synthesizeMemory(userId);
  if (!narrative) return null;
  return `## WHAT I KNOW ABOUT YOU\n${narrative}`;
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
async function buildReflectSystemPrompt(portrait, currentEntryText, currentEntryId = null, userId = 1, username = null) {
  const [memorySection, similarEntries] = await Promise.all([
    buildMemorySection(userId),
    retrieveSimilarEntries(currentEntryText, currentEntryId),
  ]);

  const sections = [];

  // 1. Portrait
  sections.push(buildPortraitSection(portrait));

  // 2. Memory (synthesized narrative from discrete items — includes pinned/manual + auto-extracted)
  if (memorySection) sections.push(memorySection);

  // 3. Notes digest (goals + quotes especially)
  const notesDigest = buildNotesDigest(userId);
  if (notesDigest) sections.push(notesDigest);

  // 4. Relevant past entries
  if (similarEntries.length > 0) {
    const pastContext = similarEntries
      .map((e) => {
        const dateStr = e.date || e.created_at?.split('T')[0] || 'unknown date';
        return `[${dateStr}] ${e.title}\n${e.body_text}`;
      })
      .join('\n\n---\n\n');
    sections.push(`## RELEVANT PAST ENTRIES\nThese past entries are most relevant to what was just written:\n\n${pastContext}`);
  }

  // 5. Mirror instructions (includes slider voice + candor via translateSlidersToVoice)
  sections.push(buildMirrorInstructions(portrait, username));

  // 6. Language instruction
  const s = require('./settingsService');
  const lang = s.get('language') || portrait?.language || 'en';
  if (lang && lang !== 'en') {
    sections.push(`## LANGUAGE\nYou MUST write your entire response in ${getLanguageName(lang)}. All text — opening, block titles, body text, quotes — must be in ${getLanguageName(lang)}.`);
  }

  return sections.join('\n\n');
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

const TAROT_DESCRIPTIONS = {
  'The Fool':           'New beginnings, leaping into the unknown, pure potential',
  'The Magician':       'Will, skill, manifestation, turning intention into action',
  'The High Priestess': 'Intuition, mystery, inner knowing, what lies beneath',
  'The Empress':        'Abundance, nurturing, creativity, connection to nature',
  'The Emperor':        'Structure, authority, stability, building foundations',
  'The Hierophant':     'Tradition, guidance, seeking a teacher or system',
  'The Lovers':         'Choice, values, alignment, deep connection',
  'The Chariot':        'Willpower, direction, moving forward through opposition',
  'Strength':           'Inner courage, patience, taming what is wild within',
  'The Hermit':         'Solitude, inner light, withdrawal to find truth',
  'Wheel of Fortune':   'Change, cycles, turning points, what rises and falls',
  'Justice':            'Truth, cause and effect, accountability, balance',
  'The Hanged Man':     'Surrender, new perspective, pause before the next move',
  'Death':              'Transformation, endings that make way, release',
  'Temperance':         'Integration, patience, the middle path, alchemy',
  'The Devil':          'Chains of your own making, shadow, what binds you',
  'The Tower':          'Sudden upheaval, what must fall, breakthrough through collapse',
  'The Star':           'Hope, healing, trust after darkness, restoration',
  'The Moon':           'Illusion, anxiety, what hides in the subconscious',
  'The Sun':            'Clarity, joy, vitality, things coming into the light',
  'Judgement':          'Awakening, hearing the call, rising to a new version',
  'The World':          'Completion, integration, the end of a cycle, wholeness',
};

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

  // Tarot
  const tarotLines = [];
  if (portrait.soul_card) {
    const cardName = portrait.soul_card.replace(/ [IVXLCDM0]+$/, '');
    const desc = TAROT_DESCRIPTIONS[cardName];
    tarotLines.push(`- Soul Card (Sun Sign): ${portrait.soul_card}${desc ? ' — ' + desc : ''}`);
  }
  if (portrait.life_path_card) {
    const cardName = portrait.life_path_card.replace(/ [IVXLCDM0]+$/, '');
    const desc = TAROT_DESCRIPTIONS[cardName];
    tarotLines.push(`- Life Path Card (Life Path ${portrait.life_path_number || '?'}): ${portrait.life_path_card}${desc ? ' — ' + desc : ''}`);
  }
  if (portrait.working_tarot_card) {
    const desc = TAROT_DESCRIPTIONS[portrait.working_tarot_card];
    tarotLines.push(`- Working Card (current): ${portrait.working_tarot_card}${desc ? ' — ' + desc : ''}`);
  }
  if (tarotLines.length) lines.push(`\nTarot:\n${tarotLines.join('\n')}`);

  // Current chapter
  const currentLines = [];
  if (portrait.season_of_life) currentLines.push(`- Season of life: ${portrait.season_of_life}`);
  if (portrait.current_intention) currentLines.push(`- Intention: ${portrait.current_intention}`);
  if (currentLines.length) lines.push(`\nCurrent chapter:\n${currentLines.join('\n')}`);

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

/**
 * Translate portrait slider values into rich natural-language voice instructions
 * for the aggregate journal reflect prompt.
 */
function translateSlidersToVoice(portrait) {
  const instructions = [];
  const v = (key) => portrait?.[key] ?? 50;

  // rational_spiritual
  const rs = v('slider_rational_spiritual');
  if (rs < 30) {
    instructions.push('Stay grounded and rational — focus on what\'s practical and concrete.');
  } else if (rs > 70) {
    instructions.push('Lean into the spiritual and symbolic — explore the deeper meaning, metaphors, and soul-level significance of events.');
  } else {
    instructions.push('Balance the rational and spiritual — acknowledge both the practical reality and the deeper meaning.');
  }

  // gentle_direct
  const gd = v('slider_gentle_direct');
  if (gd < 30) {
    instructions.push('Be gentle and tender — hold the person carefully, especially around difficult themes.');
  } else if (gd > 70) {
    instructions.push('Be direct and plain-spoken — name things clearly, don\'t soften the truth.');
  } else {
    instructions.push('Be warm but willing to say things plainly when it matters.');
  }

  // reflective_action
  const ra = v('slider_reflective_action');
  if (ra < 30) {
    instructions.push('Stay reflective and contemplative — invite deeper looking, not doing.');
  } else if (ra > 70) {
    instructions.push('Lean toward action and next steps — what can be done, decided, moved on.');
  } else {
    instructions.push('Balance reflection with occasional practical direction.');
  }

  // light_deep
  const ld = v('slider_light_deep');
  if (ld < 30) {
    instructions.push('Keep it light — don\'t overwhelm, touch gently.');
  } else if (ld > 70) {
    instructions.push('Go deep — explore the psychological layers, the shadow, the unconscious patterns.');
  } else {
    instructions.push('Go to a moderate depth — meaningful but not overwhelming.');
  }

  // conversational_poetic
  const cp = v('slider_conversational_poetic');
  if (cp < 30) {
    instructions.push('Write conversationally — like a thoughtful friend speaking directly.');
  } else if (cp > 70) {
    instructions.push('Write with poetic quality — use imagery, metaphor, and lyrical prose.');
  } else {
    instructions.push('Write clearly with occasional moments of poetic language.');
  }

  // encouraging_challenging
  const ec = v('slider_encouraging_challenging');
  if (ec < 30) {
    instructions.push('Lead with encouragement and affirmation.');
  } else if (ec > 70) {
    instructions.push('Be willing to challenge — ask hard questions, name difficult patterns, don\'t just validate.');
  } else {
    instructions.push('Encourage where warranted but also show the other side — both/and not either/or.');
  }

  // candor
  const candor = v('slider_candor');
  if (candor > 65) {
    instructions.push('Be candid — say what you actually see, even if it\'s uncomfortable. Name avoidance. Play devil\'s advocate. Truth over comfort.');
  } else if (candor < 35) {
    instructions.push('Prioritise emotional safety and validation. Meet them where they are.');
  }

  // character influence
  const ci = v('slider_character_influence');
  if (ci > 65) {
    instructions.push('Bring full presence and personality — don\'t be generic or bland.');
  }

  return instructions.join('\n');
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

function buildMirrorInstructions(portrait, username = null) {
  let activeArchetypes = ['Zen', 'Jungian', 'Stoic', 'Direct Friend'];
  try {
    activeArchetypes = JSON.parse(portrait?.active_archetypes || '[]');
  } catch {}

  const voiceInstructions = translateSlidersToVoice(portrait);

  const nameInstruction = username
    ? `The person's name is ${username}. Use it naturally in the opening — like a friend would.`
    : `You don't know their name. Address them warmly but without a name.`;

  return `## MIRROR RESPONSE INSTRUCTIONS

You are responding to a personal journal entry as an integrated, wise voice that draws on multiple wisdom traditions simultaneously. You are not one archetype — you are a blend of: ${activeArchetypes.join(', ')}.

You are not a therapist, not a coach, not an AI. You are a deeply perceptive friend — someone who happens to carry the wisdom of these traditions but speaks like a real person. Warm, honest, sometimes funny, never clinical.

Your voice is shaped by these qualities:
${voiceInstructions}

${nameInstruction}

RESPONSE FORMAT:
Your response must be structured as JSON with this exact shape:
{
  "opening": "A personal, visceral 1-3 sentence opening that addresses the person by name and captures the emotional essence of the whole entry. This should feel like a friend who just read something real — not a summary, but a felt response. e.g. 'Savva… this reads like someone who just walked out of a furnace and is still checking if their eyebrows are intact.' Be real. Be vivid. Match the energy of what they wrote.",
  "blocks": [
    {
      "title": "A Named Theme",
      "body": "Prose reflection...",
      "quote": "Optional short quote or null",
      "archetype": "Auto"
    }
  ]
}

Rules:
- The opening comes BEFORE the themed blocks. It is personal, direct, and captures the whole entry in one visceral moment. It should feel like a friend reacting — not an AI summarising.
- Read the full journal entry and identify the real emotional and psychological themes present.
- Write one named paragraph per theme (4-7 themes typically). Never fewer than 3, rarely more than 8.
- Each paragraph has a short title that names the theme (e.g. "A Softer Nervous System", "The Timing Irony"), NOT the archetype.
- Write each paragraph in your blended voice — draw on whichever wisdom tradition is most relevant to that specific theme naturally, without labelling which one you are using.
- Write in prose paragraphs. No bullet points ever. No lists.
- Bold sparingly — at most 1-2 key phrases per block using **bold**. Not whole sentences.
- After some paragraphs (not all), include a short relevant quote from any wisdom tradition. Never force a quote — use null if nothing fits naturally.
- Write a closing paragraph with a final integrating thought.
- End with one open question for the person to sit with.
- Do not be falsely positive or bypassy — show both sides of every theme.
- Do NOT label which archetype you are drawing from — the blend is invisible.
- Do NOT reference the user's MBTI, astrology, or portrait data explicitly. Let it inform tone only.
- Speak directly to the person (use "you"). Talk like a friend, not an assistant.
- The response should feel like it comes from one coherent, wise, caring presence — not a committee.
- Set archetype to "Auto" on every block.
- Return ONLY the JSON object. No preamble, no explanation outside the JSON.`;
}

// ── Ask / Oracle prompts ──────────────────────────────────────────────────────

async function buildAskSystemPrompt(userId, archetype = 'Direct Friend') {
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(userId);
  const sections = [];

  if (portrait) sections.push(buildPortraitSection(portrait));
  const memSection = await buildMemorySection(userId);
  if (memSection) sections.push(memSection);
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

  const s = require('./settingsService');
  const lang = s.get('language') || portrait?.language || 'en';
  if (lang && lang !== 'en') {
    sections.push(`You MUST respond entirely in ${getLanguageName(lang)}.`);
  }

  return sections.join('\n\n');
}

async function buildOracleSystemPrompt(userId, archetype = 'Zen') {
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(userId);
  const sections = [];

  if (portrait) sections.push(buildPortraitSection(portrait));
  const memSection = await buildMemorySection(userId);
  if (memSection) sections.push(memSection);
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

  const s = require('./settingsService');
  const lang = s.get('language') || portrait?.language || 'en';
  if (lang && lang !== 'en') {
    sections.push(`You MUST respond entirely in ${getLanguageName(lang)}.`);
  }

  return sections.join('\n\n');
}

const LANGUAGE_NAMES = {
  en: 'English', el: 'Greek', es: 'Spanish', fr: 'French', de: 'German',
  pt: 'Portuguese', it: 'Italian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean',
  ru: 'Russian', ar: 'Arabic', tr: 'Turkish', nl: 'Dutch', sv: 'Swedish', pl: 'Polish',
};

function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || code;
}

module.exports = {
  getMemories,
  getSummary,
  extractAndStoreMemories,
  synthesizeMemory,
  invalidateSynthesisCache,
  buildMemorySection,
  retrieveSimilarEntries,
  buildReflectSystemPrompt,
  buildAskSystemPrompt,
  buildOracleSystemPrompt,
  translateSlidersToVoice,
};
