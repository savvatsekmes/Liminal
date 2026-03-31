const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const sky = require('../services/skyService');
const llm = require('../services/llmService');

router.use(requireAuth);

// GET /api/sky/current — moon phase, planetary conditions, heliocentric positions
router.get('/current', (req, res) => {
  try {
    const now = new Date();
    const moon = sky.getMoonPhase(now);
    const conditions = sky.getPlanetaryConditions(now);
    const positions = sky.getHeliocentricPositions(now);
    res.json({ moon, conditions, positions });
  } catch (err) {
    console.error('[sky] current error:', err);
    res.status(500).json({ error: 'Failed to calculate sky data' });
  }
});

// GET /api/sky/upcoming — next 90 days of events (cached 24hrs)
router.get('/upcoming', (req, res) => {
  try {
    // Check cache
    const cached = db.prepare("SELECT data, cached_at FROM sky_cache WHERE cache_key = 'upcoming_events'").get();
    if (cached) {
      const age = Date.now() - new Date(cached.cached_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return res.json(JSON.parse(cached.data));
      }
    }

    const events = sky.getUpcomingEvents(new Date(), 90);
    const data = JSON.stringify(events);

    db.prepare(`
      INSERT OR REPLACE INTO sky_cache (cache_key, data, cached_at)
      VALUES ('upcoming_events', ?, CURRENT_TIMESTAMP)
    `).run(data);

    res.json(events);
  } catch (err) {
    console.error('[sky] upcoming error:', err);
    res.status(500).json({ error: 'Failed to calculate upcoming events' });
  }
});

// GET /api/sky/entries-this-cycle — entries since last new moon
router.get('/entries-this-cycle', (req, res) => {
  try {
    const moon = sky.getMoonPhase(new Date());
    const lastNewMoon = moon.lastNewMoonDate;
    if (!lastNewMoon) return res.json([]);

    const entries = db.prepare(`
      SELECT id, title, date, created_at
      FROM entries
      WHERE user_id = ? AND date >= ?
      ORDER BY date DESC
    `).all(req.userId, lastNewMoon);

    res.json(entries);
  } catch (err) {
    console.error('[sky] entries-this-cycle error:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// POST /api/sky/generate — generate personalised astrology summary
router.post('/generate', async (req, res) => {
  try {
    const now = new Date();
    const moon = sky.getMoonPhase(now);
    const conditions = sky.getPlanetaryConditions(now);
    const events = sky.getUpcomingEvents(now, 30);

    // Load portrait for personalisation
    const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);

    let portraitContext = '';
    if (portrait) {
      const lines = [];
      if (portrait.preferred_name) lines.push(`Name: ${portrait.preferred_name}`);
      if (portrait.sun_sign) lines.push(`Sun: ${portrait.sun_sign}`);
      if (portrait.moon_sign) lines.push(`Moon sign: ${portrait.moon_sign}`);
      if (portrait.rising_sign) lines.push(`Rising: ${portrait.rising_sign}`);
      if (portrait.season_of_life) lines.push(`Season of life: ${portrait.season_of_life}`);
      if (portrait.current_intention) lines.push(`Current intention: ${portrait.current_intention}`);
      if (portrait.character_description) lines.push(`\nCharacter portrait:\n${portrait.character_description}`);
      if (lines.length) portraitContext = `\n\n## ABOUT THIS PERSON\n${lines.join('\n')}`;
    }

    // Format sky data
    const retroPlanets = conditions.filter(c => c.retrograde).map(c => c.planet);
    const conditionLines = conditions.map(c => {
      if (c.retrograde) return `${c.planet}: Retrograde${c.retrogradeEnds ? ' (until ' + c.retrogradeEnds + ')' : ''} — ${c.description || ''}`;
      return `${c.planet}: In ${c.sign}`;
    }).join('\n');

    const eventLines = events.slice(0, 10).map(e => {
      return `${e.date}: ${e.type}${e.sign ? ' in ' + e.sign : ''}${e.name ? ' (' + e.name + ')' : ''}`;
    }).join('\n');

    const systemPrompt = `You are an astrologer within a personal journaling app called Liminal.
You write warm, insightful, personal astrological summaries that help people understand how the current sky might touch their inner life.
${portraitContext}

## CURRENT SKY
Moon: ${moon.phase} in ${moon.moonSign} (${moon.illumination}% illuminated, day ${moon.daysSinceNewMoon || '?'} of cycle)
Meaning: ${moon.meaning}

Planetary conditions:
${conditionLines}

Upcoming events (next 30 days):
${eventLines}
${retroPlanets.length ? '\nRetrograde planets: ' + retroPlanets.join(', ') : ''}

Write a personalised astrology summary (2–3 paragraphs) that:
- Opens with the moon phase and what it invites right now
- Weaves in the planetary conditions — especially retrogrades — and what they mean for this person
- Notes any upcoming transits or events worth being aware of
- Speaks directly to the person as "you"
- Uses contemplative, warm prose — no bullet points, no lists, no headers
- If the person's birth chart data is available, connects sky transits to their natal placements
- Keeps under 400 words

Return only the summary text. No preamble, no sign-off.`;

    const summary = await llm.call(systemPrompt, 'Write my current astrology summary.', { maxTokens: 1200 });
    res.json({ summary: summary.trim() });
  } catch (err) {
    console.error('[sky] generate error:', err);
    res.status(500).json({ error: 'Failed to generate sky summary' });
  }
});

module.exports = router;
