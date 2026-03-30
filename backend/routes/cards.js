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
    const reading = await llm.call(systemPrompt, `Read these ${deckLabel} cards for me.`, { maxTokens: 2000 });
    res.json({ reading: reading.trim() });
  } catch (err) {
    console.error('[cards/reading] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate reading.' });
  }
});

module.exports = router;
