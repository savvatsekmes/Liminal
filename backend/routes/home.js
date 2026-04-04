const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const llm = require('../services/llmService');
const db = require('../database');

router.use(requireAuth);

// ── GET /api/home/pulse — short AI read on where the user is right now ──────
router.get('/pulse', async (req, res) => {
  // Get latest entry
  const latest = db.prepare(
    'SELECT id, title, body_text, created_at FROM entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(req.userId);

  if (!latest) return res.json({ pulse: null });

  const entryHash = `${latest.id}:${latest.created_at}`;

  // Check cache — regenerate if stale (new entry since last generation)
  const cached = db.prepare(
    "SELECT data, entry_hash FROM home_cache WHERE user_id = ? AND cache_key = 'pulse'"
  ).get(req.userId);

  if (cached && cached.entry_hash === entryHash) {
    return res.json(JSON.parse(cached.data));
  }

  // Calculate days ago
  const daysAgo = Math.floor((Date.now() - new Date(latest.created_at).getTime()) / 86400000);
  const daysLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;

  // Load portrait for context
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  let context = '';
  if (portrait) {
    if (portrait.preferred_name) context += `Name: ${portrait.preferred_name}. `;
    if (portrait.current_intention) context += `Intention: ${portrait.current_intention}. `;
    if (portrait.season_of_life) context += `Season: ${portrait.season_of_life}. `;
  }

  try {
    const systemPrompt = `Based on this person's most recent journal entry and what you know about them, write 2-3 sentences describing where they seem to be right now emotionally and psychologically. Warm, honest, second person. Under 60 words. Not falsely positive. Do not mention the journal or the app. Just speak to where they are.`;
    const userMessage = `${context}\n\nMost recent entry (${daysLabel}):\nTitle: ${latest.title || 'Untitled'}\n${(latest.body_text || '').slice(0, 800)}`;
    const text = await llm.call(systemPrompt, userMessage, { maxTokens: 150 });

    const result = {
      pulse: text.trim(),
      daysLabel,
    };

    db.prepare(
      "INSERT OR REPLACE INTO home_cache (user_id, cache_key, data, entry_hash) VALUES (?, 'pulse', ?, ?)"
    ).run(req.userId, JSON.stringify(result), entryHash);

    res.json(result);
  } catch (err) {
    console.error('[home/pulse] LLM failed:', err.message);
    res.json({ pulse: null });
  }
});

// ── GET /api/home/insight — longer pattern observation from rolling memory ──
router.get('/insight', async (req, res) => {
  // Get recent entries for hash
  const recent = db.prepare(
    'SELECT id FROM entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
  ).all(req.userId);

  if (recent.length < 2) return res.json({ insight: null });

  const entryHash = recent.map(r => r.id).join(',');

  // Check cache
  if (!req.query.refresh) {
    const cached = db.prepare(
      "SELECT data, entry_hash FROM home_cache WHERE user_id = ? AND cache_key = 'insight'"
    ).get(req.userId);

    if (cached && cached.entry_hash === entryHash) {
      return res.json(JSON.parse(cached.data));
    }
  }

  // Gather context
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(req.userId);
  let context = '';
  if (portrait) {
    if (portrait.preferred_name) context += `Name: ${portrait.preferred_name}. `;
    if (portrait.current_intention) context += `Intention: ${portrait.current_intention}. `;
    if (portrait.season_of_life) context += `Season: ${portrait.season_of_life}. `;
  }

  const entries = db.prepare(
    'SELECT title, body_text, created_at FROM entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).all(req.userId);
  const entryContext = entries
    .map(e => `[${e.created_at}] ${e.title || 'Untitled'}: ${(e.body_text || '').slice(0, 300)}`)
    .join('\n\n');

  // Also pull memory synthesis if available
  let memoryContext = '';
  try {
    const memoryService = require('../services/memoryService');
    const synthesis = await memoryService.synthesize(req.userId);
    if (synthesis) memoryContext = `\n\nMemory synthesis:\n${synthesis.slice(0, 500)}`;
  } catch {}

  try {
    const systemPrompt = `Based on this person's recent journal entries and everything you know about them, write one insight — a pattern worth noticing, a question worth sitting with, or a quiet observation about where they are in their journey right now. 2-4 sentences. Prose only. Warm and honest. Second person. Not falsely positive. Do not mention the journal or the app directly.`;
    const userMessage = `${context}\n\nRecent entries:\n${entryContext}${memoryContext}`;
    const text = await llm.call(systemPrompt, userMessage, { maxTokens: 250 });

    const result = { insight: text.trim() };

    db.prepare(
      "INSERT OR REPLACE INTO home_cache (user_id, cache_key, data, entry_hash) VALUES (?, 'insight', ?, ?)"
    ).run(req.userId, JSON.stringify(result), entryHash);

    res.json(result);
  } catch (err) {
    console.error('[home/insight] LLM failed:', err.message);
    res.json({ insight: null });
  }
});

// ── GET /api/home/themes — recurring tags from last 30 days ─────────────────
router.get('/themes', (req, res) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const entries = db.prepare(
    'SELECT tags FROM entries WHERE user_id = ? AND created_at >= ?'
  ).all(req.userId, thirtyDaysAgo);

  const tagCounts = {};
  entries.forEach(e => {
    let tags = [];
    try { tags = JSON.parse(e.tags || '[]'); } catch {}
    tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  });

  const sorted = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 11)
    .map(([tag, count]) => ({ tag, count }));

  res.json({ themes: sorted });
});

// ── GET /api/home/rhythm — entry dates for last 365 days ────────────────────
router.get('/rhythm', (req, res) => {
  const days = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }

  const entries = db.prepare(
    "SELECT COALESCE(date, date(created_at)) as day, MIN(title) as title FROM entries WHERE user_id = ? AND COALESCE(date, date(created_at)) >= ? GROUP BY COALESCE(date, date(created_at))"
  ).all(req.userId, days[0]);

  const entryMap = {};
  entries.forEach(e => { entryMap[e.day] = e.title || 'Untitled'; });

  const rhythm = days.map(day => ({
    date: day,
    wrote: !!entryMap[day],
    title: entryMap[day] || null,
  }));

  res.json({ rhythm });
});

// ── GET /api/home/weather — current weather from portrait location ───────────
router.get('/weather', async (req, res) => {
  const weatherService = require('../services/weatherService');
  const portrait = db.prepare('SELECT weather_lat, weather_lng, weather_city, birth_location FROM portrait WHERE user_id = ?').get(req.userId);
  if (!portrait) return res.json({ weather: null });

  const lat = portrait.weather_lat;
  const lng = portrait.weather_lng;
  const city = portrait.weather_city || portrait.birth_location || '';

  if (!lat || !lng) return res.json({ weather: null });

  const weather = await weatherService.getWeather(lat, lng, city);
  res.json({ weather });
});

module.exports = router;
