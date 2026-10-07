/**
 * Local embedding service ("the librarian"): turns text into vectors so
 * Liminal can find related entries, relevant memories and fitting quotes.
 * Runs in-process on the CPU via Transformers.js — no API key, no Ollama.
 *
 * Two models, side by side:
 *   minilm   — all-MiniLM-L6-v2 (~23 MB). The original. English-only, and only
 *              reads the first few hundred tokens of a text.
 *   egemma2  — EmbeddingGemma 2, text-only (q4, ~166 MB). 100+ languages,
 *              8K-token context, so whole long entries count.
 *
 * Each model keeps its OWN Vectra indexes (vectors from different models
 * can't be mixed). Writes go to every model whose index exists, so both stay
 * current and switching between them (Settings → Librarian) is instant.
 *
 * Score calibration: EmbeddingGemma's cosine similarities live in a much
 * narrower, higher band (unrelated ≈ 0.71–0.77, related ≈ 0.78–0.83,
 * near-duplicate ≈ 0.92–0.99) than MiniLM's. Every threshold in the app
 * (echo 0.30, quote 0.45, dedup 0.88, memory band widths) was tuned on
 * MiniLM's scale, so EmbeddingGemma scores are mapped onto it with linear
 * fits measured on the same sentence pairs scored by both models (one per
 * prefix mode — see MODELS.egemma2). Callers always see MiniLM-scale scores
 * and need no per-model thresholds.
 */

const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../paths');

const MODELS = {
  minilm: {
    id: 'minilm',
    label: 'MiniLM (classic)',
    hfId: 'Xenova/all-MiniLM-L6-v2',
    dtype: 'q8', // = model_quantized.onnx, the file @xenova/transformers used — identical vectors
    entriesDir: path.join(DATA_DIR, 'vectra'),
    memoriesDir: path.join(DATA_DIR, 'vectra-memories'),
    prepare: (t) => t,           // MiniLM has no task prefixes
    calibrate: (s) => s,
  },
  egemma2: {
    id: 'egemma2',
    label: 'EmbeddingGemma 2',
    hfId: 'onnx-community/embeddinggemma-2-ONNX',
    dtype: 'q4',
    entriesDir: path.join(DATA_DIR, 'vectra-egemma2'),
    memoriesDir: path.join(DATA_DIR, 'vectra-memories-egemma2'),
    // EmbeddingGemma is trained with task prefixes, and the right one matters:
    //   'document' / 'query' — search mode: stored entries, memories and
    //       quotes are documents; the text we're looking from is the query.
    //       This finds a long entry by a detail buried deep inside it, which
    //       "how alike are these two texts" mode does not.
    //   'similarity' — symmetric, for comparing two things of the same kind
    //       (memory de-duplication, picking the closest sentence).
    prepare: (t, kind) => kind === 'query' ? `task: search result | query: ${t}`
      : kind === 'document' ? `title: none | text: ${t}`
      : `task: sentence similarity | query: ${t}`,
    // Each mode has its own score distribution, each mapped onto MiniLM's
    // scale from the same sentence pairs scored by both models:
    //   search      minilm ≈ 2.530·egemma − 1.534  (r = 0.944)
    //   similarity  minilm ≈ 3.451·egemma − 2.494  (r = 0.966)
    //   quote       reflection prose vs short aphorisms is its own pair type:
    //               search mode, offset so the quote bank's 0.45 cut-off
    //               accepts the same share as MiniLM (6/16 test reflections,
    //               raw 0.764 ↔ 0.45).
    calibrate: (s, mode) => Math.max(-1, Math.min(1,
      mode === 'search' ? 2.530 * s - 1.534
        : mode === 'quote' ? 2.530 * s - 1.483
          : 3.451 * s - 2.494)),
  },
};
const DEFAULT_MODEL = 'minilm';

// Kept for older callers (settings /reindex, memories /embed-all): the
// MiniLM directories, which is where the classic index has always lived.
const VECTRA_DIR = MODELS.minilm.entriesDir;
const VECTRA_MEMORIES_DIR = MODELS.minilm.memoriesDir;
for (const d of [VECTRA_DIR, VECTRA_MEMORIES_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── Which model is active ─────────────────────────────────────────────────────
// App-wide (the indexes are app-wide), stored as a global setting.
function currentModelId() {
  try {
    const db = require('../database');
    const row = db.prepare("SELECT value FROM settings WHERE key = 'embedding_model'").get();
    return row && MODELS[row.value] ? row.value : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}
function setCurrentModel(id) {
  if (!MODELS[id]) throw new Error(`Unknown embedding model: ${id}`);
  require('./settingsService').setGlobal('embedding_model', id);
}
function model(id) {
  return MODELS[id || currentModelId()];
}

// An index "exists" for a model once its entries index has been created —
// MiniLM always, EmbeddingGemma once a build has started.
function indexExists(m) {
  return fs.existsSync(path.join(m.entriesDir, 'index.json'));
}
function liveModels() {
  return Object.values(MODELS).filter((m) => m.id === DEFAULT_MODEL || indexExists(m));
}

// ── Pipelines (one per model, loaded lazily) ─────────────────────────────────
const _pipelines = new Map(); // modelId → Promise<pipeline>
let _lib = null;
function lib() {
  // One Transformers.js version for both models: two different ONNX runtimes
  // in one process collide on Windows (onnxruntime.dll, error 182).
  _lib ||= import('@huggingface/transformers').then((t) => {
    t.env.cacheDir = path.join(DATA_DIR, 'models');
    return t;
  });
  return _lib;
}
function getPipeline(modelId) {
  const m = model(modelId);
  if (!_pipelines.has(m.id)) {
    const p = (async () => {
      const t0 = Date.now();
      console.log(`[embedding] Loading ${m.label} (first run downloads the model)…`);
      const { pipeline } = await lib();
      const pipe = await pipeline('feature-extraction', m.hfId, { device: 'cpu', dtype: m.dtype });
      console.log(`[embedding] ${m.label} ready in ${Date.now() - t0}ms.`);
      return pipe;
    })();
    // A failed load shouldn't be cached forever — let the next call retry.
    p.catch((err) => {
      console.error(`[embedding] Failed to load ${m.label}:`, err.message);
      _pipelines.delete(m.id);
    });
    _pipelines.set(m.id, p);
  }
  return _pipelines.get(m.id);
}

/**
 * Embed a string with the active model (or `modelId`) → flat number[].
 * Vectors are normalised, so a dot product is the cosine similarity.
 * @param {'query'|'document'|'similarity'} [kind] — EmbeddingGemma task mode;
 *   compare a 'query' only against 'document's, and 'similarity' only
 *   against 'similarity'. Ignored by MiniLM.
 */
async function embed(text, modelId, kind = 'similarity') {
  const m = model(modelId);
  const pipe = await getPipeline(m.id);
  const output = await pipe(m.prepare(String(text ?? ''), kind), { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Embed many strings in batches — much faster than one at a time for bulk
 * work (the quote bank, index builds). Same vectors as embed().
 */
async function embedMany(texts, modelId, kind = 'similarity', batchSize = 16) {
  const m = model(modelId);
  const pipe = await getPipeline(m.id);
  const out = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map((t) => m.prepare(String(t ?? ''), kind));
    const tensor = await pipe(batch, { pooling: 'mean', normalize: true });
    const dims = tensor.dims[tensor.dims.length - 1];
    for (let j = 0; j < batch.length; j++) out.push(Array.from(tensor.data.subarray(j * dims, (j + 1) * dims)));
  }
  return out;
}

/**
 * Calibrated (MiniLM-scale) similarity of two vectors from the same model.
 * mode: 'search' for query-vs-document, 'similarity' for symmetric pairs,
 * 'quote' for reflection-vs-quote matching (search vectors, own calibration).
 */
function similarity(a, b, modelId, mode = 'similarity') {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return model(modelId).calibrate(s, mode);
}

// ── Vectra indexes ───────────────────────────────────────────────────────────
// Singleton LocalIndex instances + per-index write queues.
//
// Every call to `getIndex()` used to construct a fresh LocalIndex pointing
// at the same on-disk path. The Vectra LocalIndex isn't designed to be
// instantiated multiple times against the same file: each instance holds an
// in-memory copy of the index, and every insertItem / deleteItem rewrites
// the whole file. If two callers concurrently insert (e.g. a reflect
// fire-and-forget index call racing with a bulk reindex loop), they each
// read the same starting state, modify in memory, and write back —
// last-write-wins corruption that often produces invalid JSON near the
// file's seam.
//
// Fix: cache one LocalIndex per directory, and serialise every write
// through a per-directory promise chain so insertItem/deleteItem can never
// overlap. Read operations (queryItems) don't need to be in the queue —
// they only read the in-memory state.
const _indexCache = new Map();   // dir → Promise<LocalIndex>
const _writeChains = new Map();  // dir → Promise (tail of the queue)

function _enqueueWrite(dir, fn) {
  const prev = _writeChains.get(dir) || Promise.resolve();
  // Swallow rejections in the chain so one failed write doesn't poison
  // every subsequent write. Callers see their own errors via the returned
  // promise.
  const next = prev.then(fn, fn);
  _writeChains.set(dir, next.catch(() => {}));
  return next;
}

async function _getIndexAt(dir, label) {
  if (_indexCache.has(dir)) return _indexCache.get(dir);
  const p = (async () => {
    const { LocalIndex } = await import('vectra');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const idx = new LocalIndex(dir);
    if (!(await idx.isIndexCreated())) {
      await idx.createIndex();
      console.log(`[embedding] Vectra ${label} index created.`);
    }
    return idx;
  })();
  _indexCache.set(dir, p);
  return p;
}

/** Drop the cached LocalIndex instance for a directory. Call this after
 *  externally deleting the on-disk index files (e.g. the reindex flow that
 *  wipes vectra/ before rebuilding) so the next getIndex creates a fresh
 *  instance bound to the new files. */
function invalidateIndexCache(dir) {
  _indexCache.delete(dir);
  _writeChains.delete(dir);
}

async function _upsert(dir, label, id, vector, metadata) {
  const index = await _getIndexAt(dir, label);
  return _enqueueWrite(dir, async () => {
    try { await index.deleteItem(id); } catch {}
    await index.insertItem({ id, vector, metadata });
    return true;
  });
}

async function _remove(dir, label, id) {
  const index = await _getIndexAt(dir, label);
  return _enqueueWrite(dir, async () => {
    try { await index.deleteItem(id); return true; } catch { return false; }
  });
}

// ── Entries ──────────────────────────────────────────────────────────────────

/** Index an entry into one specific model's index (used by the build job). */
async function indexEntryInto(modelId, entryId, text) {
  const m = model(modelId);
  const vector = await embed(text, m.id, 'document');
  return _upsert(m.entriesDir, `${m.id} entries`, `entry_${entryId}`, vector, { entryId });
}

// Autosave fires every second or so while typing; re-embedding a long entry
// with EmbeddingGemma on every keystroke burst would keep a CPU core busy the
// whole time you write. Debounced callers only index after a quiet period,
// and only the latest text.
const ENTRY_INDEX_QUIET_MS = 8000;
const _pendingEntryIndex = new Map(); // entryId → { timer, text, waiters[] }

/**
 * Add or update an entry in every live model's index, so both stay current.
 * @param {number} entryId
 * @param {string} text  Plain text content of the entry
 * @param {{debounce?: boolean}} [opts]  debounce: wait for a quiet period
 *   (use from autosave paths; reflect indexes immediately)
 */
async function indexEntry(entryId, text, opts = {}) {
  if (opts.debounce) {
    return new Promise((resolve) => {
      const pending = _pendingEntryIndex.get(entryId) || { waiters: [] };
      clearTimeout(pending.timer);
      pending.text = text;
      pending.waiters.push(resolve);
      pending.timer = setTimeout(() => {
        _pendingEntryIndex.delete(entryId);
        indexEntry(entryId, pending.text).then((ok) => pending.waiters.forEach((w) => w(ok)));
      }, ENTRY_INDEX_QUIET_MS);
      _pendingEntryIndex.set(entryId, pending);
    });
  }
  let ok = true;
  for (const m of liveModels()) {
    try { await indexEntryInto(m.id, entryId, text); }
    catch (err) {
      ok = false;
      console.error(`[embedding] Failed to index entry ${entryId} (${m.id}):`, err.message);
    }
  }
  return ok;
}

/**
 * Retrieve the k most semantically similar entries to the given text, using
 * the active model. Scores are MiniLM-scale (see calibration note above).
 * @returns {Promise<{entryId: number, score: number}[]>}
 */
async function querySimilar(text, k = 5, excludeIds = [], modelId) {
  try {
    const m = model(modelId);
    const [vector, index] = await Promise.all([embed(text, m.id, 'query'), _getIndexAt(m.entriesDir, `${m.id} entries`)]);
    const results = await index.queryItems(vector, k + excludeIds.length);
    return results
      .filter((r) => !excludeIds.includes(r.item.metadata.entryId))
      .slice(0, k)
      .map((r) => ({ entryId: r.item.metadata.entryId, score: m.calibrate(r.score, 'search') }));
  } catch (err) {
    console.error('[embedding] Query failed:', err.message);
    return [];
  }
}

/**
 * Stored vectors of the given entries in the active (or `modelId`) index —
 * for whole-journal work like grouping entries into themes, where re-embedding
 * every entry would take minutes. Entries not yet indexed are simply absent.
 * Vectors are 'document' mode; compare them with each other or with 'query'
 * vectors from embed().
 * @returns {Promise<Map<number, number[]>>}
 */
async function entryVectors(entryIds, modelId) {
  const out = new Map();
  try {
    const m = model(modelId);
    const index = await _getIndexAt(m.entriesDir, `${m.id} entries`);
    const want = new Set(entryIds.map(Number));
    for (const it of await index.listItems()) {
      const id = it.metadata?.entryId;
      if (want.has(id)) out.set(id, it.vector);
    }
  } catch (err) {
    console.error('[embedding] entryVectors failed:', err.message);
  }
  return out;
}

// ── Memories ─────────────────────────────────────────────────────────────────

/** Get the active model's memory index (separate ID space from entries). */
async function getMemoryIndex(modelId) {
  const m = model(modelId);
  return _getIndexAt(m.memoriesDir, `${m.id} memory`);
}

async function indexMemoryInto(modelId, memoryId, text) {
  const m = model(modelId);
  const vector = await embed(text, m.id, 'document');
  return _upsert(m.memoriesDir, `${m.id} memory`, `memory_${memoryId}`, vector, { memoryId });
}

/** Add or update a memory in every live model's memory index. */
async function indexMemory(memoryId, text) {
  let ok = true;
  for (const m of liveModels()) {
    try { await indexMemoryInto(m.id, memoryId, text); }
    catch (err) {
      ok = false;
      console.error(`[embedding] Failed to index memory ${memoryId} (${m.id}):`, err.message);
    }
  }
  return ok;
}

/** Remove a memory from every live model's index. Best-effort. */
async function unindexMemory(memoryId) {
  let ok = false;
  for (const m of liveModels()) {
    try { ok = (await _remove(m.memoriesDir, `${m.id} memory`, `memory_${memoryId}`)) || ok; } catch {}
  }
  return ok;
}

/**
 * Retrieve the k most semantically similar memories to the given context,
 * using the active model. Scores are MiniLM-scale. Caller hydrates from SQL
 * and applies recency / hierarchy / resolved multipliers.
 */
async function queryMemoriesSimilar(contextText, k = 30, modelId) {
  try {
    const m = model(modelId);
    const [vector, index] = await Promise.all([embed(contextText, m.id, 'query'), getMemoryIndex(m.id)]);
    const results = await index.queryItems(vector, k);
    return results.map((r) => ({ memoryId: r.item.metadata.memoryId, score: m.calibrate(r.score, 'search') }));
  } catch (err) {
    console.error('[embedding] Memory query failed:', err.message);
    return [];
  }
}

// ── Introspection (Settings → Librarian) ─────────────────────────────────────
async function indexCounts(m) {
  const count = async (dir) => {
    try {
      if (!fs.existsSync(path.join(dir, 'index.json'))) return 0;
      const idx = await _getIndexAt(dir, m.id);
      return (await idx.listItems()).length;
    } catch { return 0; }
  };
  return { entries: await count(m.entriesDir), memories: await count(m.memoriesDir) };
}

async function status() {
  const current = currentModelId();
  const models = [];
  for (const m of Object.values(MODELS)) {
    models.push({ id: m.id, label: m.label, active: m.id === current, built: m.id === DEFAULT_MODEL || indexExists(m), ...(await indexCounts(m)) });
  }
  return { current, models };
}

/**
 * Warm-start: load the active pipeline in the background so the first
 * reflect call doesn't stall. Called from server.js on startup.
 */
function warmup() {
  getPipeline().catch(() => {});
}

module.exports = {
  MODELS, currentModelId, setCurrentModel, status,
  embed, embedMany, similarity,
  indexEntry, indexEntryInto, querySimilar, entryVectors,
  indexMemory, indexMemoryInto, unindexMemory, queryMemoriesSimilar, getMemoryIndex,
  warmup, invalidateIndexCache, VECTRA_DIR, VECTRA_MEMORIES_DIR,
};
