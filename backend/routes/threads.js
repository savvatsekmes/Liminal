const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const threadService = require('../services/threadService');
const { encryptField, safeDecrypt } = require('../services/rowCrypto');

function decryptThread(userId, row) {
  if (!row) return row;
  if (row.name !== undefined) row.name = safeDecrypt(userId, row.name);
  if (row.description !== undefined) row.description = safeDecrypt(userId, row.description);
  if (row.insight !== undefined) row.insight = safeDecrypt(userId, row.insight);
  return row;
}

router.use(requireAuth);

// Per-user background job tracker for the long-running detect+insight flow.
// Mirrors the pattern in routes/memories.js.
const detectJobs = new Map();
// userId -> { running, phase, done, total, startedAt, finishedAt, error }

// ── GET /api/threads ─────────────────────────────────────────────────────────
// List threads with node counts and date ranges for the sidebar.
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT t.*,
           COUNT(n.id) AS node_count,
           MIN(n.created_at) AS first_node_at,
           MAX(n.created_at) AS last_node_at
      FROM threads t
      LEFT JOIN thread_nodes n ON n.thread_id = t.id
     WHERE t.user_id = ?
     GROUP BY t.id
     ORDER BY
       CASE t.kind WHEN 'canonical' THEN 0 WHEN 'custom' THEN 1 ELSE 2 END,
       (t.status = 'active') DESC,
       t.updated_at DESC
  `).all(req.userId).map((r) => decryptThread(req.userId, r));
  res.json(rows);
});

// ── GET /api/threads/detect-status ──────────────────────────────────────────
router.get('/detect-status', (req, res) => {
  const job = detectJobs.get(req.userId);
  if (!job) return res.json({ running: false, phase: 'idle', done: 0, total: 0 });
  res.json({
    running: job.running,
    phase: job.phase,
    done: job.done,
    total: job.total,
    currentTheme: job.currentTheme || '',
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
  });
});

// ── POST /api/threads/detect ─────────────────────────────────────────────────
// Wipe-and-regenerate: clear this user's threads and re-detect from scratch.
router.post('/detect', (req, res) => {
  const existing = detectJobs.get(req.userId);
  if (existing?.running) {
    return res.json({ started: false, running: true, phase: existing.phase, done: existing.done, total: existing.total });
  }

  const job = {
    running: true,
    phase: 'detecting',
    done: 0,
    total: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
  detectJobs.set(req.userId, job);

  const userId = req.userId;
  setImmediate(async () => {
    try {
      const corpus = threadService.collectCorpus(userId);
      if (!corpus.length) {
        threadService.wipeThreadsForUser(userId);
        job.running = false;
        job.phase = 'done';
        job.finishedAt = new Date().toISOString();
        return;
      }

      const detected = await threadService.detectThreadsFromCorpus(corpus, (done, total, themeName) => {
        job.phase = 'matching';
        job.done = done;
        job.total = total;
        job.currentTheme = themeName || '';
      });

      threadService.wipeThreadsForUser(userId);
      const threadIds = threadService.persistThreads(userId, detected);

      // Guarantee every canonical seed exists after a full re-detect — if the
      // LLM didn't match ≥2 items to one, it still lives on as an empty
      // thread that future beads can join.
      threadService.ensureCanonicalThreadsExist(userId);

      job.phase = 'generating-insights';
      job.total = threadIds.length;
      job.done = 0;

      for (const id of threadIds) {
        try {
          await threadService.regenerateInsightForThread(id, userId);
        } catch (err) {
          console.error(`[threads/detect] insight for thread ${id} failed:`, err.message);
        }
        job.done += 1;
      }

      // Stamp every item as threaded so the incremental pipeline picks up from
      // here — no orphans, no re-threading of already-matched items.
      threadService.stampAllThreaded(userId);

      job.running = false;
      job.phase = 'done';
      job.finishedAt = new Date().toISOString();
      console.log(`[threads/detect] user ${userId}: ${threadIds.length} threads`);
    } catch (err) {
      job.running = false;
      job.phase = 'error';
      job.error = err.message;
      job.finishedAt = new Date().toISOString();
      console.error('[threads/detect] failed:', err.message);
    }
  });

  res.json({ started: true });
});

// ── GET /api/threads/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const thread = decryptThread(req.userId,
    db.prepare('SELECT * FROM threads WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
  );
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  const nodes = threadService.getHydratedNodes(thread.id, req.userId);
  res.json({ ...thread, nodes });
});

// ── PUT /api/threads/:id ─────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM threads WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Thread not found' });

  const { name, status, insight, description, weight } = req.body || {};
  const fields = [];
  const params = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(encryptField(req.userId, String(name).trim().slice(0, 120))); }
  if (description !== undefined) { fields.push('description = ?'); params.push(encryptField(req.userId, String(description).trim().slice(0, 400))); }
  if (status !== undefined && ['active', 'resolving', 'complete'].includes(status)) {
    fields.push('status = ?'); params.push(status);
  }
  if (weight !== undefined && ['light', 'medium', 'heavy'].includes(weight)) {
    fields.push('weight = ?'); params.push(weight);
  }
  if (insight !== undefined) { fields.push('insight = ?'); params.push(encryptField(req.userId, String(insight))); }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id, req.userId);
  db.prepare(`UPDATE threads SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  res.json(decryptThread(req.userId, db.prepare('SELECT * FROM threads WHERE id = ?').get(req.params.id)));
});

// ── DELETE /api/threads/:id ──────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM threads WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Thread not found' });
  db.prepare('DELETE FROM threads WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

// ── POST /api/threads ────────────────────────────────────────────────────────
// Create a user-defined custom thread and immediately match items to it.
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Thread name required' });
    }
    const threadId = await threadService.createCustomThread(req.userId, name, description);
    const thread = decryptThread(req.userId, db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId));
    res.json(thread);
  } catch (err) {
    console.error('[threads/create] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/threads/:id/rematch ────────────────────────────────────────────
// Re-run item matching for a single existing thread (and refresh its insight).
router.post('/:id/rematch', async (req, res) => {
  try {
    const result = await threadService.rematchThread(req.params.id, req.userId);
    if (result === null) return res.status(404).json({ error: 'Thread not found' });
    res.json(result);
  } catch (err) {
    console.error('[threads/rematch] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/threads/:id/insight ────────────────────────────────────────────
router.post('/:id/insight', async (req, res) => {
  try {
    const insight = await threadService.regenerateInsightForThread(req.params.id, req.userId);
    if (insight === null) return res.status(404).json({ error: 'Thread not found' });
    res.json({ insight });
  } catch (err) {
    console.error('[threads/insight] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/threads/sweep ─────────────────────────────────────────────────
// Incremental safety-net sweep: threads any item with `threaded_at IS NULL`
// (bounded to 20 per invocation) and then clusters orphans into novel themes.
// Called from the before-quit hook and available as a manual trigger.
router.post('/sweep', (req, res) => {
  const existing = detectJobs.get(req.userId);
  if (existing?.running) {
    return res.json({ started: false, running: true, phase: existing.phase });
  }

  const job = {
    running: true,
    phase: 'sweeping',
    done: 0,
    total: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
  detectJobs.set(req.userId, job);

  const userId = req.userId;
  setImmediate(async () => {
    try {
      const { processed, promoted } = await threadService.sweepUnthreaded(userId, 20);
      job.done = processed;
      job.total = processed;
      job.running = false;
      job.phase = 'done';
      job.finishedAt = new Date().toISOString();
      console.log(`[threads/sweep] user ${userId}: processed=${processed} promoted=${promoted}`);
    } catch (err) {
      job.running = false;
      job.phase = 'error';
      job.error = err.message;
      job.finishedAt = new Date().toISOString();
      console.error('[threads/sweep] failed:', err.message);
    }
  });

  res.json({ started: true });
});

module.exports = router;
