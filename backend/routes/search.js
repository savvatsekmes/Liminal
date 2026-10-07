const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { safeDecrypt } = require('../services/rowCrypto');

router.use(requireAuth);

// ── GET /api/search?q=… ──────────────────────────────────────────────────────
// Full-text search across entries, notes, and oracle conversations.
// Bodies are encrypted at rest, so matching happens in memory after decrypt.
// Titles are plaintext; we still scan them in the same pass for simplicity.
router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 25);
  if (!q) return res.json({ entries: [], notes: [], oracle: [] });

  const needle = q.toLowerCase();
  const userId = req.userId;

  const entryRows = db.prepare(`
    SELECT id, title, body_text, date, updated_at
    FROM entries
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId);

  const entries = [];
  for (const r of entryRows) {
    const title = (r.title || '').toLowerCase();
    const bodyText = safeDecrypt(userId, r.body_text) || '';
    if (title.includes(needle) || bodyText.toLowerCase().includes(needle)) {
      entries.push({ id: r.id, title: r.title, body_text: bodyText, date: r.date, updated_at: r.updated_at });
      if (entries.length >= limit) break;
    }
  }

  const noteRows = db.prepare(`
    SELECT id, type, title, body, updated_at
    FROM notes
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId);

  const notes = [];
  for (const r of noteRows) {
    const title = (r.title || '').toLowerCase();
    const body = safeDecrypt(userId, r.body) || '';
    if (title.includes(needle) || body.toLowerCase().includes(needle)) {
      notes.push({ id: r.id, type: r.type, title: r.title, body, updated_at: r.updated_at });
      if (notes.length >= limit) break;
    }
  }

  const oracleRows = db.prepare(`
    SELECT s.id AS session_id, s.title AS session_title, s.archetype,
           m.id AS message_id, m.role, m.content, m.created_at AS message_created_at
    FROM oracle_messages m
    JOIN oracle_sessions s ON s.id = m.session_id
    WHERE s.user_id = ?
    ORDER BY m.created_at DESC
  `).all(userId);

  const seen = new Set();
  const oracle = [];
  for (const r of oracleRows) {
    if (seen.has(r.session_id)) continue;
    // Chat replies carry [[entry:ID|label]] links — search and show the label.
    const content = require('../services/journalRecall').stripEntryCitations(safeDecrypt(userId, r.content) || '');
    if (!content.toLowerCase().includes(needle)) continue;
    seen.add(r.session_id);
    oracle.push({
      session_id: r.session_id,
      title: r.session_title || 'Conversation',
      archetype: r.archetype,
      snippet: content,
      role: r.role,
      created_at: r.message_created_at,
    });
    if (oracle.length >= limit) break;
  }

  res.json({ entries, notes, oracle });
});

// ── GET /api/search/related?q=… ──────────────────────────────────────────────
// Entries related by meaning, not wording — "mum" finds "my mother", "felt
// stuck" finds the week you wrote about going round in circles. Uses the
// librarian (embeddings), so it's slower than the word search above and is
// fetched separately; the caller drops entries the word search already shows.
// Each result carries its most relevant passage, not the entry's opening.
// MiniLM-scale. On a real 370-entry journal, topics people search for score
// 0.22–0.47 on their related entries; nonsense ("xylophone repair",
// "zzz qwerty") stays under 0.21.
const RELATED_MIN_SCORE = 0.22;
router.get('/related', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 500);
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);
  if (q.length < 3) return res.json({ entries: [] });
  try {
    const hits = await require('../services/journalRecall')
      .recallEntries(req.userId, q, { k: limit, maxChars: 260, minScore: RELATED_MIN_SCORE });
    res.json({ entries: hits.map(({ id, title, date, excerpt, score }) => ({ id, title, date, excerpt, score })) });
  } catch (err) {
    console.error('[search/related] failed:', err.message);
    res.json({ entries: [] });
  }
});

module.exports = router;
