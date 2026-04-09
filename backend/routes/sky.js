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
    const events = sky.getUpcomingEvents(now, 60);

    // Load portrait for personalisation
    const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
    const displayName = require('../services/settingsService').get('display_name');

    let portraitContext = '';
    if (portrait) {
      const lines = [];
      if (displayName) lines.push(`Name: ${displayName}`);
      if (portrait.sun_sign) lines.push(`Sun: ${portrait.sun_sign}`);
      if (portrait.moon_sign) lines.push(`Moon sign: ${portrait.moon_sign}`);
      if (portrait.rising_sign) lines.push(`Rising: ${portrait.rising_sign}`);
      if (portrait.season_of_life) lines.push(`Season of life: ${portrait.season_of_life}`);
      if (portrait.current_intention) lines.push(`Current intention: ${portrait.current_intention}`);
      if (portrait.character_description) lines.push(`\nCharacter portrait:\n${portrait.character_description}`);
      if (lines.length) portraitContext = `\n\n## ABOUT THIS PERSON\n${lines.join('\n')}`;
    }

    // Format sky data — include forward-looking cycle info
    const retroPlanets = conditions.filter(c => c.retrograde).map(c => c.planet);
    const conditionLines = conditions.map(c => {
      let line = `${c.planet}: In ${c.sign}`;
      if (c.retrograde) {
        line = `${c.planet}: Retrograde in ${c.sign}${c.retrogradeEnds ? ' (until ' + c.retrogradeEnds + ')' : ''} — ${c.description || ''}`;
      } else if (c.nextRetrograde) {
        line += ` (next retrograde begins ${c.nextRetrograde})`;
      }
      if (c.signChangeDate && c.nextSign) {
        line += ` — moves into ${c.nextSign} on ${c.signChangeDate}`;
      }
      return line;
    }).join('\n');

    const eventLines = events.slice(0, 15).map(e => {
      return `${e.date}: ${e.type}${e.sign ? ' in ' + e.sign : ''}${e.name ? ' (' + e.name + ')' : ''}`;
    }).join('\n');

    const systemPrompt = `You are an astrologer within a personal journaling app called Liminal.
You write warm, insightful, deeply personal astrological reflections that help people understand how the current sky touches their inner life — and what is emerging ahead.
${portraitContext}

## CURRENT SKY
Moon: ${moon.phase} in ${moon.moonSign} (${moon.illumination}% illuminated, day ${moon.daysSinceNewMoon || '?'} of cycle)
Meaning: ${moon.meaning}

Planetary conditions & cycles:
${conditionLines}

Upcoming events (next 60 days):
${eventLines}
${retroPlanets.length ? '\nCurrently retrograde: ' + retroPlanets.join(', ') : ''}

Write a personalised astrology reflection (3–5 paragraphs, up to 550 words) that:
- Opens with the current moon phase and what it invites right now
- Names the larger cycles in motion — retrogrades ending or beginning, planets changing signs, pressure easing or building. Frame these as arcs and seasons, not isolated events. Talk about what kind of period is opening or closing.
- Looks ahead: what is emerging over the next one to two months? What themes are converging? What openings are forming? If a retrograde is ending soon, what does that release look like? If one is approaching, what deserves attention before it arrives?
- Connects the sky to this specific person — their natal placements, their season of life, their current intention. Don't just list transits — interpret what they mean for this person's inner landscape.
- Closes with grounded, reflective guidance — not "capitalise on this window" but "stay close to what feels true and let things unfold at their own pace." The tone should be wise and unhurried.
- Speaks directly as "you"
- Uses contemplative, warm prose — no bullet points, no lists, no headers, no section titles
- Reads like a letter from a thoughtful astrologer, not a horoscope

Return only the reflection text. No preamble, no greeting, no sign-off.`;

    const summary = await llm.call(systemPrompt, 'Write my current astrology reflection.', { maxTokens: 1600 });
    res.json({ summary: summary.trim() });
  } catch (err) {
    console.error('[sky] generate error:', err);
    res.status(500).json({ error: 'Failed to generate sky summary' });
  }
});

module.exports = router;
