#!/usr/bin/env node
/**
 * One-shot backfill: walk every memory in the database and add its embedding
 * to the librarian's memory index. Idempotent — already-indexed memories are
 * skipped on re-runs. (The app now does this itself at login — see
 * services/librarianService.js — so this is only for manual use.)
 *
 * Run after deploying the relevance-retrieval changes; from then on, new
 * memories are indexed live by extractAndStoreMemories so backfill isn't
 * needed again unless the index is wiped.
 *
 * USAGE
 *   node backend/scripts/embedAllMemories.js [--user-id=N] [--force]
 */

const db = require('../database');
const embedding = require('../services/embeddingService');
const { safeDecrypt } = require('../services/rowCrypto');

function parseArgs(argv) {
  const out = { userId: null, force: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--force') out.force = true;
    else if (arg.startsWith('--user-id=')) out.userId = parseInt(arg.split('=')[1], 10);
  }
  return out;
}

async function getIndexedIds() {
  try {
    return await embedding.indexedMemoryIds();
  } catch (err) {
    console.warn('[embed] Could not enumerate existing index, will re-embed everything:', err.message);
    return new Set();
  }
}

async function runForUser(userId, options, alreadyIndexed) {
  const rows = db.prepare('SELECT id, content FROM memories WHERE user_id = ? ORDER BY id ASC').all(userId);
  if (rows.length === 0) {
    console.log(`[embed] user ${userId}: no memories.`);
    return;
  }

  console.log(`[embed] user ${userId}: ${rows.length} memories to consider`);

  let embedded = 0, skipped = 0, failed = 0;
  const t0 = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!options.force && alreadyIndexed.has(row.id)) {
      skipped++;
      continue;
    }
    const content = safeDecrypt(userId, row.content);
    if (!content || !content.trim()) { failed++; continue; }
    const ok = await embedding.indexMemory(row.id, content.trim());
    if (ok) embedded++; else failed++;

    if ((i + 1) % 100 === 0) {
      console.log(`[embed] user ${userId}: ${i + 1}/${rows.length} (embedded ${embedded}, skipped ${skipped}, failed ${failed})`);
    }
  }

  console.log(`[embed] user ${userId}: done in ${((Date.now() - t0) / 1000).toFixed(1)}s — embedded ${embedded}, skipped ${skipped}, failed ${failed}`);
}

(async () => {
  const opts = parseArgs(process.argv);
  console.log('[embed] starting', opts);

  const alreadyIndexed = opts.force ? new Set() : await getIndexedIds();
  console.log(`[embed] ${alreadyIndexed.size} memories already in index (skipping unless --force)`);

  const userIds = opts.userId
    ? [opts.userId]
    : db.prepare('SELECT id FROM users').all().map((u) => u.id);

  for (const uid of userIds) {
    try {
      await runForUser(uid, opts, alreadyIndexed);
    } catch (err) {
      console.error(`[embed] user ${uid} failed:`, err.message);
      console.error(err.stack);
    }
  }

  console.log('[embed] done.');
  process.exit(0);
})();
