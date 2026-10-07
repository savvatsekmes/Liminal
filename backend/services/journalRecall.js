/**
 * Journal recall for the chat ("Oracle").
 *
 * The chat used to know the journal only through ~10 short extracted
 * memories, so "look through my entries" or "what themes should I bring to
 * therapy?" got vague answers. This gives it the real material:
 *
 *   recallEntries  — the entries most related to the conversation, found by
 *                    the librarian (embeddingService), with the most relevant
 *                    PASSAGES of each (not just the opening) and their dates.
 *   themesDigest   — the user's recurring themes (threads) across the whole
 *                    journal: weight, how many entries, and over what dates.
 *   searchJournal  — topic and/or date-range lookup, exposed to tool-capable
 *                    models as the search_journal tool.
 *
 * Everything is decrypted in-process with the logged-in user's key and only
 * ever returns that user's own entries (the vector index is shared app-wide).
 */

const crypto = require('crypto');
const db = require('../database');
const { safeDecrypt } = require('./rowCrypto');
const embedding = require('./embeddingService');

// MiniLM-scale floor (scores are calibrated, so this holds for either
// librarian): below it an entry isn't really about what's being discussed.
const RECALL_MIN_SCORE = 0.12;
// Small passages (~2–4 sentences) so each one is about one thing — a big
// passage mixes the line that matters with the mundane lines around it.
const PASSAGE_TARGET = 350;    // chars per candidate passage
const MAX_PASSAGES_PER_ENTRY = 3;

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

// Split an entry into ~PASSAGE_TARGET-char passages on sentence boundaries.
function splitPassages(text) {
  const sentences = clean(text).match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [clean(text)];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur.length + s.length) > PASSAGE_TARGET) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Passage vectors, remembered between calls: embedding a passage costs ~35 ms
// with EmbeddingGemma, and search-as-you-type and the chat keep revisiting the
// same entries. Keyed by model + a hash of the passage (no text is kept);
// in memory only, oldest dropped first.
const PASSAGE_CACHE_MAX = 4000;
const passageCache = new Map();
async function passageVectors(passages) {
  const modelId = embedding.currentModelId();
  const keys = passages.map((p) => `${modelId}:${crypto.createHash('sha1').update(p).digest('base64')}`);
  const missing = [...new Set(keys.map((k, i) => (passageCache.has(k) ? -1 : i)).filter((i) => i >= 0))];
  if (missing.length) {
    const vecs = await embedding.embedMany(missing.map((i) => passages[i]), modelId, 'document');
    missing.forEach((i, n) => passageCache.set(keys[i], vecs[n]));
    while (passageCache.size > PASSAGE_CACHE_MAX) passageCache.delete(passageCache.keys().next().value);
  }
  return keys.map((k) => passageCache.get(k));
}

// The passages of `text` most relevant to `queryVec`, kept in document order.
async function bestExcerpt(text, queryVec, maxChars) {
  const t = clean(text);
  if (t.length <= maxChars) return t;
  const passages = splitPassages(t);
  if (passages.length <= 1) return `${t.slice(0, maxChars)}…`;
  const vecs = await passageVectors(passages);
  const byScore = vecs
    .map((v, i) => ({ i, s: embedding.similarity(queryVec, v, undefined, 'search') }))
    .sort((a, b) => b.s - a.s);
  // Fill the budget best-first, so the most relevant passage is never the one
  // that gets cut; then show the picks in their original order.
  const picked = [];
  let used = 0;
  // Extra passages only if they're nearly as relevant as the best one —
  // otherwise the budget fills up with the mundane parts of the entry.
  const floor = byScore[0].s - 0.2;
  for (const p of byScore) {
    if (picked.length >= MAX_PASSAGES_PER_ENTRY) break;
    if (picked.length && p.s < floor) break;
    const len = passages[p.i].length + (picked.length ? 3 : 0);
    if (picked.length && used + len > maxChars) continue;
    picked.push(p);
    used += len;
  }
  picked.sort((a, b) => a.i - b.i);
  let excerpt = '';
  picked.forEach((p, n) => {
    const gap = n === 0 ? (p.i > 0 ? '… ' : '') : (p.i === picked[n - 1].i + 1 ? ' ' : ' … ');
    excerpt += gap + passages[p.i];
  });
  if (picked[picked.length - 1].i < passages.length - 1) excerpt += ' …';
  // A single best passage longer than the budget is trimmed at its end only.
  return excerpt.length > maxChars + 4 ? `${excerpt.slice(0, maxChars)}…` : excerpt;
}

function hydrate(userId, ids) {
  if (!ids.length) return new Map();
  const rows = db.prepare(
    `SELECT id, title, date, body_text FROM entries WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
  ).all(userId, ...ids);
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Entries most related to `queryText`.
 * @returns {Promise<Array<{id, date, title, score, excerpt}>>}
 */
async function recallEntries(userId, queryText, opts = {}) {
  const { k = 5, excludeIds = [], maxChars = 900, minScore = RECALL_MIN_SCORE, from = null, to = null } = opts;
  if (!userId || !clean(queryText)) return [];
  // Over-fetch: the index is shared across users, and date filters drop more.
  const hits = await embedding.querySimilar(queryText, k * ((from || to) ? 8 : 3), excludeIds);
  const byId = hydrate(userId, hits.map((h) => h.entryId));
  const chosen = hits
    .filter((h) => byId.has(h.entryId) && h.score >= minScore)
    .filter((h) => {
      const d = byId.get(h.entryId).date;
      return (!from || (d && d >= from)) && (!to || (d && d <= to));
    })
    .slice(0, k);
  if (!chosen.length) return [];

  const queryVec = await embedding.embed(queryText, undefined, 'query');
  const out = [];
  for (const h of chosen) {
    const r = byId.get(h.entryId);
    const body = safeDecrypt(userId, r.body_text) || '';
    if (!clean(body)) continue;
    out.push({
      id: r.id,
      date: r.date,
      title: safeDecrypt(userId, r.title) || 'Untitled',
      score: Number(h.score.toFixed(3)),
      excerpt: await bestExcerpt(body, queryVec, maxChars),
    });
  }
  return out;
}

// Entries the chat has been shown through the search_journal tool, per user
// (entries recalled into the prompt are passed to the linker as `known`).
// Markers for any other entry number are the model guessing — gemma4
// wrote [[entry:14, entry:81]] for entries it was never given — and in a real
// journal those numbers would point at unrelated entries, so they aren't linked.
// Kept in memory (not the request) because tool calls from the personal
// providers' MCP bridge arrive outside the request's async context.
const SHOWN_TTL_MS = 2 * 60 * 60 * 1000;
const shownByUser = new Map(); // userId → Map(entryId → shownAt)

function noteShown(userId, ids) {
  if (!userId || !ids.length) return;
  const now = Date.now();
  const m = shownByUser.get(userId) || new Map();
  for (const [id, at] of m) if (now - at > SHOWN_TTL_MS) m.delete(id);
  for (const id of ids) m.set(Number(id), now);
  shownByUser.set(userId, m);
}

function wasShown(userId, id) {
  const at = shownByUser.get(userId)?.get(id);
  return at != null && Date.now() - at <= SHOWN_TTL_MS;
}

// ── Entry citations ──────────────────────────────────────────────────────────
// Two forms reach the chat UI, both rendered as links that open the entry:
//   [[entry:ID|text]]        an inline link on words in the reply — kept only
//                            when those words don't contradict the entry's date
//   [[entry:ID@YYYY-MM-DD]]  a small "↗ 12 Sep 2026" chip; the date comes from
//                            the journal, never from the model
// The model is asked for bare [[entry:ID]] markers: small local models invent
// wrong dates when asked to write the link text themselves (gemma4 cited the
// 12 Sep entry as "your 9 September entry").
const ANY_CITE_RE = /\[\[entry:(\d+)(?:\|([^\]\n]{1,120})|@(\d{4}-\d{2}-\d{2}))?\]\]/g;
const CITE_SPLIT_RE = /(\[\[entry:\d+(?:\|[^\]\n]{1,120}|@\d{4}-\d{2}-\d{2})?\]\])/g;
const CITE_INSTRUCTION =
  'Right after you mention one of these entries, add its marker [[entry:ID]] using its entry number, e.g. ' +
  '"in your entry from 12 March [[entry:1234]] you wrote…". The app turns the marker into a link showing the real date, ' +
  'so never put a date or any other words inside the marker. Only use entry numbers listed here.';

/** Text with citations reduced to their wording (chips drop out). */
function stripEntryCitations(text) {
  return String(text || '')
    .replace(ANY_CITE_RE, (all, id, label) => label || '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:!?)])/g, '$1');
}

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const DATE_PATTERNS = [
  // 2025-04-29
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, parse: (m) => ({ y: +m[1], mo: +m[2], d: +m[3] }) },
  // April 29th / April 29, 2025 / Sept. 12
  { re: new RegExp(String.raw`\b(${MONTH_ALT})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b`, 'gi'), parse: (m) => ({ y: m[3] ? +m[3] : null, mo: MONTHS[m[1].toLowerCase()], d: +m[2] }) },
  // 29 April / 29th of April 2025
  { re: new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH_ALT})\b\.?(?:,?\s+(\d{4}))?`, 'gi'), parse: (m) => ({ y: m[3] ? +m[3] : null, mo: MONTHS[m[2].toLowerCase()], d: +m[1] }) },
];

function datesIn(text) {
  const out = [];
  for (const { re, parse } of DATE_PATTERNS) {
    for (const m of String(text).matchAll(new RegExp(re.source, re.flags))) out.push(parse(m));
  }
  return out;
}

function sameDay(entryDate, { y, mo, d }) {
  const [ey, em, ed] = String(entryDate || '').split('-').map(Number);
  return em === mo && ed === d && (y == null || ey === y);
}

/** Entry numbers cited in some text (e.g. earlier replies in the conversation). */
function citedIds(text) {
  return [...String(text || '').matchAll(ANY_CITE_RE)].map((m) => Number(m[1]));
}

// Loose markers a model writes instead of [[entry:ID]] — "[[entry:14, entry:81]]",
// "[[entry: 12]]", "[[Entry #12]]" — become one proper marker per number.
const LOOSE_CITE_RE = /\[\[\s*entry\b[^\]\n]{0,80}\]\]/gi;
const EXACT_CITE_RE = new RegExp(`^${ANY_CITE_RE.source}$`);
function normalizeLooseCitations(text) {
  return text.replace(LOOSE_CITE_RE, (all) => {
    if (EXACT_CITE_RE.test(all)) return all;
    const nums = all.slice(2, -2).split(/[,;&]|\band\b/i)
      .map((t) => t.trim().replace(/^entry\s*[:#]?\s*#?/i, '').replace(/^#/, ''))
      .filter((t) => /^\d+$/.test(t));
    return nums.length ? nums.map((n) => `[[entry:${n}]]`).join(' ') : all;
  });
}

/**
 * Make entry references in a chat reply linkable and trustworthy:
 *  1. Model-written markers ([[entry:ID]] or [[entry:ID|words]]) are kept only
 *     for this user's own entries that the chat was actually shown (recall,
 *     search_journal, `known`, or `alsoAllowed` — e.g. ids linked earlier in
 *     the conversation). Bare markers — and labels whose date contradicts the
 *     entry — become chips carrying the real date.
 *  2. Fallback for models that ignore the format: a plain date in the reply
 *     that matches exactly one entry the chat was given (`known`) is linked.
 *  3. A date linked inline and then chipped for the same entry keeps one link.
 */
function linkEntryCitations(userId, text, known = [], alsoAllowed = []) {
  let out = normalizeLooseCitations(String(text || ''));
  const allowed = new Set([...known.map((e) => e.id), ...alsoAllowed].map(Number));

  const ids = citedIds(out);
  if (ids.length) {
    const realDate = new Map(db.prepare(
      `SELECT id, date FROM entries WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    ).all(userId, ...ids).map((r) => [r.id, r.date || '']));
    out = out.replace(ANY_CITE_RE, (all, idStr, label) => {
      const id = Number(idStr);
      // Not theirs, or a number the chat was never given: drop the marker.
      if (!realDate.has(id) || !(allowed.has(id) || wasShown(userId, id))) return label || '\u0000';
      const real = realDate.get(id);
      if (label) {
        const ds = datesIn(label);
        if (!ds.length || ds.every((dt) => sameDay(real, dt))) return `[[entry:${id}|${label}]]`;
      }
      return real ? `[[entry:${id}@${real}]]` : `[[entry:${id}|${label || 'this entry'}]]`;
    }).replace(/[ \t]*\u0000/g, '');
  }

  if (known.length) {
    const parts = out.split(CITE_SPLIT_RE); // citations stay intact at odd indexes
    for (let p = 0; p < parts.length; p += 2) {
      for (const { re, parse } of DATE_PATTERNS) {
        parts[p] = parts[p].replace(re, (...args) => {
          const hits = known.filter((e) => sameDay(e.date, parse(args)));
          return hits.length === 1 ? `[[entry:${hits[0].id}|${args[0]}]]` : args[0];
        });
        // Later patterns must not re-wrap text already turned into a citation.
        const sub = parts[p].split(CITE_SPLIT_RE);
        if (sub.length > 1) parts.splice(p, 1, ...sub);
      }
    }
    out = parts.join('');
  }

  return out.replace(/(\[\[entry:(\d+)\|[^\]\n]{1,120}\]\][^[\n]{0,25}?)\s*\[\[entry:\2@\d{4}-\d{2}-\d{2}\]\]/g, '$1');
}

/** Prompt section for recalled entries (empty string when none). */
function formatRecalledEntries(recalled) {
  if (!recalled.length) return '';
  const lines = recalled.map((e) => `### ${e.date || 'undated'} — "${e.title}" (entry #${e.id})\n${e.excerpt}`);
  return `## FROM THEIR JOURNAL — ENTRIES RELATED TO THIS CONVERSATION\n` +
    `Found by searching their journal for what they're talking about now. These are their own words (excerpts — the most relevant passages). ` +
    `When it helps, refer to them specifically and by date. Never invent entries or quotes that aren't here. ${CITE_INSTRUCTION}\n\n` +
    lines.join('\n\n');
}

/**
 * The user's most recent entries, newest first. Recall finds entries by
 * topic, so "what's the latest in my life?" (no topic) used to get whatever
 * older entries sounded closest; this gives the chat a sense of "now".
 */
function latestEntries(userId, { n = 4, maxChars = 500, excludeIds = [] } = {}) {
  const skip = new Set(excludeIds.map(Number));
  return db.prepare(
    'SELECT id, title, date, body_text FROM entries WHERE user_id = ? ORDER BY COALESCE(date, created_at) DESC, id DESC LIMIT ?',
  ).all(userId, n + skip.size)
    .filter((r) => !skip.has(r.id))
    .map((r) => {
      const text = clean(safeDecrypt(userId, r.body_text));
      return {
        id: r.id, date: r.date, title: safeDecrypt(userId, r.title) || 'Untitled',
        excerpt: text.length > maxChars ? `${text.slice(0, maxChars)}…` : text,
      };
    })
    .filter((e) => e.excerpt)
    .slice(0, n);
}

/** Prompt section for the latest entries (empty string when none). */
function formatLatestEntries(latest) {
  if (!latest.length) return '';
  const lines = latest.map((e) => `### ${e.date || 'undated'} — "${e.title}" (entry #${e.id})\n${e.excerpt}`);
  return `## THEIR LATEST ENTRIES — NEWEST FIRST\n` +
    `What they've written most recently: this is "now" in their life. When they ask what's new, what's been going on lately or how they've been, ` +
    `answer from these (the topic-matched entries above may be older). ${CITE_INSTRUCTION}\n\n` +
    lines.join('\n\n');
}

/** The user's recurring themes across the whole journal, strongest first. */
function themesDigest(userId, limit = 10) {
  let rows;
  try {
    rows = db.prepare(`
      SELECT t.id, t.name, t.description, t.insight, t.weight, t.status,
             SUM(CASE WHEN n.content_type = 'entry' THEN 1 ELSE 0 END) AS entries,
             COUNT(n.id) AS links,
             MIN(e.date) AS first_date, MAX(e.date) AS last_date
      FROM threads t
      LEFT JOIN thread_nodes n ON n.thread_id = t.id
      LEFT JOIN entries e ON n.content_type = 'entry' AND e.id = n.content_id AND e.user_id = t.user_id
      WHERE t.user_id = ? AND t.status IN ('active', 'resolving')
      GROUP BY t.id
      ORDER BY CASE t.weight WHEN 'heavy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, links DESC
      LIMIT ?
    `).all(userId, limit);
  } catch (err) {
    console.warn('[journalRecall] themes query failed:', err.message);
    return '';
  }
  if (!rows.length) return '';
  const lines = rows.map((r) => {
    const name = safeDecrypt(userId, r.name) || 'Untitled theme';
    const desc = clean(safeDecrypt(userId, r.insight) || safeDecrypt(userId, r.description));
    const span = r.first_date && r.last_date
      ? (r.first_date === r.last_date ? `, ${r.first_date}` : `, ${r.first_date} → ${r.last_date}`) : '';
    const meta = `${r.weight}${r.status === 'resolving' ? ', resolving' : ''} — ${r.entries || 0} entries${span}`;
    return `- **${name}** (${meta})${desc ? `: ${desc.slice(0, 220)}${desc.length > 220 ? '…' : ''}` : ''}`;
  });
  return `## RECURRING THEMES ACROSS THEIR JOURNAL\n` +
    `Patterns Liminal has traced across their entries over time, strongest first. Use these for big-picture questions ` +
    `(what keeps coming up, what to work on, what to bring to therapy, how they've changed) — and ground them in the entries above when you can.\n` +
    lines.join('\n');
}

/**
 * The search_journal tool: topic and/or date range. Returns text for the LLM.
 * @param {{query?: string, from?: string, to?: string, limit?: number}} args
 */
async function searchJournal(userId, args = {}) {
  if (!userId) return 'Journal search is unavailable (not signed in).';
  const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 12);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(args.from || '') ? args.from : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(args.to || '') ? args.to : null;
  const query = clean(args.query);

  let results;
  if (query) {
    results = await recallEntries(userId, query, { k: limit, from, to, maxChars: 800, minScore: 0.05 });
  } else if (from || to) {
    const rows = db.prepare(
      `SELECT id, title, date, body_text FROM entries WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date DESC LIMIT ?`,
    ).all(userId, from || '0000-01-01', to || '9999-12-31', limit);
    results = rows.map((r) => ({
      id: r.id, date: r.date, title: safeDecrypt(userId, r.title) || 'Untitled',
      excerpt: (() => { const t = clean(safeDecrypt(userId, r.body_text)); return t.length > 500 ? `${t.slice(0, 500)}…` : t; })(),
    }));
  } else {
    return 'Give a query (topic) and/or a from/to date range (YYYY-MM-DD).';
  }
  if (!results.length) return 'No matching journal entries found.';
  noteShown(userId, results.map((e) => e.id));
  return `${CITE_INSTRUCTION}\n\n` +
    results.map((e) => `[${e.date || 'undated'}] "${e.title}" (entry #${e.id})\n${e.excerpt}`).join('\n\n');
}

const SEARCH_JOURNAL_TOOL = {
  name: 'search_journal',
  description: "Search the user's own journal entries by topic and/or date range. Use it whenever they ask what they wrote, " +
    'when something happened, how they felt during a period, or to find entries about a person, place or theme. ' +
    'Returns dated excerpts in their own words.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for, e.g. "my grandfather", "anxiety before gradings". Omit to list entries in a date range.' },
      from: { type: 'string', description: 'Start date YYYY-MM-DD (optional)' },
      to: { type: 'string', description: 'End date YYYY-MM-DD (optional)' },
      limit: { type: 'number', description: 'Max entries to return (default 6, max 12)' },
    },
  },
};

module.exports = {
  recallEntries, formatRecalledEntries, latestEntries, formatLatestEntries, themesDigest, searchJournal, SEARCH_JOURNAL_TOOL, splitPassages,
  linkEntryCitations, stripEntryCitations, citedIds,
};
