const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── GET /api/search?q=… ──────────────────────────────────────────────────────
// Full-text LIKE search across entries, notes, and oracle conversations.
// Scoped to the current user. Returns up to `limit` items per group.
router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 25);
  if (!q) return res.json({ entries: [], notes: [], oracle: [] });

  const like = `%${q.replace(/[%_]/g, s => '\\' + s)}%`;
  const userId = req.userId;

  const entries = db.prepare(`
    SELECT id, title, body_text, date, updated_at
    FROM entries
    WHERE user_id = ? AND (title LIKE ? ESCAPE '\\' OR body_text LIKE ? ESCAPE '\\')
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(userId, like, like, limit);

  const notes = db.prepare(`
    SELECT id, type, title, body, updated_at
    FROM notes
    WHERE user_id = ? AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(userId, like, like, limit);

  // Match oracle_messages content, return parent session (deduped) + the matched snippet.
  const oracleRows = db.prepare(`
    SELECT s.id AS session_id, s.title AS session_title, s.archetype, s.created_at,
           m.id AS message_id, m.role, m.content, m.created_at AS message_created_at
    FROM oracle_messages m
    JOIN oracle_sessions s ON s.id = m.session_id
    WHERE s.user_id = ? AND m.content LIKE ? ESCAPE '\\'
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(userId, like, limit * 3);

  const seen = new Set();
  const oracle = [];
  for (const r of oracleRows) {
    if (seen.has(r.session_id)) continue;
    seen.add(r.session_id);
    oracle.push({
      session_id: r.session_id,
      title: r.session_title || 'Conversation',
      archetype: r.archetype,
      snippet: r.content,
      role: r.role,
      created_at: r.message_created_at,
    });
    if (oracle.length >= limit) break;
  }

  res.json({ entries, notes, oracle });
});

module.exports = router;
