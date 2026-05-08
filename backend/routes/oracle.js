const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../database');
const llm = require('../services/llmService');
const memory = require('../services/memoryService');
const threadService = require('../services/threadService');
const { encryptField, safeDecrypt } = require('../services/rowCrypto');

router.use(requireAuth);

function parseTags(raw) {
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}
function sessionRow(row) {
  if (!row) return null;
  return { ...row, tags: parseTags(row.tags), auto_tags: parseTags(row.auto_tags) };
}

// Same dedupe + manual-wins rule as entries/notes — manual `tags` always
// shadows `auto_tags` so a tag never lives in both at once.
function normaliseTagPair(tags, autoTags) {
  const norm = (arr) => {
    const seen = new Set();
    const out = [];
    for (const t of (arr || [])) {
      const c = String(t || '').trim().toLowerCase();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  };
  const manual = norm(tags);
  const manualSet = new Set(manual);
  const auto = norm(autoTags).filter((t) => !manualSet.has(t));
  return { tags: manual, auto_tags: auto };
}

// ── GET /api/oracle/sessions ───────────────────────────────────────────────
router.get('/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT
      s.id, s.archetype, s.title, s.tag, s.tags, s.auto_tags, s.created_at,
      s.source_entry_id, s.source_note_id,
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
  res.json(sessions.map((s) => ({
    ...sessionRow(s),
    first_message: safeDecrypt(req.userId, s.first_message),
  })));
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
  const session = db.prepare('SELECT id, tags, auto_tags FROM oracle_sessions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { tags, auto_tags } = req.body;
  // Merge with existing for the field that wasn't passed, then normalise.
  const existingTags = tags !== undefined ? tags : parseTags(session.tags);
  const existingAuto = auto_tags !== undefined ? auto_tags : parseTags(session.auto_tags);
  const normalised = normaliseTagPair(existingTags, existingAuto);
  db.prepare('UPDATE oracle_sessions SET tags = ?, auto_tags = ? WHERE id = ?')
    .run(JSON.stringify(normalised.tags), JSON.stringify(normalised.auto_tags), session.id);
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
  ).run(sessionId, 'user', encryptField(req.userId, question.trim()), archetype);

  db.prepare(
    'INSERT INTO oracle_messages (session_id, role, content, archetype) VALUES (?, ?, ?, ?)'
  ).run(sessionId, 'assistant', encryptField(req.userId, answer.trim()), archetype);

  const session = db.prepare('SELECT * FROM oracle_sessions WHERE id = ?').get(sessionId);
  res.json(session);
});

// ── POST /api/oracle/sessions ──────────────────────────────────────────────
router.post('/sessions', (req, res) => {
  const { archetype = 'Auto', sourceEntryId, sourceNoteId } = req.body;

  // Inherit the title from the source entry/note so the linked chat is
  // identifiable in the sessions list instead of showing "New conversation".
  // Title/body columns are encrypted at rest — decrypt before using as a label.
  let title = null;
  if (sourceEntryId) {
    const src = db.prepare('SELECT title FROM entries WHERE id = ? AND user_id = ?').get(sourceEntryId, req.userId);
    const decTitle = src ? safeDecrypt(req.userId, src.title) : null;
    if (decTitle) title = decTitle;
  } else if (sourceNoteId) {
    const src = db.prepare('SELECT title, body FROM notes WHERE id = ? AND user_id = ?').get(sourceNoteId, req.userId);
    const decTitle = src ? safeDecrypt(req.userId, src.title) : null;
    const decBody = src ? safeDecrypt(req.userId, src.body) : null;
    if (decTitle) {
      title = decTitle;
    } else if (decBody) {
      // Notes often have no title — fall back to the first line of body (plain text, trimmed to 80)
      const firstLine = String(decBody).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (firstLine) title = firstLine;
    }
  }

  try {
    const result = db.prepare(
      'INSERT INTO oracle_sessions (user_id, archetype, source_entry_id, source_note_id, title) VALUES (?, ?, ?, ?, ?)'
    ).run(req.userId, archetype, sourceEntryId || null, sourceNoteId || null, title);
    const sessionId = result.lastInsertRowid;

    // Bidirectional link: update the source entry/note with the new session id
    if (sourceEntryId) {
      db.prepare('UPDATE entries SET linked_session_id = ? WHERE id = ? AND user_id = ?')
        .run(sessionId, sourceEntryId, req.userId);
    }
    if (sourceNoteId) {
      db.prepare('UPDATE notes SET linked_session_id = ? WHERE id = ? AND user_id = ?')
        .run(sessionId, sourceNoteId, req.userId);
    }

    const session = db.prepare('SELECT * FROM oracle_sessions WHERE id = ?').get(sessionId);
    res.json(sessionRow(session));
  } catch (err) {
    console.error('[oracle] POST /sessions insert failed:', err && err.message, err && err.code);
    res.status(500).json({ error: err && err.message });
  }
});

// ── GET /api/oracle/sessions/:id ──────────────────────────────────────────
router.get('/sessions/:id', (req, res) => {
  const session = db.prepare(
    'SELECT * FROM oracle_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const messages = db.prepare(
    'SELECT * FROM oracle_messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(session.id).map((m) => ({ ...m, content: safeDecrypt(req.userId, m.content) }));

  res.json({ ...sessionRow(session), messages });
});

// ── GET /api/oracle/linked-session?entryId=&noteId= ─────────────────────
router.get('/linked-session', (req, res) => {
  const { entryId, noteId } = req.query;
  let session = null;
  if (entryId) {
    session = db.prepare(
      'SELECT * FROM oracle_sessions WHERE source_entry_id = ? AND user_id = ?'
    ).get(entryId, req.userId);
  } else if (noteId) {
    session = db.prepare(
      'SELECT * FROM oracle_sessions WHERE source_note_id = ? AND user_id = ?'
    ).get(noteId, req.userId);
  }
  if (!session) return res.json({ session: null });
  res.json({ session: sessionRow(session) });
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
  ).run(session.id, 'user', encryptField(req.userId, content.trim()), activeArchetype);

  // Auto-generate title from first user message
  const msgCount = db.prepare(
    "SELECT COUNT(*) AS n FROM oracle_messages WHERE session_id = ? AND role = 'user'"
  ).get(session.id).n;
  if (msgCount === 1) {
    const title = content.trim().slice(0, 80);
    db.prepare('UPDATE oracle_sessions SET title = ? WHERE id = ?').run(title, session.id);
  }

  // Load full conversation history, filtering out empty responses. Messages on
  // disk are encrypted per-user, so we decrypt before handing them to the LLM.
  // No row cap — Ollama enforces num_ctx and trims oldest turns gracefully when
  // the prompt exceeds the window. A SQL LIMIT here previously dropped the
  // user's just-inserted message once a session passed 30 messages, producing
  // empty model responses that looked like refusals.
  const history = db.prepare(
    "SELECT role, content FROM oracle_messages WHERE session_id = ? AND content != '' ORDER BY created_at ASC"
  ).all(session.id).map((m) => ({ ...m, content: safeDecrypt(req.userId, m.content) }));

  try {
    // Pass the user's most recent message as the retrieval context so memory
    // injection pulls topically relevant memories instead of a static blob.
    const lastUserMessage = [...history].reverse().find((m) => m.role === 'user')?.content || '';
    const systemPrompt = await memory.buildOracleSystemPrompt(req.userId, activeArchetype, session, lastUserMessage);
    const answer = await llm.callWithHistoryAndTools(systemPrompt, history, { maxTokens: 400 });
    const trimmed = answer.trim();

    if (!trimmed) {
      return res.status(502).json({ error: 'Model returned an empty response. Try again or switch models in Settings.' });
    }

    const assistantResult = db.prepare(
      'INSERT INTO oracle_messages (session_id, role, content, archetype) VALUES (?, ?, ?, ?)'
    ).run(session.id, 'assistant', encryptField(req.userId, trimmed), activeArchetype);

    const assistantMsg = db.prepare(
      'SELECT * FROM oracle_messages WHERE id = ?'
    ).get(assistantResult.lastInsertRowid);

    res.json({ ...assistantMsg, content: safeDecrypt(req.userId, assistantMsg.content) });

    // Rosary bead: thread this conversation into the graph. Throttled so a
    // 30-turn chat doesn't fire 30 LLM match calls — thread on the 1st
    // assistant reply, then every 5th (5, 10, 15…) to catch shape changes.
    const assistantCount = db.prepare(
      "SELECT COUNT(*) AS n FROM oracle_messages WHERE session_id = ? AND role = 'assistant'"
    ).get(session.id).n;
    if (assistantCount === 1 || (assistantCount > 0 && assistantCount % 5 === 0)) {
      const userId = req.userId;
      setImmediate(() => {
        threadService.threadSingleItem('conversation', session.id, userId).catch((err) => {
          console.error('[oracle] thread bead failed:', err.message);
        });
      });
    }
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
  // Clear any inbound entry / note links that point at this session before
  // dropping it. Without this, `entries.linked_session_id` and
  // `notes.linked_session_id` stay set to the now-orphaned session id and
  // the journal entry keeps showing a "Continue conversation" affordance
  // that opens a ghost session.
  db.prepare('UPDATE entries SET linked_session_id = NULL WHERE linked_session_id = ? AND user_id = ?')
    .run(session.id, req.userId);
  db.prepare('UPDATE notes SET linked_session_id = NULL WHERE linked_session_id = ? AND user_id = ?')
    .run(session.id, req.userId);
  db.prepare('DELETE FROM oracle_sessions WHERE id = ?').run(session.id);
  res.json({ success: true });
});

module.exports = router;
