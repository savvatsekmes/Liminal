/**
 * Keeps the librarian's index (embeddingService) complete without anyone
 * pressing a button.
 *
 * At every login — the moment the user's key exists and their entries can be
 * read — this compares the user's entries and memories with what's in the
 * index and quietly embeds whatever is missing, in the background. On a fresh
 * install that is the whole journal (the model downloads on first use, ~166
 * MB); after that it's only the odd item a crash or an offline start missed.
 *
 * rebuild() re-embeds everything of one user (Settings → Librarian, Context →
 * Re-index), e.g. after a model change. The index is shared by all accounts
 * on the machine, so neither path ever wipes it.
 */

const db = require('../database');
const rowCrypto = require('./rowCrypto');
const embedding = require('./embeddingService');

const START_DELAY_MS = 4000; // let the app finish opening before the CPU work starts
const jobs = new Map(); // userId → job (also read by Settings for progress)

function plaintext(userId, value) {
  const t = rowCrypto.safeDecrypt(userId, value);
  // safeDecrypt hands back the ciphertext when it can't decrypt; never embed that.
  if (!t || rowCrypto.isEncrypted(t)) return '';
  return String(t).trim();
}

/**
 * Embed this user's entries and memories that the index doesn't have yet
 * (or, with force, all of them). Returns the job; one job per user at a time.
 */
function sync(userId, { force = false } = {}) {
  userId = Number(userId);
  const running = jobs.get(userId);
  if (running?.running) return running;

  const job = {
    running: true, force, phase: 'checking',
    done: 0, total: 0, indexed: 0, failed: 0,
    startedAt: new Date().toISOString(), finishedAt: null, error: null,
  };
  jobs.set(userId, job);

  setImmediate(async () => {
    const t0 = Date.now();
    try {
      if (!rowCrypto.hasUserKey(userId)) throw new Error('not unlocked');
      await pruneDeleted().catch((err) => console.warn('[librarian] prune failed:', err.message));
      const [haveEntries, haveMemories] = force
        ? [new Set(), new Set()]
        : await Promise.all([embedding.indexedEntryIds(), embedding.indexedMemoryIds()]);
      const entries = db.prepare("SELECT id, body_text FROM entries WHERE user_id = ? AND COALESCE(body_text, '') != '' ORDER BY COALESCE(date, created_at) DESC")
        .all(userId).filter((r) => !haveEntries.has(r.id));
      const memories = db.prepare('SELECT id, content FROM memories WHERE user_id = ? ORDER BY id DESC')
        .all(userId).filter((r) => !haveMemories.has(r.id));
      job.total = entries.length + memories.length;
      if (!job.total) return;
      console.log(`[librarian] user ${userId}: indexing ${entries.length} entries and ${memories.length} memories${force ? ' (rebuild)' : ' missing from the index'}`);

      // In batches: each batch is embedded, then written to the index in one
      // go (one file rewrite per batch rather than two per item).
      const BATCH = 32;
      const runBatches = async (rows, textOf, indexBatch) => {
        for (let i = 0; i < rows.length; i += BATCH) {
          const slice = rows.slice(i, i + BATCH);
          const items = slice.map((r) => ({ id: r.id, text: textOf(r) })).filter((it) => it.text);
          try {
            const { indexed, failed } = await indexBatch(undefined, items);
            job.indexed += indexed;
            job.failed += failed;
          } catch { job.failed += items.length; }
          job.done += slice.length;
        }
      };
      job.phase = 'entries';
      await runBatches(entries, (r) => plaintext(userId, r.body_text), embedding.indexEntriesInto);
      job.phase = 'memories';
      await runBatches(memories, (r) => plaintext(userId, r.content), embedding.indexMemoriesInto);
      console.log(`[librarian] user ${userId}: ${job.indexed} indexed, ${job.failed} failed in ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (err) {
      job.error = err.message;
      console.warn(`[librarian] index sync for user ${userId} stopped:`, err.message);
    } finally {
      job.running = false;
      job.phase = 'done';
      job.finishedAt = new Date().toISOString();
    }
  });
  return job;
}

/** Drop index items whose entry or memory has been deleted (any account). */
async function pruneDeleted() {
  const entryIds = new Set(db.prepare('SELECT id FROM entries').all().map((r) => r.id));
  const memoryIds = new Set(db.prepare('SELECT id FROM memories').all().map((r) => r.id));
  const removed = await embedding.pruneIndex((id) => entryIds.has(id), (id) => memoryIds.has(id));
  if (removed) console.log(`[librarian] removed ${removed} index item(s) for deleted entries/memories`);
  return removed;
}

function rebuild(userId) {
  return sync(userId, { force: true });
}

function job(userId) {
  return jobs.get(Number(userId)) || null;
}

// Fill gaps at every login, a few seconds after the app opens.
rowCrypto.onUserKeySet((userId) => {
  setTimeout(() => sync(userId), START_DELAY_MS);
});

module.exports = { sync, rebuild, job, pruneDeleted };
