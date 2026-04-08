/**
 * Local embedding service using @xenova/transformers.
 * Downloads ~80MB model on first run (all-MiniLM-L6-v2).
 * CPU-only, no API key, Windows compatible.
 */

const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../paths');

let pipeline = null;
let pipelineLoading = false;
let pipelineError = null;

const VECTRA_DIR = path.join(DATA_DIR, 'vectra');

if (!fs.existsSync(VECTRA_DIR)) fs.mkdirSync(VECTRA_DIR, { recursive: true });

async function getPipeline() {
  if (pipeline) return pipeline;
  if (pipelineError) throw pipelineError;

  if (pipelineLoading) {
    // Wait for the in-flight load
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (!pipelineLoading) {
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
    if (pipelineError) throw pipelineError;
    return pipeline;
  }

  pipelineLoading = true;
  console.log('[embedding] Loading local embedding model (first run may download ~80MB)...');

  try {
    // Dynamic import — @xenova/transformers is ESM
    const { pipeline: createPipeline, env } = await import('@xenova/transformers');

    // Cache models in our data directory
    env.cacheDir = path.join(DATA_DIR, 'models');

    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[embedding] Model ready.');
  } catch (err) {
    pipelineError = err;
    console.error('[embedding] Failed to load embedding model:', err.message);
    throw err;
  } finally {
    pipelineLoading = false;
  }

  return pipeline;
}

/**
 * Embed a string and return a flat float32 array.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Get the Vectra LocalIndex, creating it if needed.
 */
async function getIndex() {
  const { LocalIndex } = await import('vectra');
  const index = new LocalIndex(VECTRA_DIR);
  if (!(await index.isIndexCreated())) {
    await index.createIndex();
    console.log('[embedding] Vectra index created.');
  }
  return index;
}

/**
 * Add or update an entry in the vector index.
 * @param {number} entryId
 * @param {string} text  Plain text content of the entry
 */
async function indexEntry(entryId, text) {
  try {
    const [vector, index] = await Promise.all([embed(text), getIndex()]);

    // Delete existing item if present (upsert behaviour)
    try {
      await index.deleteItem(`entry_${entryId}`);
    } catch {}

    await index.insertItem({
      id: `entry_${entryId}`,
      vector,
      metadata: { entryId },
    });

    return true;
  } catch (err) {
    console.error(`[embedding] Failed to index entry ${entryId}:`, err.message);
    return false;
  }
}

/**
 * Retrieve the k most semantically similar entries to the given text.
 * @param {string} text
 * @param {number} k  Number of results (default 5)
 * @param {number[]} excludeIds  Entry IDs to exclude (e.g. current entry)
 * @returns {Promise<{entryId: number, score: number}[]>}
 */
async function querySimilar(text, k = 5, excludeIds = []) {
  try {
    const [vector, index] = await Promise.all([embed(text), getIndex()]);
    const results = await index.queryItems(vector, k + excludeIds.length);

    return results
      .filter((r) => !excludeIds.includes(r.item.metadata.entryId))
      .slice(0, k)
      .map((r) => ({ entryId: r.item.metadata.entryId, score: r.score }));
  } catch (err) {
    console.error('[embedding] Query failed:', err.message);
    return [];
  }
}

/**
 * Warm-start: load the pipeline in the background so the first reflect
 * call doesn't stall. Called from server.js on startup.
 */
function warmup() {
  getPipeline().catch(() => {});
}

module.exports = { embed, indexEntry, querySimilar, warmup };
