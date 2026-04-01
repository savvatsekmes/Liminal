const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const llm = require('../services/llmService');
const db = require('../database');
const tarotDeck = require('../data/tarotDeck');
const oracleDeck = require('../data/oracleDeck');
const spreads = require('../data/spreads');

router.use(requireAuth);

// ── GET /api/cards/decks — return deck + spread data to frontend ─────────────
router.get('/decks', (req, res) => {
  // Add image paths to tarot cards
  const tarotWithImages = tarotDeck.map(card => {
    const img = card.suit
      ? `/cards/tarot/${card.suit}_${card.rank}.jpg`
      : `/cards/tarot/major_${card.id}.jpg`;
    return { ...card, image: img };
  });
  res.json({ tarot: tarotWithImages, oracle: oracleDeck, spreads });
});

// ── GET /api/cards/daily — daily card (cached per day) ──────────────────────
router.get('/daily', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Check cache
  const cached = db.prepare(
    'SELECT card_data FROM daily_cards WHERE user_id = ? AND date = ?'
  ).get(req.userId, today);
  if (cached) {
    return res.json(JSON.parse(cached.card_data));
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
      ? `/cards/tarot/${raw.suit}_${raw.rank}.jpg`
      : `/cards/tarot/major_${raw.id}.jpg`;
  }

  const card = {
    deck,
    id: raw.id,
    name: raw.name,
    image,
    reversed,
    meaning: reversed ? (raw.reversed || raw.meaning || '') : (raw.upright || raw.meaning || ''),
  };

  // Generate a short daily insight via LLM
  try {
    const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
    let context = '';
    if (portrait) {
      if (portrait.preferred_name) context += `Name: ${portrait.preferred_name}. `;
      if (portrait.current_intention) context += `Current intention: ${portrait.current_intention}. `;
      if (portrait.season_of_life) context += `Season of life: ${portrait.season_of_life}. `;
    }

    const systemPrompt = 'You are a warm, concise oracle guide. Write daily card insights that are personal, grounding, and poetic. No greeting or sign-off. Plain text only.';
    const userMessage = `The user drew "${card.name}"${reversed ? ' (reversed)' : ''} as their daily card. Meaning: "${card.meaning}". ${context}Write a 2-3 sentence daily insight.`;
    const insight = await llm.call(systemPrompt, userMessage, { maxTokens: 200 });
    card.insight = insight.trim();
  } catch (err) {
    console.error('[cards/daily] LLM insight failed:', err.message);
    card.insight = card.meaning;
  }

  // Cache for today
  db.prepare(
    'INSERT OR REPLACE INTO daily_cards (user_id, date, deck, card_data) VALUES (?, ?, ?, ?)'
  ).run(req.userId, today, deck, JSON.stringify(card));

  res.json(card);
});

// ── POST /api/cards/reading — generate LLM reading ──────────────────────────
router.post('/reading', async (req, res) => {
  const { deck, spread, cards, entryText } = req.body;
  if (!deck || !spread || !cards?.length) {
    return res.status(400).json({ error: 'deck, spread, and cards are required' });
  }

  // Load portrait for personalisation
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);

  // Build portrait context
  let portraitContext = '';
  if (portrait) {
    const lines = [];
    if (portrait.preferred_name) lines.push(`Name: ${portrait.preferred_name}`);
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

The user has pulled the following cards in a "${spreadLabel}" spread:

${cardLines}

${entryText ? `Their current journal entry provides context:\n"${entryText.slice(0, 2000)}"` : 'No journal entry context was provided.'}

Provide a reading that:
- Addresses each card in its position with genuine insight
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
  const { deck, spread, count } = req.body;
  if (!deck || !spread) {
    return res.status(400).json({ error: 'deck and spread are required' });
  }

  const spreadObj = spreads.find(s => s.id === spread);
  if (!spreadObj) return res.status(400).json({ error: 'Unknown spread' });

  const deckCards = deck === 'tarot' ? tarotDeck : oracleDeck;
  const numCards = count || spreadObj.cardCount || 1;

  // Gather context
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
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

  // Portrait context
  const profileLines = [];
  if (portrait) {
    if (portrait.preferred_name) profileLines.push(`Name: ${portrait.preferred_name}`);
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

${entryContext ? `## RECENT JOURNAL ENTRIES\n${entryContext}` : ''}

${noteContext ? `## RECENT NOTES\n${noteContext}` : ''}

${skyCtx ? `## CURRENT SKY\n${skyCtx}` : ''}

## SPREAD
${positions}

## AVAILABLE CARDS
${cardList}

## INSTRUCTIONS
Select exactly ${numCards} card(s) by ID. For each card, choose one that genuinely speaks to what this person is navigating right now.

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

    // Map selections back to full card data
    const result = selections.slice(0, numCards).map((sel, i) => {
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

module.exports = router;
