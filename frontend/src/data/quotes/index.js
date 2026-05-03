// Per-language daily quote pools — canonical source is at
// /backend/data/quotes/*.json. Each language is dynamic-imported so it
// becomes its own Vite chunk, and only the active language is loaded.
// Static imports of all 16 languages added ~560KB to the main bundle.

const LOADERS = {
  en: () => import('../../../../backend/data/quotes/en.json'),
  el: () => import('../../../../backend/data/quotes/el.json'),
  fr: () => import('../../../../backend/data/quotes/fr.json'),
  de: () => import('../../../../backend/data/quotes/de.json'),
  es: () => import('../../../../backend/data/quotes/es.json'),
  pt: () => import('../../../../backend/data/quotes/pt.json'),
  it: () => import('../../../../backend/data/quotes/it.json'),
  ja: () => import('../../../../backend/data/quotes/ja.json'),
  zh: () => import('../../../../backend/data/quotes/zh.json'),
  ko: () => import('../../../../backend/data/quotes/ko.json'),
  ru: () => import('../../../../backend/data/quotes/ru.json'),
  ar: () => import('../../../../backend/data/quotes/ar.json'),
  tr: () => import('../../../../backend/data/quotes/tr.json'),
  nl: () => import('../../../../backend/data/quotes/nl.json'),
  sv: () => import('../../../../backend/data/quotes/sv.json'),
  pl: () => import('../../../../backend/data/quotes/pl.json'),
};

const cache = new Map(); // lang -> Array<{text, author}>

export async function loadPool(lang) {
  const code = LOADERS[lang] ? lang : 'en';
  if (cache.has(code)) return cache.get(code);
  const mod = await LOADERS[code]();
  const pool = mod.default || mod;
  cache.set(code, pool);
  return pool;
}

function pickByDay(pool) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  return pool[dayOfYear % pool.length];
}

/**
 * Pick the daily quote for a given language. Same day-of-year index across
 * languages so the rotation stays in sync.
 *
 * `extras` is an optional array of user-authored quotes ({ text, author }) —
 * notes with type 'quote'. They join the pool so the daily rotation
 * occasionally surfaces the user's own voice alongside the curated authors.
 *
 * Returns null if the pool hasn't loaded yet — call loadPool(lang) first
 * (or use the React-friendly form below).
 */
export function getDailyQuote(lang = 'en', extras = []) {
  const code = LOADERS[lang] ? lang : 'en';
  const base = cache.get(code);
  if (!base) return null;
  const pool = extras.length ? base.concat(extras) : base;
  return pickByDay(pool);
}
