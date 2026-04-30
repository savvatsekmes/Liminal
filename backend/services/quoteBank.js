// Quote bank for /api/reflect.
//
// The reflect prompt no longer asks the LLM to fill the per-block "quote" field
// with a wisdom-tradition line — small models invent aphorisms and even
// fabricate attributions to real people (the Ayn Rand misquote was the
// motivating bug). Instead, we replace the LLM's quote with a real,
// attributable line picked from a curated bank by embedding similarity to the
// block's body.
//
// Bank source: /backend/data/quotes/{lang}.json — same canonical files the
// frontend's daily-quote feature imports. We load them, filter to entries with
// a real author, embed each quote text once, and cache. On reflect, for each
// block we embed block.body and pick the highest-cosine quote in the user's
// language pool. If similarity is below QUOTE_MIN_SIMILARITY we set null —
// better no quote than a forced one.
//
// Embeddings use the same all-MiniLM-L6-v2 pipeline as embeddingService —
// normalised, so dot product == cosine.

const fs = require('node:fs');
const path = require('node:path');
const { embed } = require('./embeddingService');

const QUOTES_DIR = path.join(__dirname, '..', 'data', 'quotes');
const SUPPORTED_LANGS = ['en','es','fr','de','it','pt','nl','sv','pl','el','ru','tr','ar','ja','ko','zh'];
const QUOTE_MIN_SIMILARITY = 0.35;
// Hard ceiling on bank size so massive future pools don't OOM. 16 langs ×
// 500 ≈ 8000 vectors at 384 floats each ≈ 12 MB — fine.
const MAX_QUOTES_PER_LANG = 500;

// Per-language cache: lang -> Promise<Array<{ text, author, vec }>>.
// Lazy: first request for a language triggers loading + embedding for THAT
// language only. Most users only need 1-2 languages, so we save the ~70s of
// startup-time embedding for langs they never use.
const cache = new Map();

function loadPool(lang) {
  const filePath = path.join(QUOTES_DIR, `${lang}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const all = JSON.parse(raw);
    // Reflect-eligible filter: only attributable (real-author) entries. The
    // existing pool contains personal/family entries (anonymous, "Elisabet"
    // notes etc.) that the daily-quote feature happily uses but should not
    // surface as a wisdom-tradition reference on a reflection block.
    return all
      .filter((q) => q && typeof q.text === 'string' && q.text.trim()
        && typeof q.author === 'string' && q.author.trim().length > 0)
      .slice(0, MAX_QUOTES_PER_LANG);
  } catch (err) {
    console.warn(`[quoteBank] failed to load ${lang}: ${err.message}`);
    return [];
  }
}

async function ensureEmbedded(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const promise = (async () => {
    const pool = loadPool(lang);
    if (!pool.length) return [];
    const t0 = Date.now();
    const out = [];
    for (const q of pool) {
      try {
        const vec = await embed(q.text);
        out.push({ text: q.text, author: q.author, vec });
      } catch (err) {
        // Embedding failure on a single quote — skip it, don't poison the bank.
        console.warn(`[quoteBank] embed failed for ${lang}: ${err.message}`);
      }
    }
    console.log(`[quoteBank] ${lang}: embedded ${out.length} attributable quotes in ${Date.now() - t0}ms`);
    return out;
  })();
  cache.set(lang, promise);
  return promise;
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/**
 * Find the most thematically relevant quote from the curated bank for a given
 * block of reflection text.
 * @param {string} text — the block body to match against
 * @param {string} lang — ISO 639-1 language code; falls back to 'en' if unsupported
 * @param {number} threshold — minimum cosine similarity to attach (default 0.35)
 * @returns {Promise<{ text, author } | null>}
 */
async function findBestQuote(text, lang = 'en', threshold = QUOTE_MIN_SIMILARITY) {
  if (!text || typeof text !== 'string' || text.trim().length < 20) return null;
  const code = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  const pool = await ensureEmbedded(code);
  if (!pool.length) return null;

  let queryVec;
  try {
    queryVec = await embed(text);
  } catch {
    return null;
  }

  let bestSim = -Infinity;
  let bestQuote = null;
  for (const q of pool) {
    const sim = dot(queryVec, q.vec);
    if (sim > bestSim) {
      bestSim = sim;
      bestQuote = q;
    }
  }

  if (bestSim < threshold || !bestQuote) return null;
  return { text: bestQuote.text, author: bestQuote.author };
}

/** Optional: warm up a language's embeddings in the background. Non-blocking. */
function warmup(lang = 'en') {
  ensureEmbedded(lang).catch(() => {});
}

module.exports = { findBestQuote, warmup };
