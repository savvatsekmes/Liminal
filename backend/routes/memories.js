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

// ── POST /api/memories/dedup ─────────────────────────────────────────────────
// In-app version of backend/scripts/dedupMemories.js. Embeds every memory,
// clusters by cosine similarity, keeps a canonical winner per cluster, and
// archives the losers into memories_archive. Runs in-process (no electron-
// vs-system-Node ABI issues) so the user can trigger it from the Memory page.
const dedupJobs = new Map(); // userId -> { running, done, total, archived, kept, startedAt, finishedAt, error }

router.post('/dedup', async (req, res) => {
  const existing = dedupJobs.get(req.userId);
  if (existing?.running) {
    return res.json({ started: false, running: true, ...existing });
  }

  const threshold = Number(req.body?.threshold) || 0.88;
  const dryRun = req.body?.dryRun === true;

  const job = {
    running: true,
    done: 0,
    total: 0,
    archived: 0,
    kept: 0,
    threshold,
    dryRun,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
  dedupJobs.set(req.userId, job);

  const userId = req.userId;
  res.json({ started: true, threshold, dryRun });

  setImmediate(async () => {
    try {
      const path = require('path');
      const fs = require('fs');
      const embedding = require('../services/embeddingService');
      const { DATA_DIR } = require('../paths');

      // Mirror dedupMemories.js: idempotent archive table.
      db.exec(`
        CREATE TABLE IF NOT EXISTS memories_archive (
          id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          is_core INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          source_entry_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          archive_reason TEXT NOT NULL DEFAULT 'dedup',
          kept_canonical_id INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_memories_archive_user ON memories_archive(user_id);
      `);

      const rows = db.prepare(`
        SELECT m.*, COALESCE(e.date, e.created_at, m.created_at) AS effective_date
          FROM memories m
          LEFT JOIN entries e ON e.id = m.source_entry_id
         WHERE m.user_id = ?
         ORDER BY m.id ASC
      `).all(userId);

      const decoded = rows.map((r) => ({ ...r, content: safeDecrypt(userId, r.content) || '' }))
        .filter((r) => r.content.trim().length > 0);

      job.total = decoded.length;
      if (!decoded.length) {
        job.running = false;
        job.finishedAt = new Date().toISOString();
        return;
      }

      // Embed every memory. ~5-15ms each on CPU.
      const withVectors = [];
      for (let i = 0; i < decoded.length; i++) {
        const m = decoded[i];
        try {
          m.vector = await embedding.embed(m.content);
          withVectors.push(m);
        } catch (err) {
          console.warn(`[dedup] failed to embed memory ${m.id}: ${err.message}`);
        }
        job.done = i + 1;
      }

      // Greedy clustering — same as dedupMemories.js.
      const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
      const clusters = [];
      for (const m of withVectors) {
        let joined = false;
        for (const c of clusters) {
          if (cosine(m.vector, c.seedVec) >= threshold) { c.members.push(m); joined = true; break; }
        }
        if (!joined) clusters.push({ seedVec: m.vector, members: [m] });
      }

      const pickCanonical = (cluster) => [...cluster].sort((a, b) => {
        if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
        if ((b.is_core || 0) !== (a.is_core || 0)) return (b.is_core || 0) - (a.is_core || 0);
        const aD = new Date(a.effective_date || a.created_at || 0).getTime();
        const bD = new Date(b.effective_date || b.created_at || 0).getTime();
        if (aD !== bD) return bD - aD;
        return a.id - b.id;
      })[0];

      const dupClusters = clusters.filter((c) => c.members.length > 1);
      const losers = [];
      for (const c of dupClusters) {
        const canonical = pickCanonical(c.members);
        for (const m of c.members) {
          if (m.id !== canonical.id) losers.push({ ...m, kept_canonical_id: canonical.id });
        }
      }

      job.archived = losers.length;
      job.kept = withVectors.length - losers.length;

      if (dryRun || losers.length === 0) {
        job.running = false;
        job.finishedAt = new Date().toISOString();
        console.log(`[memories/dedup] user ${userId}: ${dryRun ? 'dry-run' : 'no-op'} — ${job.archived} would-archive, ${job.kept} keep`);
        return;
      }

      // Backup before any writes.
      const backupDir = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `memories-pre-dedup-${userId}-${ts}.json`);
      const losersForBackup = losers.map(({ vector, ...rest }) => rest);
      fs.writeFileSync(backupPath, JSON.stringify({
        userId, threshold, timestamp: ts,
        canonicalKept: dupClusters.length, archived: losers.length,
        losers: losersForBackup,
      }, null, 2));

      const insertArchive = db.prepare(`
        INSERT INTO memories_archive (id, user_id, content, pinned, is_core, status, source_entry_id, created_at, archive_reason, kept_canonical_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'dedup', ?)
      `);
      const deleteMemory = db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?');

      const tx = db.transaction((arr) => {
        for (const m of arr) {
          const raw = rows.find((r) => r.id === m.id);
          insertArchive.run(
            m.id, userId, raw.content, m.pinned || 0, m.is_core || 0,
            m.status || 'active', m.source_entry_id || null, m.created_at,
            m.kept_canonical_id || null
          );
          deleteMemory.run(m.id, userId);
        }
      });
      tx(losers);

      // Drop archived ids from the Vectra index too — they should not appear
      // in retrieval results going forward.
      Promise.all(losers.map((m) => embedding.unindexMemory(m.id))).catch(() => {});

      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(`memory_dirty_${userId}`);

      job.running = false;
      job.finishedAt = new Date().toISOString();
      console.log(`[memories/dedup] user ${userId}: archived ${job.archived}, kept ${job.kept}, backup ${backupPath}`);
    } catch (err) {
      job.running = false;
      job.error = err.message;
      job.finishedAt = new Date().toISOString();
      console.error('[memories/dedup] failed:', err.message);
    }
  });
});

// ── POST /api/memories/dedup-restore ─────────────────────────────────────────
// Move every dedup-archived row back into the live memories table. Keeps the
// original ids so existing references (source_entry_id back-pointers) stay
// intact. After restore, the Vectra index needs a rebuild — done here too,
// fire-and-forget, so the UI doesn't have to chain calls.
router.post('/dedup-restore', (req, res) => {
  // Make sure the archive table exists — if not, nothing to restore.
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories_archive (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      is_core INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      source_entry_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      archive_reason TEXT NOT NULL DEFAULT 'dedup',
      kept_canonical_id INTEGER
    )
  `);

  const archived = db.prepare(
    "SELECT * FROM memories_archive WHERE user_id = ? AND archive_reason = 'dedup'"
  ).all(req.userId);

  if (archived.length === 0) {
    return res.json({ restored: 0, message: 'No dedup-archived memories to restore.' });
  }

  // Some original ids may already exist in `memories` (the canonical winner
  // we kept). INSERT OR IGNORE so we don't crash on those — the canonical
  // already lives there.
  const insertBack = db.prepare(`
    INSERT OR IGNORE INTO memories (id, user_id, content, pinned, source_entry_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const removeArchive = db.prepare("DELETE FROM memories_archive WHERE id = ? AND user_id = ?");

  let restored = 0;
  const tx = db.transaction(() => {
    for (const a of archived) {
      const result = insertBack.run(a.id, a.user_id, a.content, a.pinned || 0, a.source_entry_id || null, a.created_at);
      if (result.changes > 0) restored++;
      removeArchive.run(a.id, a.user_id);
    }
  });
  tx();

  // Mark synthesis cache dirty + rebuild the memory embed index in the
  // background so retrieval picks up the restored rows.
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(`memory_dirty_${req.userId}`);

  setImmediate(async () => {
    try {
      const embedding = require('../services/embeddingService');
      const rows = db.prepare('SELECT id, content FROM memories WHERE user_id = ?').all(req.userId);
      for (const r of rows) {
        const text = safeDecrypt(req.userId, r.content);
        if (text && text.trim()) await embedding.indexMemory(r.id, text.trim());
      }
      console.log(`[memories/dedup-restore] re-indexed ${rows.length} memories after restore`);
    } catch (err) {
      console.warn('[memories/dedup-restore] re-index failed:', err.message);
    }
  });

  console.log(`[memories/dedup-restore] user ${req.userId}: restored ${restored} memories`);
  res.json({ restored, total: archived.length, message: `Restored ${restored} memories. Re-indexing in background.` });
});

router.get('/dedup-status', (req, res) => {
  const job = dedupJobs.get(req.userId);
  if (!job) return res.json({ running: false, done: 0, total: 0, archived: 0, kept: 0 });
  res.json({
    running: job.running,
    done: job.done,
    total: job.total,
    archived: job.archived,
    kept: job.kept,
    threshold: job.threshold,
    dryRun: job.dryRun,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
  });
});

module.exports = router;
