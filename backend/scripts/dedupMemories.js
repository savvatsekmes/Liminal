#!/usr/bin/env node
/**
 * One-shot deduplication for the `memories` table.
 *
 * Reads all memories for a user, embeds each via the existing local MiniLM
 * pipeline, clusters by cosine similarity above a threshold, keeps a single
 * canonical memory per cluster (preferring pinned > is_core > most-recent >
 * first-inserted), and moves the losers into a `memories_archive` table.
 *
 * The archive table is created idempotently so repeat runs work cleanly. A
 * timestamped JSON snapshot of every affected memory is also written under
 * `data/backups/` before any DB writes — belt-and-suspenders. Nothing is
 * hard-deleted; the canonical SELECT-everything-from-memories-then-do-stuff
 * is recoverable from the archive table at any time.
 *
 * USAGE
 *   node backend/scripts/dedupMemories.js [options]
 *
 *   --user-id=N          Run for a specific user only (default: all users)
 *   --threshold=0.88     Cosine similarity threshold (default 0.88)
 *   --dry-run            Compute clusters and print them; don't touch the DB
 *   --verbose            Print every cluster, not just the summary
 *
 * EXAMPLES
 *   # Inspect what would be merged at the default threshold:
 *   node backend/scripts/dedupMemories.js --user-id=1 --dry-run --verbose
 *
 *   # Tighten the threshold (less aggressive merging):
 *   node backend/scripts/dedupMemories.js --user-id=1 --threshold=0.92 --dry-run
 *
 *   # Commit the merge once you're happy with the dry-run output:
 *   node backend/scripts/dedupMemories.js --user-id=1 --threshold=0.88
 */

const path = require('path');
const fs = require('fs');
const db = require('../database');
const embedding = require('../services/embeddingService');
const { safeDecrypt } = require('../services/rowCrypto');
const { DATA_DIR } = require('../paths');

// ── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { userId: null, threshold: 0.88, dryRun: false, verbose: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--verbose') out.verbose = true;
    else if (arg.startsWith('--user-id=')) out.userId = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--threshold=')) out.threshold = parseFloat(arg.split('=')[1]);
    else if (arg === '--help' || arg === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').match(/USAGE[\s\S]*?\*\//)[0].replace(/\*\//, ''));
      process.exit(0);
    }
  }
  return out;
}

// ── Schema setup ─────────────────────────────────────────────────────────────

function ensureArchiveTable() {
  // Mirror the memories table. Add archived_at + archive_reason columns so we
  // can tell archived rows apart by *why* they were archived (dedup vs future
  // age-archive features). Idempotent.
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
}

// ── Cosine similarity ────────────────────────────────────────────────────────

function cosine(a, b) {
  // Vectors are L2-normalized by the pipeline, so cosine = dot product.
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ── Canonical selection ──────────────────────────────────────────────────────

function pickCanonical(cluster) {
  // Highest priority wins:
  // 1. pinned (user-curated)
  // 2. is_core (user-flagged core)
  // 3. most-recent effective_date / created_at
  // 4. lowest id (first-inserted) as tiebreaker
  return [...cluster].sort((a, b) => {
    if ((b.pinned || 0) !== (a.pinned || 0)) return (b.pinned || 0) - (a.pinned || 0);
    if ((b.is_core || 0) !== (a.is_core || 0)) return (b.is_core || 0) - (a.is_core || 0);
    const aDate = new Date(a.effective_date || a.created_at || 0).getTime();
    const bDate = new Date(b.effective_date || b.created_at || 0).getTime();
    if (aDate !== bDate) return bDate - aDate;
    return a.id - b.id;
  })[0];
}

// ── Greedy clustering ────────────────────────────────────────────────────────

function clusterMemories(memories, threshold) {
  // Greedy walk: each memory either joins an existing cluster (if it's above
  // threshold against any earlier cluster's seed) or seeds a new one. Seeds
  // are the first member; that's deterministic and good enough at this scale.
  const clusters = []; // array of { seedVec, members: [memory] }
  for (const m of memories) {
    let joined = false;
    for (const c of clusters) {
      if (cosine(m.vector, c.seedVec) >= threshold) {
        c.members.push(m);
        joined = true;
        break;
      }
    }
    if (!joined) {
      clusters.push({ seedVec: m.vector, members: [m] });
    }
  }
  return clusters;
}

// ── Main per-user run ────────────────────────────────────────────────────────

async function runForUser(userId, options) {
  const t0 = Date.now();
  const rows = db.prepare(`
    SELECT m.*, COALESCE(e.date, e.created_at, m.created_at) AS effective_date
      FROM memories m
      LEFT JOIN entries e ON e.id = m.source_entry_id
     WHERE m.user_id = ?
     ORDER BY m.id ASC
  `).all(userId);

  if (rows.length === 0) {
    console.log(`[dedup] user ${userId}: no memories.`);
    return;
  }

  console.log(`[dedup] user ${userId}: loaded ${rows.length} memories`);

  // Decrypt content + drop any rows with empty content (defensive).
  const decoded = rows.map((r) => ({ ...r, content: safeDecrypt(userId, r.content) || '' }))
    .filter((r) => r.content.trim().length > 0);

  console.log(`[dedup] embedding ${decoded.length} memories — this can take a couple of minutes on CPU…`);

  // Embed sequentially to keep memory pressure low. The MiniLM pipeline is
  // ~5-15ms/text on CPU, so 1,600 entries lands around 10-30s.
  const withVectors = [];
  for (let i = 0; i < decoded.length; i++) {
    const m = decoded[i];
    try {
      m.vector = await embedding.embed(m.content);
      withVectors.push(m);
    } catch (err) {
      console.warn(`[dedup] failed to embed memory ${m.id}: ${err.message}`);
    }
    if ((i + 1) % 100 === 0) console.log(`[dedup] embedded ${i + 1}/${decoded.length}`);
  }
  console.log(`[dedup] embedded ${withVectors.length} memories in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const clusters = clusterMemories(withVectors, options.threshold);
  const dupClusters = clusters.filter((c) => c.members.length > 1);
  const singletonCount = clusters.length - dupClusters.length;
  const losersTotal = dupClusters.reduce((sum, c) => sum + (c.members.length - 1), 0);
  const largest = dupClusters.reduce((max, c) => Math.max(max, c.members.length), 0);

  console.log('');
  console.log(`[dedup] user ${userId} summary:`);
  console.log(`  threshold:      ${options.threshold}`);
  console.log(`  total memories: ${withVectors.length}`);
  console.log(`  unique clusters: ${clusters.length} (singletons: ${singletonCount}, multi: ${dupClusters.length})`);
  console.log(`  would archive:  ${losersTotal} (${(losersTotal / withVectors.length * 100).toFixed(1)}%)`);
  console.log(`  largest cluster: ${largest}`);
  console.log('');

  if (options.verbose || options.dryRun) {
    // Print clusters sorted by size descending so the worst dupes float to the top.
    const sorted = [...dupClusters].sort((a, b) => b.members.length - a.members.length);
    const limit = options.verbose ? sorted.length : Math.min(10, sorted.length);
    console.log(`Showing ${limit} largest cluster${limit === 1 ? '' : 's'}:`);
    for (let i = 0; i < limit; i++) {
      const c = sorted[i];
      const canonical = pickCanonical(c.members);
      console.log(`\n— Cluster ${i + 1} (${c.members.length} members):`);
      for (const m of c.members) {
        const marker = m.id === canonical.id ? '★ KEEP' : '  drop';
        const flags = [m.pinned ? 'pinned' : '', m.is_core ? 'core' : '', m.status === 'resolved' ? 'resolved' : ''].filter(Boolean).join(',');
        const date = (m.effective_date || m.created_at || '').slice(0, 10);
        const preview = m.content.replace(/\s+/g, ' ').slice(0, 110);
        console.log(`  ${marker} #${m.id} [${date}${flags ? ' ' + flags : ''}]  ${preview}${m.content.length > 110 ? '…' : ''}`);
      }
    }
    console.log('');
  }

  if (options.dryRun) {
    console.log('[dedup] dry-run — DB unchanged.');
    return;
  }

  if (losersTotal === 0) {
    console.log('[dedup] nothing to merge at this threshold.');
    return;
  }

  // ── JSON backup before any writes ──
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `memories-pre-dedup-${userId}-${ts}.json`);
  // Snapshot every losing memory's full row (including encrypted content). We
  // skip the embedding vectors to keep the file small.
  const losersFlat = [];
  for (const c of dupClusters) {
    const canonical = pickCanonical(c.members);
    for (const m of c.members) {
      if (m.id !== canonical.id) {
        const { vector, ...rest } = m;
        losersFlat.push({ ...rest, kept_canonical_id: canonical.id });
      }
    }
  }
  fs.writeFileSync(backupPath, JSON.stringify({
    userId,
    threshold: options.threshold,
    timestamp: ts,
    canonicalKept: dupClusters.length,
    archived: losersFlat.length,
    losers: losersFlat,
  }, null, 2));
  console.log(`[dedup] backup written: ${backupPath}`);

  // ── Archive + delete in a single transaction ──
  ensureArchiveTable();
  const insertArchive = db.prepare(`
    INSERT INTO memories_archive (id, user_id, content, pinned, is_core, status, source_entry_id, created_at, archive_reason, kept_canonical_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'dedup', ?)
  `);
  const deleteMemory = db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?');

  const tx = db.transaction((losers) => {
    for (const m of losers) {
      // The original content is already encrypted; we re-insert as-is. Use the
      // raw row's `content` (still ciphertext) — re-fetch the ciphertext from
      // the source row map since we decrypted in-memory above.
      const raw = rows.find((r) => r.id === m.id);
      insertArchive.run(
        m.id, userId, raw.content, m.pinned || 0, m.is_core || 0,
        m.status || 'active', m.source_entry_id || null, m.created_at,
        m.kept_canonical_id || null
      );
      deleteMemory.run(m.id, userId);
    }
  });
  tx(losersFlat);

  // Mark synthesis cache dirty so the next reflect / card pull regenerates.
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(`memory_dirty_${userId}`);

  console.log(`[dedup] archived ${losersFlat.length} memories. ${withVectors.length - losersFlat.length} kept.`);
  console.log(`[dedup] synthesis cache invalidated.`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  const opts = parseArgs(process.argv);
  console.log('[dedup] starting', opts);

  const userIds = opts.userId
    ? [opts.userId]
    : db.prepare('SELECT id FROM users').all().map((u) => u.id);

  for (const uid of userIds) {
    try {
      await runForUser(uid, opts);
    } catch (err) {
      console.error(`[dedup] user ${uid} failed:`, err.message);
      console.error(err.stack);
    }
  }

  console.log('[dedup] done.');
  process.exit(0);
})();
