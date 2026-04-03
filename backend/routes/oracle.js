const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../database');
const llm = require('../services/llmService');
const memory = require('../services/memoryService');

router.use(requireAuth);

function parseTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}
function sessionRow(row) {
  if (!row) return null;
  return { ...row, tags: parseTags(row.tags) };
}

// ── GET /api/oracle/sessions ───────────────────────────────────────────────
router.get('/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT
      s.id, s.archetype, s.title, s.tag, s.tags, s.created_at,
      COUNT(m.id) AS message_count,
      (SELECT content FROM oracle_messages
       WHERE session_id = s.id AND role = 'user'
       ORDER BY created_at ASC LIMIT 1) AS first_message
    FROM oracle_sessions s
    LEFT JOIN oracle_messages m ON m.session_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT 50
  `).all(req.userId);
  res.json(sessions.map(sessionRow));
});

// ── GET /api/oracle/tags ───────────────────────────────────────────────────
router.get('/tags', (req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT tag FROM oracle_sessions WHERE tag IS NOT NULL AND tag != '' AND user_id = ? ORDER BY tag")
    .all(req.userId);
  res.json(rows.map((r) => r.tag));
});

// ── DELETE /api/oracle/tags/:tag ──────────────────────────────────────────
router.delete('/tags/:tag', (req, res) => {
  db.prepare("UPDATE oracle_sessions SET tag = NULL WHERE tag = ? AND user_id = ?")
    .run(req.params.tag, req.userId);
  res.json({ success: true });
});

// ── PUT /api/oracle/sessions/:id/tag ──────────────────────────────────────
router.put('/sessions/:id/tag', (req, res) => {
  const session = db.prepare('SELECT id FROM oracle_sessions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { tag } = req.body;
  db.prepare('UPDATE oracle_sessions SET tag = ? WHERE id = ?').run(tag || null, session.id);
  res.json({ success: true });
});

// ── PUT /api/oracle/sessions/:id/tags ─────────────────────────────────────
router.put('/sessions/:id/tags', (req, res) => {
  const session = db.prepare('SELECT id FROM oracle_sessions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { tags } = req.body;
  db.prepare('UPDATE oracle_sessions SET tags = ? WHERE id = ?').run(JSON.stringify(tags || []), session.id);
  res.json({ success: true });
});

// ── POST /api/oracle/sessions/import ──────────────────────────────────────
// Import a finished Q&A pair (e.g. from Home Quick Ask) without calling LLM.
router.post('/sessions/import', (req, res) => {
  const { question, answer, archetype = 'Direct Friend' } = req.body;
  if (!question?.trim() || !answer?.trim()) {
    return res.status(400).json({ error: 'question and answer are required' });
  }

  const sessionResult = db.prepare(
    'INSERT INTO oracle_sessions (user_id, archetype, title) VALUES (?, ?, ?)'
  ).run(req.userId, archetype, question.trim().slice(0, 80));

  const sessionId = sessionResult.lastInsertRowid;

  db.prepare(
    'INSERT INTO oracle_messages (session_id, role, content, archetype) VALUES (?, ?, ?, ?)'
  ).run(sessionId, 'user', question.trim(), archetype);

  db.prepare(
    'INSERT INTO oracle_messages (session_id, role, content, archetype) VALUES (?, ?, ?, ?)'
  ).run(sessionId, 'assistant', answer.trim(), archetype);

  const session = db.prepare('SELECT * FROM oracle_sessions WHERE id = ?').get(sessionId);
  res.json(session);
});

// ── POST /api/oracle/sessions ──────────────────────────────────────────────
router.post('/sessions', (req, res) => {
  const { archetype = 'Zen' } = req.body;
  const result = db.prepare(
    'INSERT INTO oracle_sessions (user_id, archetype) VALUES (?, ?)'
  ).run(req.userId, archetype);
  const session = db.prepare('SELECT * FROM oracle_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.json(sessionRow(session));
});

// ── GET /api/oracle/sessions/:id ──────────────────────────────────────────
router.get('/sessions/:id', (req, res) => {
  const session = db.prepare(
    'SELECT * FROM oracle_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const messages = db.prepare(
    'SELECT * FROM oracle_messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(session.id);

  res.json({ ...sessionRow(session), messages });
});

// ── POST /api/oracle/sessions/:id/messages ────────────────────────────────
router.post('/sessions/:id/messages', async (req, res) => {
  const { content, archetype } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

  const session = db.prepare(
    'SELECT * FROM oracle_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const activeArchetype = archetype || session.archetype;

  // Update session archetype if it changed
  if (archetype && archetype !== session.archetype) {
    db.prepare('UPDATE oracle_sessions SET archetype = ? WHERE id = ?').run(archetype, session.id);
  }

  // Save the user message
  const userMsgResult = db.prepare(
    'INSERT INTO oracle_messages (session_id, role, content, archetype) VALUES (?, ?, ?, ?)'
  ).run(session.id, 'user', content.trim(), activeArchetype);

  // Auto-generate title from first user message
  const msgCount = db.prepare(
    "SELECT COUNT(*) AS n FROM oracle_messages WHERE session_id = ? AND role = 'user'"
  ).get(session.id).n;
  if (msgCount === 1) {
    const title = content.trim().slice(0, 80);
    db.prepare('UPDATE oracle_sessions SET title = ? WHERE id = ?').run(title, session.id);
  }

  // Load full conversation history, filtering out empty responses
  const history = db.prepare(
    "SELECT role, content FROM oracle_messages WHERE session_id = ? AND content != '' ORDER BY created_at ASC LIMIT 30"
  ).all(session.id);

  const systemPrompt = await memory.buildOracleSystemPrompt(req.userId, activeArchetype);

  try {
    const answer = await llm.callWithHistoryAndTools(systemPrompt, history, { maxTokens: 1200 });
    const trimmed = answer.trim();

    // Don't save empty responses
    if (!trimmed) {
      db.prepare('DELETE FROM oracle_messages WHERE id = ?').run(userMsgResult.lastInsertRowid);
      return res.status(502).json({ error: 'Model returned an empty response. Try again or switch models.' });
    }

    const assistantResult = db.prepare(
      'INSERT INTO oracle_messages (session_id, role, content, archetype) VALUES (?, ?, ?, ?)'
    ).run(session.id, 'assistant', trimmed, activeArchetype);

    const assistantMsg = db.prepare(
      'SELECT * FROM oracle_messages WHERE id = ?'
    ).get(assistantResult.lastInsertRowid);

    res.json(assistantMsg);
  } catch (err) {
    // Roll back the user message on failure
    db.prepare('DELETE FROM oracle_messages WHERE id = ?').run(userMsgResult.lastInsertRowid);
    console.error('[oracle]', err.message);
    res.status(500).json({ error: 'Failed to generate response', detail: err.message });
  }
});

// ── DELETE /api/oracle/sessions/:id ───────────────────────────────────────
router.delete('/sessions/:id', (req, res) => {
  const session = db.prepare(
    'SELECT id FROM oracle_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  db.prepare('DELETE FROM oracle_sessions WHERE id = ?').run(session.id);
  res.json({ success: true });
});

module.exports = router;
