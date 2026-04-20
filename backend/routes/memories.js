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
router.get('/', (req, res) => {
  // effective_date = the source entry's date when this memory was extracted
  // from an entry, falling back to the memory's own created_at for manually
  // added memories. This gives each memory the age of the life-moment it
  // describes rather than the moment the extractor happened to run.
  const rows = db.prepare(`
    SELECT m.*,
           COALESCE(e.date, e.created_at, m.created_at) AS effective_date
      FROM memories m
      LEFT JOIN entries e ON e.id = m.source_entry_id
     WHERE m.user_id = ?
     ORDER BY m.is_core DESC,
              COALESCE(e.date, e.created_at, m.created_at) DESC
  `).all(req.userId).map((m) => ({ ...m, content: safeDecrypt(req.userId, m.content) }));
  res.json(rows);
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

  const { content, pinned, is_core } = req.body;
  const fields = [];
  const params = [];

  if (content !== undefined) { fields.push('content = ?'); params.push(encryptField(req.userId, content.trim())); }
  if (pinned !== undefined)  { fields.push('pinned = ?');  params.push(pinned ? 1 : 0); }
  if (is_core !== undefined) { fields.push('is_core = ?'); params.push(is_core ? 1 : 0); }

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
