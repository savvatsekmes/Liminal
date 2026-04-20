/**
 * Thread service — detect and maintain narrative arcs across a user's
 * entries, notes, and oracle conversations.
 *
 * A thread is an LLM-detected through-line (a work transition, a
 * relationship, a creative project) that stitches together content of
 * multiple types into a single timeline. Detection runs on demand and
 * wipes-and-regenerates the whole set for the user.
 */

const db = require('../database');
const llm = require('./llmService');
const { encryptField, safeDecrypt } = require('./rowCrypto');

// Decrypt the sensitive text columns of a threads row. Null-safe.
function decryptThreadRow(userId, row) {
  if (!row) return row;
  if (row.name !== undefined) row.name = safeDecrypt(userId, row.name);
  if (row.description !== undefined) row.description = safeDecrypt(userId, row.description);
  if (row.insight !== undefined) row.insight = safeDecrypt(userId, row.insight);
  return row;
}

const CORPUS_LIMIT = 200;

// Canonical seed themes that always get a matching pass. These are the big
// through-lines most personal journals carry; letting the LLM discover them
// fresh each run produces near-duplicates ("Spirituality and Mysticism",
// "Spiritual Growth & Surrender", "Trust in God vs. Reality"). Seeding them
// directly gives us stable, consolidated threads and lets the LLM focus on
// discovering novel arcs on top. Threads with fewer than 2 matching items
// are dropped automatically, so an irrelevant seed just vanishes.
const CANONICAL_THEMES = [
  { name: 'spirituality & mindfulness', description: 'Spiritual practice, meditation, surrender, contemplation of the divine or sacred, and any sense of connection to something larger than the self.' },
  { name: 'career & vocation',          description: 'Work life, professional identity, creative calling, hustle, money, and questions of purpose or direction.' },
  { name: 'family & maternal',          description: 'Relationships with parents, siblings, children — especially mother figures and generational dynamics.' },
  { name: 'relationships & intimacy',   description: 'Romantic partnerships, friendships, conflict, love, and relational dynamics with peers or lovers.' },
  { name: 'creativity & identity',      description: 'Creative work, artistic expression, and ongoing questions of self, becoming, and how one wants to be seen.' },
  { name: 'mental & emotional health',  description: 'Anxiety, overwhelm, emotional regulation, depression, mood, and inner weather.' },
  { name: 'body & physical health',     description: 'Physical wellbeing, illness, healing, energy, sleep, and embodiment.' },
  { name: 'life transitions',           description: 'Major shifts, endings, letting go, liminal passages, and moving between chapters.' },
];

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function excerpt(text, n = 200) {
  const s = stripHtml(text);
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * Build the 200-item content snapshot used as input to thread detection.
 * Union of entries / notes / oracle_sessions with type + minimal preview
 * fields, sorted by recency.
 */
function parseTags(...rawArrays) {
  const out = [];
  const seen = new Set();
  for (const raw of rawArrays) {
    if (!raw) continue;
    let arr;
    try { arr = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
    if (!Array.isArray(arr)) continue;
    for (const tag of arr) {
      const s = String(tag || '').trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

function collectCorpus(userId) {
  const entries = db.prepare(`
    SELECT id, title, body_text, tags, auto_tags, breakthrough_level,
           COALESCE(date, created_at) AS item_date
      FROM entries
     WHERE user_id = ?
     ORDER BY COALESCE(date, created_at) DESC
     LIMIT ?
  `).all(userId, CORPUS_LIMIT).map((r) => ({
    type: 'entry',
    id: r.id,
    title: r.title || 'Untitled',
    excerpt: excerpt(safeDecrypt(userId, r.body_text), 200),
    date: r.item_date,
    tags: parseTags(r.tags, r.auto_tags),
    breakthrough: Number.isInteger(r.breakthrough_level) && r.breakthrough_level > 0,
  }));

  const notes = db.prepare(`
    SELECT id, type, title, body, tags, auto_tags, created_at
      FROM notes
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?
  `).all(userId, CORPUS_LIMIT).map((r) => ({
    type: 'note',
    id: r.id,
    title: r.title || r.type || 'Note',
    excerpt: excerpt(safeDecrypt(userId, r.body), 200),
    date: r.created_at,
    tags: parseTags(r.tags, r.auto_tags),
  }));

  const sessions = db.prepare(`
    SELECT s.id, s.title, s.tag, s.tags, s.auto_tags, s.created_at,
           (SELECT content FROM oracle_messages
             WHERE session_id = s.id
             ORDER BY created_at ASC
             LIMIT 1) AS first_message
      FROM oracle_sessions s
     WHERE s.user_id = ?
     ORDER BY s.created_at DESC
     LIMIT ?
  `).all(userId, CORPUS_LIMIT).map((r) => ({
    type: 'conversation',
    id: r.id,
    title: r.title || 'Conversation',
    excerpt: excerpt(safeDecrypt(userId, r.first_message), 200),
    date: r.created_at,
    tags: parseTags(r.tags, r.auto_tags, r.tag ? [r.tag] : null),
  }));

  const merged = [...entries, ...notes, ...sessions];
  merged.sort((a, b) => {
    const da = a.date ? new Date(String(a.date).replace(' ', 'T')).getTime() : 0;
    const db2 = b.date ? new Date(String(b.date).replace(' ', 'T')).getTime() : 0;
    return db2 - da;
  });
  return merged.slice(0, CORPUS_LIMIT);
}

function parseJsonWithFence(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  try { return JSON.parse(s); } catch {}
  const fence = s.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) {
    try { return JSON.parse(fence[1]); } catch {}
  }
  // Fall back: strip any prose preamble and try to parse the first
  // balanced JSON array or object found in the text.
  const first = s.search(/[\[{]/);
  if (first !== -1) {
    const open = s[first];
    const close = open === '[' ? ']' : '}';
    let depth = 0, inStr = false, esc = false;
    for (let i = first; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === open) depth++;
        else if (ch === close) {
          depth--;
          if (depth === 0) {
            const slice = s.slice(first, i + 1);
            try { return JSON.parse(slice); } catch {}
            break;
          }
        }
      }
    }
  }
  return null;
}

// Two-stage detection: first detect themes (which local LLMs do reliably),
// then per-theme ask the model to pick matching items by index from a
// numbered corpus list. Splitting the schema avoids the failure mode where
// the LLM returns themes with no node references.

const THEME_SYSTEM_PROMPT = `You are a narrative analyst for a personal journaling app called Liminal.

You will receive a time-ordered corpus of a single person's journal entries, notes, and oracle conversations, PLUS a list of canonical themes that are already being tracked. Your job is to identify 3-6 SPECIFIC novel arcs — concrete, narrow threads in this person's life that the broad canonical themes do NOT already capture.

Novel themes should be SPECIFIC and CONCRETE. Good examples of shape (not content):
- A particular practice or instrument (e.g. "learning the oud", "daily vipassana", "open-water swimming")
- A named project, business, or artifact (e.g. "building Liminal", "the Berlin trip", "the memoir draft")
- A named person or relationship arc (e.g. "mum's health", "conflict with Sam", "dating after the breakup")
- A specific recurring struggle or motif (e.g. "money anxiety", "insomnia spiral", "fear of being seen")
- A place, ritual, or recurring setting (e.g. "the studio", "morning pages", "the commute")

AVOID broad categories that overlap canonical themes. Canonical "creativity & identity" already covers general creative work — do NOT propose "creative expression" or "art journey" as novel. DO propose "learning the oud" because it names a specific instrument the person keeps returning to.

A real thread recurs. To qualify:
- Appears in at least 3 distinct corpus items.
- Shows up across weeks or months, not a single afternoon.
- Returns, develops, or is actively worked on — not mentioned once and dropped.

Prefer including a plausible specific arc over omitting it. If the person keeps mentioning X (an instrument, a project, a person, a struggle) across multiple items, it IS a novel thread even if it feels small. Tag matches like {tags: oud, music} across several entries are a strong signal.

Return ONLY a JSON array. No prose before or after. No markdown fences.

Shape:
[
  {
    "name": "short name",
    "description": "one sentence",
    "status": "active",
    "weight": "medium"
  }
]

Field rules:
- name: 2-5 words, lowercase unless a proper noun. Be specific (e.g. "learning the oud", not "music").
- description: one sentence summarising the recurring arc and citing the kind of recurrence you saw.
- status: exactly one of "active", "resolving", "complete".
- weight: exactly one of "light", "medium", "heavy".
- Return 3-6 themes. If you genuinely can't find 3 specific recurring arcs, return fewer, but lean toward including specific concrete threads rather than excluding them.`;

const MATCH_SYSTEM_PROMPT = `You help organise a personal journal.

You will receive:
1. A THEME (an ongoing life arc) with a name and description.
2. A numbered list of items from this person's journal.

Your task: return the numbers of the items that belong to this theme.

Return ONLY a JSON array of integers. No prose, no markdown, no keys.
Example: [1, 7, 12, 24]

Each item line carries useful signal beyond the title and excerpt:
- {tags: ...} are user- or AI-applied tags. Treat tag matches as a STRONG signal of belonging — if an item is tagged with something obviously aligned to the theme (e.g. tag "vipassana" or "meditation" for a spirituality theme), include it even if the excerpt is brief.
- ★breakthrough marks a journal entry the user flagged as a moment of breakthrough or realisation. These are inner-life pivots and almost always belong to the spirituality, mental health, or relevant identity-shift threads they touch on. Lean toward including breakthroughs in any inner-arc theme they could plausibly belong to.

Rules:
- Include EVERY item that genuinely relates to the theme, even tangentially. Err on the side of inclusion. Major life themes often span 30-80 items.
- Tag and ★breakthrough signals override a thin excerpt — include the item.
- If fewer than 2 items match, return [].
- Use only numbers that appear in the numbered list.`;

const INSIGHT_SYSTEM_PROMPT = `You are a narrative reflector for a personal journaling app called Liminal.

You are given one thread from a person's life — a named arc along with the journal entries, notes, and conversations that make it up. Your task is to write a short insight: what this thread is actually about, how it has moved, and where it seems to be heading.

Rules:
- 3-6 sentences, prose only. No headers, no bullets, no lists.
- Write in the second person, addressing the person directly ("you"), warm but not gushing.
- Draw on specifics from the items — name things they wrote, don't speak in generalities.
- If the thread seems to be shifting, resolving, or stuck, say so plainly.
- Do not label which items you are citing. Just speak.
- Return the prose only, no preamble.`;

function buildNumberedCorpusLines(corpus, excerptLen = 160) {
  return corpus.map((c, i) => {
    const dateStr = c.date ? String(c.date).slice(0, 10) : '';
    const ex = (c.excerpt || '').slice(0, excerptLen);
    const tagStr = c.tags && c.tags.length ? ` {tags: ${c.tags.slice(0, 6).join(', ')}}` : '';
    const bt = c.breakthrough ? ' ★breakthrough' : '';
    return `${i + 1}. [${c.type}]${bt} ${dateStr} — ${c.title}${tagStr}: ${ex}`;
  }).join('\n');
}

async function detectThemes(corpus) {
  // Local models slow down dramatically with long contexts, so we truncate
  // aggressively for the theme pass — titles + short excerpts are enough to
  // surface broad arcs.
  const themeCorpus = corpus.slice(0, 140);
  const corpusLines = buildNumberedCorpusLines(themeCorpus, 80);
  const canonicalList = CANONICAL_THEMES.map((c, i) => `${i + 1}. ${c.name} — ${c.description}`).join('\n');
  const userMessage = `CANONICAL THEMES (already tracked, do NOT duplicate):\n${canonicalList}\n\nCORPUS (most recent first):\n\n${corpusLines}\n\nReturn the JSON array of 3-6 specific novel themes (concrete practices, instruments, projects, named people, specific struggles). Lean toward including specific arcs rather than excluding them.`;

  const t0 = Date.now();
  console.log(`[threads] theme stage: corpus size ${themeCorpus.length} (truncated from ${corpus.length})`);
  const raw = await llm.call(THEME_SYSTEM_PROMPT, userMessage, { maxTokens: 1200 });
  console.log(`[threads] theme stage done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`[threads] theme raw (first 600):`, (raw || '').slice(0, 600));

  const parsed = parseJsonWithFence(raw);
  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed?.themes || parsed?.threads || parsed?.items || []);
  if (!Array.isArray(arr)) return [];

  return arr.map((t) => {
    // Tolerate bare strings — local models often emit ["Theme A", "Theme B", ...]
    if (typeof t === 'string') {
      const name = t.trim().slice(0, 120);
      return { name, description: name, status: 'active', weight: 'medium' };
    }
    if (!t || typeof t !== 'object') return null;
    const name = String(t.name || t.theme || t.title || '').trim().slice(0, 120);
    const description = String(t.description || t.summary || t.core_insight || name).trim().slice(0, 400);
    const status = ['active', 'resolving', 'complete'].includes(t.status) ? t.status : 'active';
    const weight = ['light', 'medium', 'heavy'].includes(t.weight) ? t.weight : 'medium';
    return { name, description, status, weight };
  }).filter((t) => t && t.name);
}

async function matchItemsToTheme(theme, corpus) {
  const corpusLines = buildNumberedCorpusLines(corpus, 80);
  const userMessage = `THEME: ${theme.name}\nDescription: ${theme.description}\n\nITEMS:\n${corpusLines}\n\nReturn a JSON array of item numbers that belong to this theme.`;

  const t0 = Date.now();
  console.log(`[threads] matching "${theme.name}" against ${corpus.length} items…`);
  const raw = await llm.call(MATCH_SYSTEM_PROMPT, userMessage, { maxTokens: 1200 });
  console.log(`[threads] matched "${theme.name}" in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`[threads] match "${theme.name}" raw (first 300):`, (raw || '').slice(0, 300));

  // Extract integers from the response. Accept a bare JSON array, an object
  // wrapping it, or any prose that contains numbers.
  let nums = [];
  const parsed = parseJsonWithFence(raw);
  if (Array.isArray(parsed)) {
    nums = parsed;
  } else if (parsed && typeof parsed === 'object') {
    for (const key of ['items', 'numbers', 'matches', 'ids']) {
      if (Array.isArray(parsed[key])) { nums = parsed[key]; break; }
    }
  }
  if (!nums.length) {
    const matches = String(raw || '').match(/\b\d+\b/g);
    if (matches) nums = matches.map(Number);
  }

  const seen = new Set();
  const nodes = [];
  for (const raw of nums) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > corpus.length) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    const item = corpus[n - 1];
    if (item) nodes.push({ type: item.type, id: item.id });
  }
  return nodes;
}

/**
 * Two-stage detection:
 *   1. Ask the LLM for a list of themes (name/description/status/weight).
 *   2. For each theme, ask which numbered corpus items belong to it.
 *
 * onMatchProgress(done, total) is called after each theme's match pass so
 * the HTTP route can surface progress to the UI.
 */
function normaliseThemeKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function detectThreadsFromCorpus(corpus, onMatchProgress) {
  if (!corpus.length) return [];

  const novelThemes = await detectThemes(corpus);
  console.log(`[threads] theme stage returned ${novelThemes.length} novel themes`);

  // Merge canonical seeds + LLM-discovered themes. Canonical runs first so
  // the big arcs get priority; LLM themes are de-duped by normalised name.
  const canonical = CANONICAL_THEMES.map((c) => ({
    name: c.name, description: c.description, status: 'active', weight: 'medium', kind: 'canonical',
  }));
  const seenKeys = new Set(canonical.map((t) => normaliseThemeKey(t.name)));
  const filteredNovel = novelThemes.filter((t) => {
    const k = normaliseThemeKey(t.name);
    if (seenKeys.has(k)) return false;
    seenKeys.add(k);
    return true;
  }).map((t) => ({ ...t, kind: 'novel' }));
  const themes = [...canonical, ...filteredNovel];
  console.log(`[threads] matching ${themes.length} themes (${canonical.length} canonical + ${filteredNovel.length} novel)`);

  // Match against the most recent 120 items — keeps 12+ LLM calls from
  // ballooning past 10 minutes on a local model. If a theme only lives in
  // very old entries, it'll surface next re-detect as recent items accrue.
  const matchCorpus = corpus.slice(0, 120);

  const results = [];
  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    if (typeof onMatchProgress === 'function') {
      // Report progress BEFORE the call so the UI shows the current theme
      // while it is being worked on, not after it finishes.
      onMatchProgress(i, themes.length, theme.name);
    }
    let nodes = [];
    try {
      nodes = await matchItemsToTheme(theme, matchCorpus);
    } catch (err) {
      console.error(`[threads] match failed for "${theme.name}":`, err.message);
    }
    console.log(`[threads] "${theme.name}" matched ${nodes.length} items`);
    // Canonical seeds are the user's expected core arcs — surface them even
    // if sparse. Novel/custom use the same 2-bead threshold (matches the UI
    // visibility filter).
    const minNodes = 2;
    if (nodes.length >= minNodes) {
      results.push({ ...theme, nodes });
    }
    if (typeof onMatchProgress === 'function') {
      onMatchProgress(i + 1, themes.length, theme.name);
    }
  }

  console.log(`[threads] final threads after filtering: ${results.length}`);
  return results;
}

async function generateInsight(thread, nodesWithPreviews) {
  if (!nodesWithPreviews.length) return '';

  const itemLines = nodesWithPreviews.map((n) => {
    const dateStr = n.date ? String(n.date).slice(0, 10) : '';
    return `[${n.type}] ${dateStr} — ${n.title}\n  ${n.excerpt}`;
  }).join('\n\n');

  const userMessage = `THREAD: ${thread.name}\nDescription: ${thread.description}\n\nITEMS:\n\n${itemLines}\n\nWrite the insight.`;

  const raw = await llm.call(INSIGHT_SYSTEM_PROMPT, userMessage, { maxTokens: 600 });
  return (raw || '').trim();
}

function wipeThreadsForUser(userId) {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM thread_nodes WHERE thread_id IN (SELECT id FROM threads WHERE user_id = ?)`).run(userId);
    db.prepare(`DELETE FROM threads WHERE user_id = ?`).run(userId);
  });
  tx();
}

function persistThreads(userId, detectedThreads) {
  const insertThread = db.prepare(`
    INSERT INTO threads (user_id, name, description, status, weight, insight, kind)
    VALUES (?, ?, ?, ?, ?, '', ?)
  `);
  const insertNode = db.prepare(`
    INSERT INTO thread_nodes (thread_id, content_type, content_id) VALUES (?, ?, ?)
  `);

  const createdIds = [];
  const tx = db.transaction(() => {
    for (const t of detectedThreads) {
      const kind = t.kind || 'novel';
      const res = insertThread.run(
        userId,
        encryptField(userId, t.name),
        encryptField(userId, t.description),
        t.status,
        t.weight,
        kind,
      );
      const threadId = res.lastInsertRowid;
      createdIds.push(threadId);
      for (const node of t.nodes) {
        insertNode.run(threadId, node.type, node.id);
      }
    }
  });
  tx();
  return createdIds;
}

/**
 * Re-run item matching for a single existing thread. Replaces its nodes
 * (keeps the thread row + name/description/insight) and regenerates the
 * insight.
 */
async function rematchThread(threadId, userId) {
  const thread = decryptThreadRow(userId,
    db.prepare('SELECT id, name, description FROM threads WHERE id = ? AND user_id = ?').get(threadId, userId)
  );
  if (!thread) return null;

  const corpus = collectCorpus(userId);
  if (!corpus.length) return { nodeCount: 0 };

  const matchCorpus = corpus.slice(0, 120);
  const nodes = await matchItemsToTheme({ name: thread.name, description: thread.description }, matchCorpus);

  const insertNode = db.prepare(`INSERT INTO thread_nodes (thread_id, content_type, content_id) VALUES (?, ?, ?)`);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM thread_nodes WHERE thread_id = ?').run(threadId);
    for (const node of nodes) insertNode.run(threadId, node.type, node.id);
    db.prepare('UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(threadId);
  });
  tx();

  try {
    await regenerateInsightForThread(threadId, userId);
  } catch (err) {
    console.error(`[threads] insight regen for ${threadId} failed:`, err.message);
  }
  return { nodeCount: nodes.length };
}

/**
 * Create a user-defined custom thread, then immediately match items to it.
 */
async function createCustomThread(userId, name, description) {
  const cleanName = String(name || '').trim().slice(0, 120);
  const cleanDesc = String(description || '').trim().slice(0, 400);
  if (!cleanName) throw new Error('Thread name required');

  const insert = db.prepare(`
    INSERT INTO threads (user_id, name, description, status, weight, insight, kind)
    VALUES (?, ?, ?, 'active', 'medium', '', 'custom')
  `);
  const res = insert.run(userId, encryptField(userId, cleanName), encryptField(userId, cleanDesc));
  const threadId = res.lastInsertRowid;

  await rematchThread(threadId, userId);
  return threadId;
}

function getHydratedNodes(threadId, userId) {
  const rows = db.prepare(`
    SELECT id, content_type, content_id, created_at
      FROM thread_nodes
     WHERE thread_id = ?
     ORDER BY id ASC
  `).all(threadId);

  if (!rows.length) return [];

  const entryIds = rows.filter((r) => r.content_type === 'entry').map((r) => r.content_id);
  const noteIds = rows.filter((r) => r.content_type === 'note').map((r) => r.content_id);
  const sessionIds = rows.filter((r) => r.content_type === 'conversation').map((r) => r.content_id);

  const entries = entryIds.length ? db.prepare(`
    SELECT id, title, body_text, COALESCE(date, created_at) AS item_date
      FROM entries
     WHERE user_id = ? AND id IN (${entryIds.map(() => '?').join(',')})
  `).all(userId, ...entryIds) : [];

  const notes = noteIds.length ? db.prepare(`
    SELECT id, type, title, body, created_at
      FROM notes
     WHERE user_id = ? AND id IN (${noteIds.map(() => '?').join(',')})
  `).all(userId, ...noteIds) : [];

  const sessions = sessionIds.length ? db.prepare(`
    SELECT s.id, s.title, s.created_at,
           (SELECT content FROM oracle_messages
             WHERE session_id = s.id
             ORDER BY created_at ASC
             LIMIT 1) AS first_message
      FROM oracle_sessions s
     WHERE s.user_id = ? AND s.id IN (${sessionIds.map(() => '?').join(',')})
  `).all(userId, ...sessionIds) : [];

  const byEntry = new Map(entries.map((e) => [e.id, e]));
  const byNote = new Map(notes.map((n) => [n.id, n]));
  const bySession = new Map(sessions.map((s) => [s.id, s]));

  const hydrated = rows.map((r) => {
    if (r.content_type === 'entry') {
      const e = byEntry.get(r.content_id);
      if (!e) return null;
      return {
        node_id: r.id,
        type: 'entry',
        id: e.id,
        title: e.title || 'Untitled',
        excerpt: excerpt(safeDecrypt(userId, e.body_text), 200),
        date: e.item_date,
      };
    }
    if (r.content_type === 'note') {
      const n = byNote.get(r.content_id);
      if (!n) return null;
      return {
        node_id: r.id,
        type: 'note',
        id: n.id,
        title: n.title || n.type || 'Note',
        excerpt: excerpt(safeDecrypt(userId, n.body), 200),
        date: n.created_at,
      };
    }
    if (r.content_type === 'conversation') {
      const s = bySession.get(r.content_id);
      if (!s) return null;
      return {
        node_id: r.id,
        type: 'conversation',
        id: s.id,
        title: s.title || 'Conversation',
        excerpt: excerpt(safeDecrypt(userId, s.first_message), 200),
        date: s.created_at,
      };
    }
    return null;
  }).filter(Boolean);

  hydrated.sort((a, b) => {
    const da = a.date ? new Date(String(a.date).replace(' ', 'T')).getTime() : 0;
    const db2 = b.date ? new Date(String(b.date).replace(' ', 'T')).getTime() : 0;
    return db2 - da;
  });

  return hydrated;
}

// ─── Incremental threading (rosary-bead model) ─────────────────────────────
//
// Instead of wiping and rebuilding the whole thread graph every time, we
// place a single bead on matching threads for each new interaction (Reflect,
// Oracle turn, Note save). Items that match zero threads are "orphans" —
// once ≥3 orphans cluster around a common theme, a mini-detect promotes them
// into a new novel thread.

const MATCH_ITEM_SYSTEM_PROMPT = `You help organise a personal journal.

You will receive:
1. ONE item from this person's journal (a journal entry, note, or conversation).
2. A numbered list of ongoing THREADS (life arcs) with name + description.

Your task: return the numbers of every thread this item belongs to.

Return ONLY a JSON array of integers. No prose, no markdown, no keys.
Examples: [2, 7]   or   [1]   or   []

Rules:
- Include EVERY thread the item genuinely relates to, even tangentially. An item often belongs to multiple threads.
- Item tag matches (the {tags: ...} line) to a thread's name/description are a STRONG signal of belonging.
- ★breakthrough items are inner-life pivots — lean toward including them in any inner-arc thread they plausibly touch.
- If the item fits no thread, return [].
- Use only numbers that appear in the numbered thread list.`;

function buildSingleItemLine(item, excerptLen = 200) {
  const dateStr = item.date ? String(item.date).slice(0, 10) : '';
  const ex = (item.excerpt || '').slice(0, excerptLen);
  const tagStr = item.tags && item.tags.length ? ` {tags: ${item.tags.slice(0, 8).join(', ')}}` : '';
  const bt = item.breakthrough ? ' ★breakthrough' : '';
  return `[${item.type}]${bt} ${dateStr} — ${item.title}${tagStr}: ${ex}`;
}

function hydrateItem(type, id, userId) {
  if (type === 'entry') {
    const r = db.prepare(`
      SELECT id, title, body_text, tags, auto_tags, breakthrough_level,
             COALESCE(date, created_at) AS item_date
        FROM entries
       WHERE id = ? AND user_id = ?
    `).get(id, userId);
    if (!r) return null;
    return {
      type: 'entry',
      id: r.id,
      title: r.title || 'Untitled',
      excerpt: excerpt(safeDecrypt(userId, r.body_text), 200),
      date: r.item_date,
      tags: parseTags(r.tags, r.auto_tags),
      breakthrough: Number.isInteger(r.breakthrough_level) && r.breakthrough_level > 0,
    };
  }
  if (type === 'note') {
    const r = db.prepare(`
      SELECT id, type, title, body, tags, auto_tags, created_at
        FROM notes
       WHERE id = ? AND user_id = ?
    `).get(id, userId);
    if (!r) return null;
    return {
      type: 'note',
      id: r.id,
      title: r.title || r.type || 'Note',
      excerpt: excerpt(safeDecrypt(userId, r.body), 200),
      date: r.created_at,
      tags: parseTags(r.tags, r.auto_tags),
    };
  }
  if (type === 'conversation') {
    const r = db.prepare(`
      SELECT s.id, s.title, s.tag, s.tags, s.auto_tags, s.created_at,
             (SELECT content FROM oracle_messages
               WHERE session_id = s.id
               ORDER BY created_at ASC
               LIMIT 1) AS first_message
        FROM oracle_sessions s
       WHERE s.id = ? AND s.user_id = ?
    `).get(id, userId);
    if (!r) return null;
    return {
      type: 'conversation',
      id: r.id,
      title: r.title || 'Conversation',
      excerpt: excerpt(safeDecrypt(userId, r.first_message), 200),
      date: r.created_at,
      tags: parseTags(r.tags, r.auto_tags, r.tag ? [r.tag] : null),
    };
  }
  return null;
}

function stampThreadedAt(type, id) {
  if (type === 'entry') {
    db.prepare('UPDATE entries SET threaded_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  } else if (type === 'note') {
    db.prepare('UPDATE notes SET threaded_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  } else if (type === 'conversation') {
    db.prepare('UPDATE oracle_sessions SET threaded_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }
}

// Add `UNIQUE(thread_id, content_type, content_id)` semantics without the DDL
// migration — callers use this ignoring-duplicates helper.
function insertThreadNodeIgnoreDup(threadId, contentType, contentId) {
  const existing = db.prepare(
    'SELECT id FROM thread_nodes WHERE thread_id = ? AND content_type = ? AND content_id = ?'
  ).get(threadId, contentType, contentId);
  if (existing) return false;
  db.prepare(
    'INSERT INTO thread_nodes (thread_id, content_type, content_id) VALUES (?, ?, ?)'
  ).run(threadId, contentType, contentId);
  return true;
}

function ensureCanonicalThreadsExist(userId) {
  const existingRows = db.prepare(
    "SELECT name FROM threads WHERE user_id = ? AND kind = 'canonical'"
  ).all(userId);
  // Canonical thread names are encrypted on disk; decrypt before keying so we
  // don't insert duplicates on every launch.
  const have = new Set(existingRows.map((r) => normaliseThemeKey(safeDecrypt(userId, r.name) || '')));
  const missing = CANONICAL_THEMES.filter((c) => !have.has(normaliseThemeKey(c.name)));
  if (!missing.length) return 0;
  const insert = db.prepare(`
    INSERT INTO threads (user_id, name, description, status, weight, insight, kind)
    VALUES (?, ?, ?, 'active', 'medium', '', 'canonical')
  `);
  const tx = db.transaction(() => {
    for (const c of missing) insert.run(userId, encryptField(userId, c.name), encryptField(userId, c.description));
  });
  tx();
  return missing.length;
}

async function threadSingleItem(type, id, userId) {
  ensureCanonicalThreadsExist(userId);

  const item = hydrateItem(type, id, userId);
  if (!item) return { matched: [] };

  const threads = db.prepare(
    'SELECT id, name, description, kind FROM threads WHERE user_id = ? ORDER BY id ASC'
  ).all(userId).map((r) => decryptThreadRow(userId, r));

  // No threads at all (shouldn't happen after ensureCanonical, but be safe).
  if (!threads.length) {
    stampThreadedAt(type, id);
    return { matched: [] };
  }

  const threadLines = threads.map((t, i) => `${i + 1}. ${t.name} — ${t.description}`).join('\n');
  const itemLine = buildSingleItemLine(item, 240);
  const userMessage = `THREADS:\n${threadLines}\n\nITEM:\n${itemLine}\n\nReturn a JSON array of thread numbers the item belongs to, or [] if none.`;

  let raw = '';
  try {
    const t0 = Date.now();
    raw = await llm.call(MATCH_ITEM_SYSTEM_PROMPT, userMessage, { maxTokens: 200 });
    console.log(`[threads] bead ${type}:${id} matched in ${((Date.now() - t0) / 1000).toFixed(1)}s raw=${(raw || '').slice(0, 120)}`);
  } catch (err) {
    console.error(`[threads] bead ${type}:${id} LLM call failed:`, err.message);
    stampThreadedAt(type, id);
    return { matched: [] };
  }

  let nums = [];
  const parsed = parseJsonWithFence(raw);
  if (Array.isArray(parsed)) nums = parsed;
  else if (parsed && typeof parsed === 'object') {
    for (const key of ['items', 'numbers', 'matches', 'ids', 'threads']) {
      if (Array.isArray(parsed[key])) { nums = parsed[key]; break; }
    }
  }
  if (!nums.length) {
    const matches = String(raw || '').match(/\b\d+\b/g);
    if (matches) nums = matches.map(Number);
  }

  const matchedIds = [];
  const seen = new Set();
  for (const n of nums) {
    const idx = Number(n);
    if (!Number.isInteger(idx) || idx < 1 || idx > threads.length) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    matchedIds.push(threads[idx - 1].id);
  }

  const tx = db.transaction(() => {
    for (const threadId of matchedIds) {
      insertThreadNodeIgnoreDup(threadId, type, id);
      db.prepare('UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(threadId);
    }
    stampThreadedAt(type, id);
  });
  tx();

  return { matched: matchedIds };
}

// Collect orphan items: threaded_at IS NOT NULL, but no thread_nodes row.
function collectOrphans(userId, limit = 80) {
  const entries = db.prepare(`
    SELECT e.id, e.title, e.body_text, e.tags, e.auto_tags, e.breakthrough_level,
           COALESCE(e.date, e.created_at) AS item_date
      FROM entries e
     WHERE e.user_id = ?
       AND e.threaded_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM thread_nodes n
          WHERE n.content_type = 'entry' AND n.content_id = e.id
       )
     ORDER BY COALESCE(e.date, e.created_at) DESC
     LIMIT ?
  `).all(userId, limit).map((r) => ({
    type: 'entry',
    id: r.id,
    title: r.title || 'Untitled',
    excerpt: excerpt(safeDecrypt(userId, r.body_text), 200),
    date: r.item_date,
    tags: parseTags(r.tags, r.auto_tags),
    breakthrough: Number.isInteger(r.breakthrough_level) && r.breakthrough_level > 0,
  }));

  const notes = db.prepare(`
    SELECT n.id, n.type, n.title, n.body, n.tags, n.auto_tags, n.created_at
      FROM notes n
     WHERE n.user_id = ?
       AND n.threaded_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM thread_nodes tn
          WHERE tn.content_type = 'note' AND tn.content_id = n.id
       )
     ORDER BY n.created_at DESC
     LIMIT ?
  `).all(userId, limit).map((r) => ({
    type: 'note',
    id: r.id,
    title: r.title || r.type || 'Note',
    excerpt: excerpt(safeDecrypt(userId, r.body), 200),
    date: r.created_at,
    tags: parseTags(r.tags, r.auto_tags),
  }));

  const sessions = db.prepare(`
    SELECT s.id, s.title, s.tag, s.tags, s.auto_tags, s.created_at,
           (SELECT content FROM oracle_messages
             WHERE session_id = s.id
             ORDER BY created_at ASC
             LIMIT 1) AS first_message
      FROM oracle_sessions s
     WHERE s.user_id = ?
       AND s.threaded_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM thread_nodes tn
          WHERE tn.content_type = 'conversation' AND tn.content_id = s.id
       )
     ORDER BY s.created_at DESC
     LIMIT ?
  `).all(userId, limit).map((r) => ({
    type: 'conversation',
    id: r.id,
    title: r.title || 'Conversation',
    excerpt: excerpt(safeDecrypt(userId, r.first_message), 200),
    date: r.created_at,
    tags: parseTags(r.tags, r.auto_tags, r.tag ? [r.tag] : null),
  }));

  const merged = [...entries, ...notes, ...sessions];
  merged.sort((a, b) => {
    const da = a.date ? new Date(String(a.date).replace(' ', 'T')).getTime() : 0;
    const db2 = b.date ? new Date(String(b.date).replace(' ', 'T')).getTime() : 0;
    return db2 - da;
  });
  return merged.slice(0, limit);
}

async function sweepOrphans(userId) {
  const orphans = collectOrphans(userId, 80);
  if (orphans.length < 2) return { promoted: 0, orphans: orphans.length };

  console.log(`[threads] sweepOrphans: ${orphans.length} orphans to cluster`);
  const novelThemes = await detectThemes(orphans);
  console.log(`[threads] sweepOrphans: LLM proposed ${novelThemes.length} novel themes`);

  // Skip themes whose name collides with an existing thread for this user.
  const existingKeys = new Set(
    db.prepare('SELECT name FROM threads WHERE user_id = ?').all(userId)
      .map((r) => normaliseThemeKey(safeDecrypt(userId, r.name) || ''))
  );
  const candidates = novelThemes.filter((t) => {
    const k = normaliseThemeKey(t.name);
    if (existingKeys.has(k)) return false;
    existingKeys.add(k);
    return true;
  }).map((t) => ({ ...t, kind: 'novel' }));

  const survivors = [];
  for (const theme of candidates) {
    let nodes = [];
    try { nodes = await matchItemsToTheme(theme, orphans); }
    catch (err) { console.error(`[threads] sweepOrphans match failed "${theme.name}":`, err.message); }
    if (nodes.length >= 2) survivors.push({ ...theme, nodes });
  }

  if (!survivors.length) return { promoted: 0, orphans: orphans.length };

  const threadIds = persistThreads(userId, survivors);

  // Kick insight generation in the background (best-effort, not blocking).
  setImmediate(async () => {
    for (const tid of threadIds) {
      try { await regenerateInsightForThread(tid, userId); }
      catch (err) { console.error(`[threads] sweepOrphans insight ${tid} failed:`, err.message); }
    }
  });

  return { promoted: threadIds.length, orphans: orphans.length };
}

// Process items with threaded_at IS NULL — items the user touched but never
// reflected on (notes, entries saved without Reflect, etc.). Bounded to 20
// per invocation so the before-quit sweep doesn't stall quit.
async function sweepUnthreaded(userId, limit = 20) {
  ensureCanonicalThreadsExist(userId);

  const entries = db.prepare(`
    SELECT id FROM entries
     WHERE user_id = ? AND threaded_at IS NULL
     ORDER BY COALESCE(date, created_at) DESC
     LIMIT ?
  `).all(userId, limit).map((r) => ({ type: 'entry', id: r.id }));

  const notes = db.prepare(`
    SELECT id FROM notes
     WHERE user_id = ? AND threaded_at IS NULL
     ORDER BY created_at DESC
     LIMIT ?
  `).all(userId, limit).map((r) => ({ type: 'note', id: r.id }));

  const sessions = db.prepare(`
    SELECT id FROM oracle_sessions
     WHERE user_id = ? AND threaded_at IS NULL
     ORDER BY created_at DESC
     LIMIT ?
  `).all(userId, limit).map((r) => ({ type: 'conversation', id: r.id }));

  // Interleave types so a quick sweep touches all three, capped at `limit` total.
  const queue = [];
  const maxLen = Math.max(entries.length, notes.length, sessions.length);
  for (let i = 0; i < maxLen && queue.length < limit; i++) {
    if (entries[i] && queue.length < limit) queue.push(entries[i]);
    if (notes[i] && queue.length < limit) queue.push(notes[i]);
    if (sessions[i] && queue.length < limit) queue.push(sessions[i]);
  }

  console.log(`[threads] sweepUnthreaded: ${queue.length} items (limit ${limit})`);
  let processed = 0;
  for (const it of queue) {
    try { await threadSingleItem(it.type, it.id, userId); processed++; }
    catch (err) { console.error(`[threads] sweepUnthreaded ${it.type}:${it.id} failed:`, err.message); }
  }

  let promoted = 0;
  try { ({ promoted } = await sweepOrphans(userId)); }
  catch (err) { console.error('[threads] sweepOrphans failed:', err.message); }

  return { processed, promoted };
}

// Mark every item in a user's corpus as threaded so the incremental pipeline
// starts from a clean baseline after a full re-detect.
function stampAllThreaded(userId) {
  const tx = db.transaction(() => {
    db.prepare('UPDATE entries         SET threaded_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(userId);
    db.prepare('UPDATE notes           SET threaded_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(userId);
    db.prepare('UPDATE oracle_sessions SET threaded_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(userId);
  });
  tx();
}

async function regenerateInsightForThread(threadId, userId) {
  const thread = decryptThreadRow(userId,
    db.prepare('SELECT id, name, description FROM threads WHERE id = ? AND user_id = ?').get(threadId, userId)
  );
  if (!thread) return null;
  const nodes = getHydratedNodes(threadId, userId);
  const insight = await generateInsight(thread, nodes);
  db.prepare('UPDATE threads SET insight = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .run(encryptField(userId, insight), threadId, userId);
  return insight;
}

module.exports = {
  collectCorpus,
  detectThreadsFromCorpus,
  generateInsight,
  wipeThreadsForUser,
  persistThreads,
  getHydratedNodes,
  regenerateInsightForThread,
  rematchThread,
  createCustomThread,
  threadSingleItem,
  ensureCanonicalThreadsExist,
  sweepOrphans,
  sweepUnthreaded,
  stampAllThreaded,
};
