const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { invalidateSynthesisCache, extractAndStoreMemories } = require('../services/memoryService');
const { encryptField, safeDecrypt } = require('../services/rowCrypto');

router.use(requireAuth);

// ── Extract-all progress tracker (per-user, in-memory) ───────────────────────
// Running an LLM call per entry is slow (tens of minutes for a few hundred
// entries), so the long job runs in the background and the UI polls
// /extract-status for progress.
const extractJobs = new Map(); // userId -> { running, done, total, startedAt, finishedAt, error }

// ── GET /api/memories ────────────────────────────────────────────────────────
//
// Query params:
//   ?thread_id=N     filter to memories whose source entry belongs to thread N
//                    (JOIN through thread_nodes; entry-derived membership for
//                    now — until/if we add per-memory thread rows).
//
// Returns each memory with its membership in canonical threads as
// `thread_ids: number[]` so the client can render thread filter pills and
// colour memory rows by thread without additional round-trips.
router.get('/', (req, res) => {
  const threadId = req.query.thread_id ? parseInt(req.query.thread_id, 10) : null;

  // Filter clause: a memory matches the requested thread if EITHER its
  // manual_thread_id matches (manual override) OR (no manual override AND
  // source-entry-derived membership matches). The manual override fully
  // replaces the auto-derived membership when set.
  const threadFilterClause = threadId
    ? `AND (
         m.manual_thread_id = ?
         OR (m.manual_thread_id IS NULL AND m.id IN (
              SELECT mem.id FROM memories mem
                INNER JOIN thread_nodes tn ON tn.content_type = 'entry' AND tn.content_id = mem.source_entry_id
              WHERE mem.user_id = ? AND tn.thread_id = ?
            ))
       )`
    : '';

  const params = threadId
    ? [req.userId, threadId, req.userId, threadId]
    : [req.userId];

  const rows = db.prepare(`
    SELECT m.*,
           COALESCE(e.date, e.created_at, m.created_at) AS effective_date
      FROM memories m
      LEFT JOIN entries e ON e.id = m.source_entry_id
     WHERE m.user_id = ?
       ${threadFilterClause}
     ORDER BY m.is_core DESC,
              COALESCE(e.date, e.created_at, m.created_at) DESC
  `).all(...params).map((m) => ({ ...m, content: safeDecrypt(req.userId, m.content) }));

  // Annotate each memory with its effective canonical thread ids:
  //   - if manual_thread_id is set: just that one (override fully replaces)
  //   - otherwise: thread ids derived from the source entry's thread_nodes
  // Single JOIN for the auto-derived case; the manual case is a direct read.
  const memIds = rows.map((m) => m.id);
  if (memIds.length) {
    const autoMemIds = rows.filter((m) => !m.manual_thread_id).map((m) => m.id);
    const byMem = new Map();
    if (autoMemIds.length) {
      const placeholders = autoMemIds.map(() => '?').join(',');
      const links = db.prepare(`
        SELECT mem.id AS memory_id, tn.thread_id
          FROM memories mem
          INNER JOIN thread_nodes tn ON tn.content_type = 'entry' AND tn.content_id = mem.source_entry_id
          INNER JOIN threads th ON th.id = tn.thread_id AND th.kind = 'canonical'
         WHERE mem.user_id = ? AND mem.id IN (${placeholders})
      `).all(req.userId, ...autoMemIds);
      for (const l of links) {
        if (!byMem.has(l.memory_id)) byMem.set(l.memory_id, []);
        byMem.get(l.memory_id).push(l.thread_id);
      }
    }
    for (const m of rows) {
      if (m.manual_thread_id) {
        m.thread_ids = [m.manual_thread_id];
      } else {
        m.thread_ids = byMem.get(m.id) || [];
      }
    }
  }

  res.json(rows);
});

// ── PUT /api/memories/:id/thread ─────────────────────────────────────────────
// Set or clear the manual thread override for a memory. Body: { thread_id }
// — pass null to revert to auto-derived membership.
router.put('/:id/thread', (req, res) => {
  const existing = db.prepare('SELECT id FROM memories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Memory not found' });

  const { thread_id } = req.body || {};
  let value = null;
  if (thread_id != null) {
    const tid = parseInt(thread_id, 10);
    if (!Number.isFinite(tid)) return res.status(400).json({ error: 'thread_id must be a number or null' });
    // Confirm the thread exists and belongs to this user; otherwise reject.
    const thread = db.prepare('SELECT id FROM threads WHERE id = ? AND user_id = ?').get(tid, req.userId);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    value = tid;
  }

  db.prepare('UPDATE memories SET manual_thread_id = ? WHERE id = ? AND user_id = ?').run(value, req.params.id, req.userId);
  invalidateSynthesisCache(req.userId);
  const updated = db.prepare('SELECT * FROM memories WHERE id = ?').get(req.params.id);
  res.json({ ...updated, content: safeDecrypt(req.userId, updated.content) });
});

// ── POST /api/memories ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });

  const trimmed = content.trim();
  const normalize = (s) => s.toLowerCase().trim().replace(/\n/g, ' ').replace(/  /g, ' ');
  const normalized = normalize(trimmed);

  // Dedupe in-memory: content is stored encrypted so we can't compare
  // ciphertexts in SQL. Scan this user's rows, decrypt, and compare.
  const candidates = db.prepare('SELECT * FROM memories WHERE user_id = ?').all(req.userId);
  const existing = candidates.find((r) => normalize(safeDecrypt(req.userId, r.content) || '') === normalized);
  if (existing) return res.status(200).json({ ...existing, content: safeDecrypt(req.userId, existing.content) });

  const result = db.prepare(
    'INSERT INTO memories (user_id, content, pinned) VALUES (?, ?, 1)'
  ).run(req.userId, encryptField(req.userId, trimmed));

  invalidateSynthesisCache(req.userId);
  const created = db.prepare('SELECT * FROM memories WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...created, content: safeDecrypt(req.userId, created.content) });
});

// ── PUT /api/memories/:id ────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM memories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Memory not found' });

  const { content, pinned, is_core, status } = req.body;
  const fields = [];
  const params = [];

  if (content !== undefined) { fields.push('content = ?'); params.push(encryptField(req.userId, content.trim())); }
  if (pinned !== undefined)  { fields.push('pinned = ?');  params.push(pinned ? 1 : 0); }
  if (is_core !== undefined) { fields.push('is_core = ?'); params.push(is_core ? 1 : 0); }
  // status: 'active' | 'resolved'. Coerce unknown values to 'active' to keep
  // the column clean even if a future client sends bad data.
  if (status !== undefined)  { fields.push('status = ?');  params.push(status === 'resolved' ? 'resolved' : 'active'); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id, req.userId);
  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  invalidateSynthesisCache(req.userId);
  const updated = db.prepare('SELECT * FROM memories WHERE id = ?').get(req.params.id);
  res.json({ ...updated, content: safeDecrypt(req.userId, updated.content) });
});

// ── DELETE /api/memories/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM memories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Memory not found' });

  db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  invalidateSynthesisCache(req.userId);
  res.json({ success: true });
});

// ── DELETE /api/memories ─────────────────────────────────────────────────────
// Default: clears auto-extracted items only (preserves pinned).
// ?all=true clears everything (requires password).
router.delete('/', async (req, res) => {
  if (req.query.all === 'true') {
    // Full wipe requires password verification
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Password required to delete all memories' });

    const bcrypt = require('bcryptjs');
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    db.prepare('DELETE FROM memories WHERE user_id = ?').run(req.userId);
    db.prepare('DELETE FROM memory WHERE user_id = ?').run(req.userId);
  } else {
    db.prepare('DELETE FROM memories WHERE user_id = ? AND pinned = 0').run(req.userId);
  }
  invalidateSynthesisCache(req.userId);
  res.json({ success: true });
});

// ── POST /api/memories/extract-all ───────────────────────────────────────────
// Kick off background extraction of memories from every journal entry that
// hasn't been processed yet. Responds immediately with { started, total }.
// Progress is polled via /extract-status.
router.post('/extract-all', (req, res) => {
  const existing = extractJobs.get(req.userId);
  if (existing?.running) {
    return res.json({ started: false, running: true, done: existing.done, total: existing.total });
  }

  // Only process entries we haven't already pulled memories from, so re-runs
  // are incremental and don't re-bill the LLM for work already done.
  const entries = db.prepare(
    `SELECT e.id, e.body_text
       FROM entries e
       LEFT JOIN (
         SELECT DISTINCT source_entry_id FROM memories
           WHERE user_id = ? AND source_entry_id IS NOT NULL
       ) m ON m.source_entry_id = e.id
       WHERE e.user_id = ?
         AND m.source_entry_id IS NULL
         AND COALESCE(e.body_text, '') != ''
       ORDER BY e.created_at DESC`
  ).all(req.userId, req.userId);

  if (entries.length === 0) {
    return res.json({ started: false, total: 0, message: 'All entries already processed' });
  }

  const job = {
    running: true,
    done: 0,
    total: entries.length,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
  extractJobs.set(req.userId, job);

  const userId = req.userId;
  setImmediate(async () => {
    try {
      // Best-effort portrait string — fall back to empty if anything in the
      // portrait lookup throws, so one missing field doesn't kill the job.
      let portraitStr = '';
      try {
        const reflect = require('./reflect');
        // reflect.js's buildPortraitString isn't exported — the extractor
        // works fine with an empty portrait, so skip rather than duplicate
        // that helper here.
        portraitStr = '';
      } catch {}

      for (const e of entries) {
        try {
          await extractAndStoreMemories(e.body_text || '', portraitStr, userId, e.id);
        } catch (err) {
          console.error(`[memories/extract-all] entry ${e.id} failed:`, err.message);
        }
        job.done += 1;
      }
      job.running = false;
      job.finishedAt = new Date().toISOString();
      console.log(`[memories/extract-all] user ${userId}: finished ${job.done}/${job.total}`);
    } catch (err) {
      job.running = false;
      job.error = err.message;
      job.finishedAt = new Date().toISOString();
      console.error('[memories/extract-all] failed:', err.message);
    }
  });

  res.json({ started: true, total: entries.length });
});

// ── POST /api/memories/embed-all ─────────────────────────────────────────────
// Backfill the memory embedding index. Walks all memories, embeds each via
// the local MiniLM pipeline, stores in the `vectra-memories/` Vectra index.
// Idempotent — already-indexed memories skip unless { force: true } is sent.
// New memories are indexed live by extractAndStoreMemories so this is only
// needed once after upgrading to the relevance-retrieval architecture (or
// any time the index gets wiped).
const embedJobs = new Map(); // userId -> { running, done, total, embedded, skipped, failed, startedAt, finishedAt, error }

router.post('/embed-all', async (req, res) => {
  const existing = embedJobs.get(req.userId);
  if (existing?.running) {
    return res.json({
      started: false, running: true,
      done: existing.done, total: existing.total,
      embedded: existing.embedded, skipped: existing.skipped, failed: existing.failed,
    });
  }

  const force = req.body?.force === true;
  const rows = db.prepare('SELECT id, content FROM memories WHERE user_id = ? ORDER BY id ASC').all(req.userId);
  if (rows.length === 0) {
    return res.json({ started: false, total: 0, message: 'No memories to index' });
  }

  // Find which memory ids are already in the index, so we can skip them.
  let alreadyIndexed = new Set();
  if (!force) {
    try {
      const { LocalIndex } = await import('vectra');
      const path = require('path');
      const { DATA_DIR } = require('../paths');
      const indexDir = path.join(DATA_DIR, 'vectra-memories');
      const index = new LocalIndex(indexDir);
      if (await index.isIndexCreated()) {
        const items = await index.listItems();
        alreadyIndexed = new Set(items.map((i) => i.metadata?.memoryId).filter((id) => id != null));
      }
    } catch (err) {
      console.warn('[memories/embed-all] could not enumerate existing index:', err.message);
    }
  }

  const job = {
    running: true,
    done: 0,
    total: rows.length,
    embedded: 0,
    skipped: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
  embedJobs.set(req.userId, job);

  const userId = req.userId;
  setImmediate(async () => {
    try {
      const embedding = require('../services/embeddingService');
      for (const row of rows) {
        if (!force && alreadyIndexed.has(row.id)) {
          job.skipped += 1;
          job.done += 1;
          continue;
        }
        const content = safeDecrypt(userId, row.content);
        if (!content || !content.trim()) {
          job.failed += 1;
          job.done += 1;
          continue;
        }
        const ok = await embedding.indexMemory(row.id, content.trim());
        if (ok) job.embedded += 1; else job.failed += 1;
        job.done += 1;
      }
      job.running = false;
      job.finishedAt = new Date().toISOString();
      console.log(`[memories/embed-all] user ${userId}: ${job.embedded} embedded, ${job.skipped} skipped, ${job.failed} failed`);
    } catch (err) {
      job.running = false;
      job.error = err.message;
      job.finishedAt = new Date().toISOString();
      console.error('[memories/embed-all] failed:', err.message);
    }
  });

  res.json({ started: true, total: rows.length, alreadyIndexed: alreadyIndexed.size });
});

// ── GET /api/memories/embed-status ───────────────────────────────────────────
router.get('/embed-status', (req, res) => {
  const job = embedJobs.get(req.userId);
  if (!job) return res.json({ running: false, done: 0, total: 0, embedded: 0, skipped: 0, failed: 0 });
  res.json({
    running: job.running,
    done: job.done,
    total: job.total,
    embedded: job.embedded,
    skipped: job.skipped,
    failed: job.failed,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
  });
});

// ── GET /api/memories/extract-status ─────────────────────────────────────────
router.get('/extract-status', (req, res) => {
  const job = extractJobs.get(req.userId);
  if (!job) return res.json({ running: false, done: 0, total: 0 });
  res.json({
    running: job.running,
    done: job.done,
    total: job.total,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
  });
});

module.exports = router;
