const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const llm = require('../services/llmService');
const db = require('../database');
const tarotDeck = require('../data/tarotDeck');
const oracleDeck = require('../data/oracleDeck');
const spreads = require('../data/spreads');

router.use(requireAuth);

const LANGUAGE_NAMES = {
  en: 'English', el: 'Greek', es: 'Spanish', fr: 'French', de: 'German',
  pt: 'Portuguese', it: 'Italian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean',
  nl: 'Dutch', sv: 'Swedish', pl: 'Polish', tr: 'Turkish', ru: 'Russian', ar: 'Arabic',
};
function getLanguageName(code) { return LANGUAGE_NAMES[code] || code; }

// Visible threads = canonical (always shown) + novel/custom with 3+ beads.
// This mirrors the ThreadsPage visibility rule and gives the card prompt a
// high-signal summary of what the user's life is currently about — much
// cheaper and cleaner than re-deriving it from recent-entry excerpts.
function getThreadContext(userId) {
  const { safeDecrypt } = require('../services/rowCrypto');
  const rows = db.prepare(`
    SELECT t.name, t.description, t.kind, t.status,
           COUNT(n.id) AS node_count
      FROM threads t
      LEFT JOIN thread_nodes n ON n.thread_id = t.id
     WHERE t.user_id = ?
     GROUP BY t.id
     HAVING t.kind = 'canonical' OR node_count >= 3
     ORDER BY (t.status = 'active') DESC, t.updated_at DESC
  `).all(userId);
  if (!rows.length) return '';
  return rows
    .map(t => ({ ...t, name: safeDecrypt(userId, t.name), description: safeDecrypt(userId, t.description) }))
    .map(t => `- ${t.name}${t.status === 'dormant' ? ' (dormant)' : ''}${t.description ? ' — ' + t.description : ''}`)
    .join('\n');
}

// Per-deck back image. Each deck folder ships its own back so the flip
// animation matches the deck the user is pulling from.
const DECK_BACKS = {
  tarot:  '/cards/Tarot_Deck/card-back_tarot.png',
  oracle: '/cards/Oracle_Deck/card-back_oracle.png',
};

// ── GET /api/cards/decks — return deck + spread data to frontend ─────────────
router.get('/decks', (req, res) => {
  // Add image paths to tarot cards
  const tarotWithImages = tarotDeck.map(card => {
    const img = card.suit
      ? `/cards/Tarot_Deck/${card.suit}_${card.rank}.png`
      : `/cards/Tarot_Deck/major_${card.id}.png`;
    return { ...card, image: img };
  });
  // Oracle cards
  const oracleWithImages = oracleDeck.map(card => ({
    ...card,
    image: `/cards/Oracle_Deck/oracle_${card.id}.png`,
  }));
  res.json({ tarot: tarotWithImages, oracle: oracleWithImages, spreads, backs: DECK_BACKS });
});

// ── GET /api/cards/daily — daily card (cached per day) ──────────────────────
router.get('/daily', async (req, res) => {
  // Mangle the date key with the current language so a language switch
  // invalidates the cache and the next call regenerates the reading in the
  // new language. The `date` column isn't queried elsewhere so suffixing is safe.
  const lang = require('../services/settingsService').get('language') || 'en';
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dateKey = `${today}:${lang}`;

  // Check cache (skip with ?refresh=1)
  if (!req.query.refresh) {
    const cached = db.prepare(
      'SELECT card_data FROM daily_cards WHERE user_id = ? AND date = ?'
    ).get(req.userId, dateKey);
    if (cached) {
      return res.json(JSON.parse(cached.card_data));
    }
  }

  // Pick a random deck (tarot or oracle)
  const deck = Math.random() < 0.5 ? 'tarot' : 'oracle';
  const deckCards = deck === 'tarot' ? tarotDeck : oracleDeck;
  const idx = Math.floor(Math.random() * deckCards.length);
  const raw = deckCards[idx];
  const reversed = deck === 'tarot' ? Math.random() < 0.3 : false;

  // Build image path
  let image = null;
  if (deck === 'tarot') {
    image = raw.suit
      ? `/cards/Tarot_Deck/${raw.suit}_${raw.rank}.png`
      : `/cards/Tarot_Deck/major_${raw.id}.png`;
  } else if (deck === 'oracle') {
    image = `/cards/Oracle_Deck/oracle_${raw.id}.png`;
  }

  const card = {
    deck,
    id: raw.id,
    name: raw.name,
    image,
    reversed,
    meaning: reversed ? (raw.reversed || raw.meaning || '') : (raw.upright || raw.meaning || ''),
  };

  // Generate a personalized daily reading via LLM
  try {
    const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
    const displayName = require('../services/settingsService').getForUser('display_name', req.userId);
    let context = '';
    if (portrait) {
      if (displayName) context += `Name: ${displayName}. `;
      // Spell out gender agreement explicitly — "Pronouns: he. Sex: Male." alone
      // isn't strong enough signal for gendered languages like Greek, Spanish,
      // French etc., where the LLM will otherwise drift to feminine or neuter
      // adjective/verb endings.
      const sex = (portrait.sex || '').toLowerCase();
      const pron = (portrait.pronouns || '').toLowerCase();
      const isMasc = sex.startsWith('m') || /\bhe\b|him|his/.test(pron);
      const isFem  = sex.startsWith('f') || /\bshe\b|her/.test(pron);
      if (isMasc) context += 'Gender: male (he/him) — use MASCULINE grammatical forms (adjective, participle, verb endings) when writing in gendered languages. ';
      else if (isFem) context += 'Gender: female (she/her) — use FEMININE grammatical forms (adjective, participle, verb endings) when writing in gendered languages. ';
      else {
        if (portrait.pronouns) context += `Pronouns: ${portrait.pronouns}. `;
        if (portrait.sex) context += `Sex: ${portrait.sex}. `;
      }
      if (portrait.mbti) context += `MBTI: ${portrait.mbti}. `;
      if (portrait.current_intention) context += `Current intention: ${portrait.current_intention}. `;
      if (portrait.season_of_life) context += `Season of life: ${portrait.season_of_life}. `;
    }

    // Recent journal entries for personal context
    const recentEntries = db.prepare(
      "SELECT title, body_text FROM entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 3"
    ).all(req.userId);
    const journalContext = recentEntries
      .map(e => `${e.title || 'Untitled'}: ${(e.body_text || '').slice(0, 150)}`)
      .join('\n');

    const threadContext = getThreadContext(req.userId);

    const systemPrompt = 'You are a warm, intuitive oracle reader. You give personalised daily card readings that connect the card\'s energy to the person\'s life. Do NOT repeat or paraphrase the card\'s textbook meaning — instead, weave it into specific, actionable guidance for their day. Be poetic but grounded. No greeting or sign-off. Plain text only, 2-3 short sentences (~50-70 words).';
    const languageLine = (lang && lang !== 'en')
      ? `\n\nLANGUAGE: You MUST write the entire reading in ${getLanguageName(lang)}. Honour the gender specified above when choosing adjective/verb endings.`
      : '';
    const userMessage = `Card: "${card.name}"${reversed ? ' (reversed)' : ''}. Meaning: "${card.meaning}".

${context ? `About the person: ${context}` : ''}
${threadContext ? `Active life threads (what they're currently navigating):\n${threadContext}` : ''}
${journalContext ? `Recent journal entries:\n${journalContext}` : ''}

Write a personalised daily reading for this person based on this card. Focus on what this card means for their day ahead — don't just restate the meaning.${languageLine}`;
    const insight = await llm.call(systemPrompt, userMessage, { maxTokens: 160 });
    card.reading = insight.trim();
  } catch (err) {
    console.error('[cards/daily] LLM reading failed:', err.message);
    card.reading = '';
  }

  // Cache for today
  db.prepare(
    'INSERT OR REPLACE INTO daily_cards (user_id, date, deck, card_data) VALUES (?, ?, ?, ?)'
  ).run(req.userId, dateKey, deck, JSON.stringify(card));

  res.json(card);
});

// ── POST /api/cards/reading — generate LLM reading ──────────────────────────
router.post('/reading', async (req, res) => {
  const { deck, spread, cards, entryText, question } = req.body;
  if (!deck || !spread || !cards?.length) {
    return res.status(400).json({ error: 'deck, spread, and cards are required' });
  }
  const userQuestion = typeof question === 'string' ? question.trim().slice(0, 500) : '';

  // Load portrait for personalisation
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  const displayName = require('../services/settingsService').getForUser('display_name', req.userId);

  // Build portrait context
  let portraitContext = '';
  if (portrait) {
    const lines = [];
    if (displayName) lines.push(`Name: ${displayName}`);
    if (portrait.mbti) lines.push(`MBTI: ${portrait.mbti}`);
    if (portrait.enneagram) lines.push(`Enneagram: ${portrait.enneagram}`);
    if (portrait.sun_sign) lines.push(`Sun: ${portrait.sun_sign}`);
    if (portrait.moon_sign) lines.push(`Moon: ${portrait.moon_sign}`);
    if (portrait.rising_sign) lines.push(`Rising: ${portrait.rising_sign}`);
    if (portrait.soul_card) lines.push(`Soul Card: ${portrait.soul_card}`);
    if (portrait.life_path_card) lines.push(`Life Path Card: ${portrait.life_path_card}`);
    if (portrait.life_path_number) lines.push(`Life Path Number: ${portrait.life_path_number}`);
    if (portrait.working_tarot_card) lines.push(`Currently working with: ${portrait.working_tarot_card}`);
    if (portrait.character_description) lines.push(`\nCharacter portrait:\n${portrait.character_description}`);
    if (lines.length) portraitContext = `\n\n## ABOUT THIS PERSON\n${lines.join('\n')}`;
  }

  // Threads + memory summary — give the reader a real sense of what this
  // person is currently navigating, not just their static portrait.
  const threadContext = getThreadContext(req.userId);
  let memorySummary = '';
  try {
    const memoryService = require('../services/memoryService');
    memorySummary = await memoryService.synthesizeMemory(req.userId) || '';
  } catch {}

  // Format the pulled cards
  const cardLines = cards.map((c, i) => {
    const pos = c.position ? `[${c.position}]` : '';
    const rev = c.reversed ? ' (Reversed)' : '';
    const meaning = c.reversed ? c.reversedMeaning : c.uprightMeaning;
    return `${i + 1}. ${pos} ${c.name}${rev}${meaning ? ' — ' + meaning : ''}`;
  }).join('\n');

  const deckLabel = deck === 'tarot' ? 'Tarot' : 'Liminal Oracle';
  const spreadObj = spreads.find(s => s.id === spread);
  const spreadLabel = spreadObj ? spread.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : spread;

  const systemPrompt = `You are a skilled ${deckLabel} reader within a personal journaling app called Liminal.
You provide thoughtful, deeply personal readings that honour the cards and the person sitting before you.
${portraitContext}
${memorySummary ? `\n\n## WHAT YOU KNOW ABOUT THEM\n${memorySummary}` : ''}
${threadContext ? `\n\n## ACTIVE LIFE THREADS (what they're currently navigating)\n${threadContext}` : ''}

${userQuestion ? `The user came to this reading with a specific question. Anchor your interpretation to it — the cards are answering THIS question, not just speaking abstractly:\n"${userQuestion}"\n\n` : ''}The user has pulled the following cards in a "${spreadLabel}" spread:

${cardLines}

${entryText ? `Their current journal entry provides context:\n"${entryText.slice(0, 2000)}"` : 'No journal entry context was provided.'}

Provide a reading that:
- ${userQuestion ? "Speaks directly to their question, using each card as part of the answer" : 'Addresses each card in its position with genuine insight'}
- Weaves the cards together into a cohesive narrative
- ${entryText ? 'Connects the cards to themes in their journal entry' : 'Speaks to universal human themes the cards reveal'}
- ${deck === 'tarot' ? 'For reversed cards, reads them as shadow aspects, blocks, internalised energy, or invitations to look deeper' : 'Reads each oracle card as a direct message or invitation'}
- Speaks directly to the person as "you"
- Uses contemplative, warm prose — not bullet points
- Keeps a balance between honesty and compassion
- Does NOT use filler phrases like "let us explore" or "it is interesting to note"

Format as clean HTML:
- Use <p> for paragraphs
- Use <em> when mentioning card names
- Do NOT include a title or heading — just the reading
- Keep it under 500 words`;

  try {
    console.log('[cards/reading] Generating reading for', cards.length, 'cards, deck:', deck, 'spread:', spread);
    const reading = await llm.call(systemPrompt, `Read these ${deckLabel} cards for me.`, { maxTokens: 2000 });
    res.json({ reading: reading.trim() });
  } catch (err) {
    console.error('[cards/reading] Error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to generate reading: ' + err.message });
  }
});

// ── POST /api/cards/pull — LLM-guided card selection ────────────────────────
// Blends intuition (LLM context) with randomness for card pulls
router.post('/pull', async (req, res) => {
  const { deck, spread, count, excludeIds, question } = req.body;
  if (!deck || !spread) {
    return res.status(400).json({ error: 'deck and spread are required' });
  }
  const userQuestion = typeof question === 'string' ? question.trim().slice(0, 500) : '';

  const spreadObj = spreads.find(s => s.id === spread);
  if (!spreadObj) return res.status(400).json({ error: 'Unknown spread' });

  const fullDeck = deck === 'tarot' ? tarotDeck : oracleDeck;
  // Filter out cards already pulled in this session (frontend sends ids on
  // "Pull another card" so the same card can't appear twice in a Free Pull).
  const excludeSet = new Set(Array.isArray(excludeIds) ? excludeIds.filter(n => Number.isFinite(n)) : []);
  const deckCards = excludeSet.size ? fullDeck.filter(c => !excludeSet.has(c.id)) : fullDeck;
  const numCards = Math.min(count || spreadObj.cardCount || 1, deckCards.length);
  if (numCards <= 0) return res.json({ cards: [] });

  // Gather context
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  const displayName = require('../services/settingsService').getForUser('display_name', req.userId);
  const memoryService = require('../services/memoryService');

  // Recent journal entries (last 5)
  const recentEntries = db.prepare(
    "SELECT title, body_text FROM entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 5"
  ).all(req.userId);
  const entryContext = recentEntries
    .map(e => `${e.title || 'Untitled'}: ${(e.body_text || '').slice(0, 200)}`)
    .join('\n');

  // Recent notes
  const recentNotes = db.prepare(
    "SELECT type, body FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 5"
  ).all(req.userId);
  const noteContext = recentNotes
    .map(n => `[${n.type}] ${(n.body || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 150)}`)
    .join('\n');

  // Memory summary
  let memorySummary = '';
  try { memorySummary = await memoryService.synthesizeMemory(req.userId) || ''; } catch {}

  // Sky context
  let skyCtx = '';
  try {
    const { getSkyContext } = require('../services/skyService');
    skyCtx = getSkyContext();
  } catch {}

  // Active threads — higher-signal than recent-entry excerpts for a "what's
  // this person currently navigating" summary.
  const threadContext = getThreadContext(req.userId);

  // Portrait context
  const profileLines = [];
  if (portrait) {
    if (displayName) profileLines.push(`Name: ${displayName}`);
    if (portrait.mbti) profileLines.push(`MBTI: ${portrait.mbti}`);
    if (portrait.enneagram) profileLines.push(`Enneagram: ${portrait.enneagram}`);
    if (portrait.sun_sign) profileLines.push(`Sun: ${portrait.sun_sign}`);
    if (portrait.moon_sign) profileLines.push(`Moon: ${portrait.moon_sign}`);
    if (portrait.rising_sign) profileLines.push(`Rising: ${portrait.rising_sign}`);
    if (portrait.season_of_life) profileLines.push(`Season of life: ${portrait.season_of_life}`);
    if (portrait.current_intention) profileLines.push(`Current intention: ${portrait.current_intention}`);
    if (portrait.character_description) profileLines.push(`Character: ${portrait.character_description.slice(0, 300)}`);
  }

  // Build card list for LLM
  const cardList = deckCards.map((c, i) => {
    if (deck === 'tarot') {
      return `${c.id}: ${c.name} — upright: ${c.upright} | reversed: ${c.reversed}`;
    }
    return `${c.id}: ${c.name} — ${c.meaning}`;
  }).join('\n');

  const positions = spreadObj.cardCount > 0
    ? spreadObj.positions.map((p, i) => `${i + 1}. ${p.labelKey.split('.').pop()} — ${p.description || ''}`).join('\n')
    : `${numCards} card(s), no fixed positions`;

  const systemPrompt = `You are the card-selection intelligence for Liminal, a personal journaling app.
Your job is to select ${numCards} card(s) from the ${deck === 'tarot' ? 'Tarot' : 'Liminal Oracle'} deck that are most resonant with this person's current life situation.

## CONTEXT ABOUT THIS PERSON
${profileLines.length ? profileLines.join('\n') : 'No profile available.'}

${memorySummary ? `## WHAT YOU KNOW ABOUT THEM\n${memorySummary}` : ''}

${threadContext ? `## ACTIVE LIFE THREADS (what they're currently navigating)\n${threadContext}` : ''}

${entryContext ? `## RECENT JOURNAL ENTRIES\n${entryContext}` : ''}

${noteContext ? `## RECENT NOTES\n${noteContext}` : ''}

${skyCtx ? `## CURRENT SKY\n${skyCtx}` : ''}

${userQuestion ? `## USER'S QUESTION (highest signal — pick cards that answer THIS, not just the broader life context)\n"${userQuestion}"\n\n` : ''}## SPREAD
${positions}

## AVAILABLE CARDS
${cardList}

## INSTRUCTIONS
Select exactly ${numCards} card(s) by ID. For each card, choose one that ${userQuestion ? "speaks directly to the user's question above, drawing on their broader life context only as needed" : "genuinely speaks to what this person is navigating right now"}.

${deck === 'tarot' ? 'For each card, also decide if it should appear reversed (true/false). Use reversals meaningfully — when the shadow side or blocked energy is more relevant.' : 'Oracle cards are never reversed.'}

Balance intuition with surprise — don't always pick the most obvious card. Sometimes the unexpected card is the most truthful.

Respond with ONLY a JSON array, no other text:
[{"id": <number>, "reversed": <boolean>}${numCards > 1 ? ', ...' : ''}]`;

  try {
    const raw = await llm.call(systemPrompt, 'Select the cards now.', { maxTokens: 200 });

    // Parse JSON from response
    const jsonMatch = raw.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');

    const selections = JSON.parse(jsonMatch[0]);

    // Dedupe LLM selections by id — the model occasionally repeats a card
    // across multiple positions in larger spreads. Keep the first occurrence
    // and let the random-fill below cover the missing slots.
    const seenIds = new Set();
    const uniqueSelections = [];
    for (const sel of selections) {
      if (!sel || typeof sel.id !== 'number' || seenIds.has(sel.id)) continue;
      seenIds.add(sel.id);
      uniqueSelections.push(sel);
    }

    // Map selections back to full card data
    const result = uniqueSelections.slice(0, numCards).map((sel, i) => {
      const card = deckCards.find(c => c.id === sel.id);
      if (!card) return null;
      return {
        ...card,
        reversed: deck === 'tarot' ? !!sel.reversed : false,
        position: spreadObj.cardCount > 0 && spreadObj.positions[i]
          ? spreadObj.positions[i].labelKey
          : null,
      };
    }).filter(Boolean);

    // If LLM returned fewer than needed, fill randomly
    if (result.length < numCards) {
      const usedIds = new Set(result.map(c => c.id));
      const remaining = deckCards.filter(c => !usedIds.has(c.id));
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      let fill = 0;
      while (result.length < numCards && fill < remaining.length) {
        result.push({
          ...remaining[fill],
          reversed: deck === 'tarot' ? Math.random() < 0.5 : false,
          position: spreadObj.cardCount > 0 && spreadObj.positions[result.length]
            ? spreadObj.positions[result.length].labelKey
            : null,
        });
        fill++;
      }
    }

    res.json({ cards: result });
  } catch (err) {
    console.error('[cards/pull] LLM error, falling back to random:', err.message);

    // Fallback: Fisher-Yates random
    const shuffled = [...deckCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const result = shuffled.slice(0, numCards).map((card, i) => ({
      ...card,
      reversed: deck === 'tarot' ? Math.random() < 0.5 : false,
      position: spreadObj.cardCount > 0 && spreadObj.positions[i]
        ? spreadObj.positions[i].labelKey
        : null,
    }));
    res.json({ cards: result });
  }
});

// ── Shared helper ──────────────────────────────────────────────────────────
// Extract card-pull context from HTML content containing <div data-card-reading>
// blocks. Used by reflect + notes reflect endpoints so card pulls are visible
// to the LLM. The frontend (CardReading.jsx) base64-encodes the cards JSON and
// reading text via btoa(unescape(encodeURIComponent(str))) — Buffer.from(...,
// 'base64').toString('utf-8') is the matching decoder on the Node side.
function decodeB64Utf8(s) {
  try { return Buffer.from(s || '', 'base64').toString('utf-8'); } catch { return ''; }
}

function buildCardContext(htmlContent) {
  if (!htmlContent) return '';

  // Match each card-reading block. Attribute order is fixed by renderHTML in
  // CardReading.jsx but we use a tolerant per-attribute regex anyway.
  const blockRegex = /<div\b[^>]*\bdata-card-reading\b[^>]*>/g;
  const blocks = [...htmlContent.matchAll(blockRegex)];
  if (!blocks.length) return '';

  const sections = [];
  for (const m of blocks) {
    const tag = m[0];
    const cardsB64    = (tag.match(/data-cards="([^"]*)"/)       || [])[1] || '';
    const readingB64  = (tag.match(/data-reading="([^"]*)"/)     || [])[1] || '';
    const deckType    = (tag.match(/data-deck-type="([^"]*)"/)   || [])[1] || 'tarot';
    const spreadName  = (tag.match(/data-spread-name="([^"]*)"/) || [])[1] || '';

    let cards = [];
    try { cards = JSON.parse(decodeB64Utf8(cardsB64) || '[]'); } catch {}
    const reading = decodeB64Utf8(readingB64).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (!cards.length && !reading) continue;

    const deckLabel = deckType === 'tarot' ? 'Tarot' : 'Liminal Oracle';
    const header = `${deckLabel}${spreadName ? ' — ' + spreadName : ''}`;
    const cardLines = cards.map((c, i) => {
      const pos     = c.position ? `[${c.position}] ` : '';
      const rev     = c.reversed ? ' (Reversed)' : '';
      const meaning = c.reversed
        ? (c.reversedMeaning || c.reversed_meaning || '')
        : (c.uprightMeaning  || c.upright_meaning  || c.meaning || '');
      return `${i + 1}. ${pos}${c.name || 'Unknown'}${rev}${meaning ? ' — ' + meaning : ''}`;
    }).join('\n');

    let section = `${header}\n${cardLines}`;
    if (reading) section += `\n\nReading given:\n${reading.slice(0, 1500)}`;
    sections.push(section);
  }

  if (!sections.length) return '';
  return sections.join('\n\n---\n\n');
}

module.exports = router;
module.exports.buildCardContext = buildCardContext;
