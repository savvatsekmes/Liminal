/**
 * Notion import service — "Leela" rich-format aware.
 *
 * Accepts a ZIP path or unzipped folder path from a Notion Markdown export.
 * For each `.md` file it:
 *   1. Parses the title to extract date (`DD.MM.YYYY -`, `DD MM YYYY -`, or `YYYY-MM-DD -`)
 *      and breakthrough (🫠) / fight (🔥) signals
 *   2. Splits body from legacy reflections (first `---`+`##` or first `##` heading)
 *   3. Converts markdown → Tiptap-compatible HTML, preserving images + YouTube embeds
 *   4. Copies image assets from the Notion ZIP folder into DATA_DIR/journal-media/<id>/
 *      and rewrites body HTML to reference them via /api/media/<id>/<file>
 *   5. Inserts entry row, then reflection row (if any) with source='imported'
 * Finally kicks off background embedding + initial rolling summary generation.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const os = require('os');
const db = require('../database');
const { indexEntry } = require('./embeddingService');
const llm = require('./llmService');
const { DATA_DIR } = require('../paths');

const MEDIA_ROOT = path.join(DATA_DIR, 'journal-media');
if (!fs.existsSync(MEDIA_ROOT)) fs.mkdirSync(MEDIA_ROOT, { recursive: true });

const MEDIA_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.svg']);
const YOUTUBE_RE = /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})[^\s)]*/;

// ── Public API ───────────────────────────────────────────────────────────────

async function importFromNotion(sourcePath, onProgress = () => {}) {
  let workDir = sourcePath;
  let tempDir = null;

  if (sourcePath.toLowerCase().endsWith('.zip')) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liminal-notion-'));
    onProgress(0, 0, 'Extracting ZIP...');
    new AdmZip(sourcePath).extractAllTo(tempDir, true);
    workDir = tempDir;
  }

  // Load CSV tags once (best-effort — missing is fine)
  const csvTagMap = loadCsvTagMap(workDir);

  const mdFiles = walkMarkdown(workDir);
  const total = mdFiles.length;
  onProgress(0, total, `Found ${total} entries`);

  let imported = 0, skipped = 0, errors = 0;

  for (let i = 0; i < mdFiles.length; i++) {
    const filePath = mdFiles[i];
    try {
      const parsed = processMarkdownFile(filePath, csvTagMap);
      if (!parsed) {
        skipped++;
      } else {
        const saved = saveEntry(parsed);
        if (saved === 'skipped') skipped++;
        else imported++;
      }
    } catch (err) {
      console.error(`[notion-import] Error processing ${filePath}:`, err.message);
      errors++;
    }

    if ((i + 1) % 10 === 0 || i === mdFiles.length - 1) {
      onProgress(i + 1, total, `Importing... ${i + 1}/${total}`);
    }
  }

  if (tempDir) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }

  onProgress(total, total, `Import complete: ${imported} imported, ${skipped} skipped`);
  return { imported, skipped, errors };
}

async function embedAllEntries(onProgress = () => {}) {
  const rows = db
    .prepare(
      `SELECT e.id, e.body_text FROM entries e
       LEFT JOIN entry_embeddings ee ON ee.entry_id = e.id
       WHERE ee.entry_id IS NULL AND e.body_text != ''`
    )
    .all();

  const total = rows.length;
  let done = 0;

  for (const row of rows) {
    const ok = await indexEntry(row.id, row.body_text);
    if (ok) {
      db.prepare(
        'INSERT OR REPLACE INTO entry_embeddings (entry_id, embedded_at) VALUES (?, CURRENT_TIMESTAMP)'
      ).run(row.id);
    }
    done++;
    if (done % 10 === 0 || done === total) onProgress(done, total);
  }
}

async function generateInitialSummary() {
  const rows = db
    .prepare('SELECT title, body_text, date FROM entries ORDER BY date DESC, created_at DESC LIMIT 20')
    .all();
  if (!rows.length) return;

  const corpus = rows
    .map((r) => `[${r.date || 'unknown'}] ${r.title}\n${r.body_text}`)
    .join('\n\n---\n\n');

  const systemPrompt = `You are a memory curator for a personal journaling app called Liminal.
Based on these journal entries, write a concise (~800 token) summary of who this person is.

The summary should capture:
- Who they are (work, creative practice, physical practice, spiritual orientation)
- Key relationships and their names
- Recurring themes and emotional patterns
- Ongoing life situations and transitions
- Growth edges and recurring struggles

Be factual, warm, and specific. Use third person ("The user is...").
Return only the summary text, nothing else.`;

  try {
    const summary = await llm.call(systemPrompt, corpus, { maxTokens: 900 });
    const trimmed = summary.trim();
    const existing = db.prepare('SELECT id FROM memory WHERE id = 1').get();
    if (existing) {
      db.prepare('UPDATE memory SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(trimmed);
    } else {
      db.prepare('INSERT INTO memory (id, summary) VALUES (1, ?)').run(trimmed);
    }
    console.log('[notion-import] Initial rolling summary generated.');
    return trimmed;
  } catch (err) {
    console.error('[notion-import] Failed to generate initial summary:', err.message);
  }
}

// ── File walking ─────────────────────────────────────────────────────────────

function walkMarkdown(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdown(fullPath));
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Per-file processing ──────────────────────────────────────────────────────

function processMarkdownFile(filePath, csvTagMap) {
  const filename = path.basename(filePath, '.md');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const stripped = stripFrontmatter(raw).trim();
  if (!stripped) return null;

  const { date, title, tags, breakthrough_level } = parseTitle(filename, filePath);

  const { bodyMd, reflectionMd } = splitReflection(stripped);

  // Collect media references from body markdown and the page's sibling asset folder
  const pageAssetDir = findAssetDir(filePath, filename);
  const mediaRefs = collectMediaRefs(bodyMd, path.dirname(filePath));

  const body_text = markdownToPlainText(bodyMd);

  const merged = mergeTags(tags, csvTagMap[normaliseTitleKey(title)] || []);

  return {
    title,
    bodyMd,
    body_text,
    date,
    tags: merged,
    breakthrough_level,
    reflectionMd,
    mediaRefs,
    pageAssetDir,
    sourceDir: path.dirname(filePath),
  };
}

// ── Title parsing (date + emoji signals) ─────────────────────────────────────

const BREAKTHROUGH_EMOJI = '🫠';
const FIGHT_EMOJI = '🔥';

function parseTitle(filename, filePath) {
  // Strip Notion's trailing 32-char hex ID
  let name = filename.replace(/\s+[a-f0-9]{32}$/i, '').trim();

  let date = null;
  let title = name;

  // Format 1: "DD.MM.YYYY - Title" (the user's manual format)
  let m = name.match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–—]\s*(.+)$/);
  if (m) {
    const [, d, mo, y, t] = m;
    date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    title = t;
  } else {
    // Format 2: "DD MM YYYY - Title"
    m = name.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})\s*[-–—]\s*(.+)$/);
    if (m) {
      const [, d, mo, y, t] = m;
      date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      title = t;
    } else {
      // Format 3: "YYYY-MM-DD - Title"
      m = name.match(/^(\d{4})-(\d{2})-(\d{2})\s*[-–—]?\s*(.+)$/);
      if (m) {
        const [, y, mo, d, t] = m;
        date = `${y}-${mo}-${d}`;
        title = t;
      }
    }
  }

  if (!date) {
    try {
      const stat = fs.statSync(filePath);
      date = stat.mtime.toISOString().split('T')[0];
    } catch {
      date = new Date().toISOString().split('T')[0];
    }
  }

  // Now strip trailing signal emojis + the dashes that precede them
  title = title.trim();
  const tags = [];
  let breakthrough_level = null;

  // Detect 🫠 anywhere in the tail, capture the run of dashes before it
  const bt = title.match(/([—–-]*)\s*🫠+\s*$/);
  if (bt) {
    breakthrough_level = (bt[1] || '').length;
    title = title.slice(0, bt.index).trim();
    tags.push('breakthrough');
  }
  const fight = title.match(/([—–-]*)\s*🔥+\s*$/);
  if (fight) {
    title = title.slice(0, fight.index).trim();
    tags.push('fights');
  }

  // Strip any dangling trailing dashes or whitespace
  title = title.replace(/[\s—–-]+$/, '').trim();
  if (!title) title = 'Untitled';

  return { date, title, tags, breakthrough_level };
}

// ── Reflection split ─────────────────────────────────────────────────────────

function splitReflection(md) {
  const lines = md.split('\n');

  // Preferred split: `---` divider followed within 3 lines by an `## ` heading
  for (let i = 0; i < lines.length; i++) {
    if (/^-{3,}\s*$/.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^##\s+/.test(lines[j])) {
          return {
            bodyMd: lines.slice(0, i).join('\n').trim(),
            reflectionMd: lines.slice(i).join('\n').trim(),
          };
        }
      }
    }
  }

  // Fallback: first H2 in the file marks the reflection start
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      return {
        bodyMd: lines.slice(0, i).join('\n').trim(),
        reflectionMd: lines.slice(i).join('\n').trim(),
      };
    }
  }

  return { bodyMd: md, reflectionMd: '' };
}

function parseReflectionBlocks(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      if (current) blocks.push(current);
      current = { title: h2[1].trim(), bodyLines: [] };
      continue;
    }
    if (current) {
      // Ignore stand-alone horizontal rules between sections
      if (/^-{3,}\s*$/.test(line)) continue;
      current.bodyLines.push(line);
    }
  }
  if (current) blocks.push(current);

  return blocks
    .map((b) => ({
      title: b.title.replace(/`/g, '').trim(),
      body: markdownToPlainText(b.bodyLines.join('\n')).trim(),
      quote: null,
      archetype: 'Imported',
    }))
    .filter((b) => b.body.length > 0);
}

// ── Markdown → Tiptap-compatible HTML ────────────────────────────────────────

/**
 * Hand-rolled minimal markdown converter that emits HTML Liminal's Tiptap
 * schema accepts: <p>, <h1-h6>, <ul>/<ol>/<li>, <blockquote>, <strong>, <em>,
 * <code>, <a>, <br>, plus Liminal's custom div wrappers for images + YouTube.
 *
 * Not a general-purpose MD engine — handles what Notion exports commonly use.
 */
function markdownToHtml(md, mediaMap = {}, entryId = null) {
  if (!md) return '';

  // Normalise line endings
  let text = md.replace(/\r\n?/g, '\n');

  // Split into blocks on blank lines
  const blocks = text.split(/\n{2,}/);
  const htmlBlocks = [];

  for (let raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    // Image-only paragraph → Tiptap image embed
    const imgOnly = block.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgOnly) {
      const alt = imgOnly[1] || '';
      const rawSrc = decodeURIComponent(imgOnly[2]);
      const mapped = mediaMap[rawSrc] || rawSrc;
      htmlBlocks.push(
        `<div data-image-embed="" data-src="${escapeAttr(mapped)}" data-alt="${escapeAttr(alt)}" data-width="100%" data-analyzed="false" data-image-hash=""></div>`
      );
      continue;
    }

    // Standalone YouTube URL line → embed
    const ytMatch = block.match(new RegExp(`^${YOUTUBE_RE.source}\\s*$`));
    if (ytMatch) {
      htmlBlocks.push(
        `<div data-youtube-embed="" data-video-id="${escapeAttr(ytMatch[1])}" data-title="" data-width="100%"></div>`
      );
      continue;
    }

    // Heading
    const h = block.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      htmlBlocks.push(`<h${level}>${inlineMd(h[2], mediaMap)}</h${level}>`);
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(block)) {
      const inner = block.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ');
      htmlBlocks.push(`<blockquote><p>${inlineMd(inner, mediaMap)}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(block)) {
      const items = block
        .split('\n')
        .filter((l) => /^[-*+]\s+/.test(l))
        .map((l) => `<li>${inlineMd(l.replace(/^[-*+]\s+/, ''), mediaMap)}</li>`);
      htmlBlocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(block)) {
      const items = block
        .split('\n')
        .filter((l) => /^\d+\.\s+/.test(l))
        .map((l) => `<li>${inlineMd(l.replace(/^\d+\.\s+/, ''), mediaMap)}</li>`);
      htmlBlocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Horizontal rule inside body — render as a soft break (Tiptap doesn't have hr by default)
    if (/^-{3,}$/.test(block)) {
      htmlBlocks.push('<p></p>');
      continue;
    }

    // Plain paragraph — convert single newlines to <br>
    const lines = block.split('\n').map((l) => inlineMd(l, mediaMap));
    htmlBlocks.push(`<p>${lines.join('<br>')}</p>`);
  }

  return htmlBlocks.join('\n');
}

function inlineMd(s, mediaMap) {
  if (!s) return '';
  let out = s;

  // Inline image: ![alt](src) — uncommon mid-paragraph but possible
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const raw = decodeURIComponent(src);
    const mapped = mediaMap[raw] || raw;
    return `<img src="${escapeAttr(mapped)}" alt="${escapeAttr(alt)}">`;
  });

  // Detect YouTube URLs on their own — too tricky inline; downgrade to link.
  // Autolink non-YT URLs:  [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return `<a href="${escapeAttr(url)}">${escapeHtml(label)}</a>`;
  });

  // Inline code `code`
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);

  // Bold **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic *text* or _text_  (after bold to avoid conflict)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

  return out;
}

function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Media extraction ─────────────────────────────────────────────────────────

function findAssetDir(mdPath, filename) {
  // Notion exports put attachments in a sibling folder with the same stripped name
  const dir = path.dirname(mdPath);
  const base = filename; // includes the trailing hex id in the folder name
  const candidate = path.join(dir, base);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  return null;
}

function collectMediaRefs(bodyMd, relativeTo) {
  const refs = new Set();
  const re = /!\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(bodyMd))) {
    const raw = decodeURIComponent(m[1]);
    if (/^https?:\/\//i.test(raw)) continue; // remote images left as-is
    refs.add(raw);
  }
  return Array.from(refs);
}

function copyMediaForEntry(entryId, mediaRefs, sourceDir) {
  const map = {};
  if (!mediaRefs.length) return map;
  const destDir = path.join(MEDIA_ROOT, String(entryId));
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  for (const ref of mediaRefs) {
    const abs = path.resolve(sourceDir, ref);
    if (!fs.existsSync(abs)) continue;
    const ext = path.extname(abs).toLowerCase();
    if (!MEDIA_EXTS.has(ext)) continue;

    // Flatten to a safe filename
    const safeName = path.basename(abs).replace(/[^A-Za-z0-9._-]+/g, '_');
    const dest = path.join(destDir, safeName);
    try {
      fs.copyFileSync(abs, dest);
      map[ref] = `/api/media/${entryId}/${encodeURIComponent(safeName)}`;
    } catch (err) {
      console.warn(`[notion-import] Failed to copy media ${abs}: ${err.message}`);
    }
  }
  return map;
}

// ── CSV tag loading ──────────────────────────────────────────────────────────

function loadCsvTagMap(workDir) {
  try {
    const files = fs.readdirSync(workDir, { withFileTypes: true });
    const csv = files.find((f) => f.isFile() && f.name.toLowerCase().endsWith('.csv'));
    if (!csv) return {};
    const raw = fs.readFileSync(path.join(workDir, csv.name), 'utf-8');
    return parseCsvTagMap(raw);
  } catch {
    return {};
  }
}

function parseCsvTagMap(raw) {
  // Minimal CSV parse: first row is headers; find "Name" and "Tags" columns
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (!lines.length) return {};
  const rows = lines.map(csvRow);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const tagIdx = header.indexOf('tags');
  if (nameIdx === -1 || tagIdx === -1) return {};

  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[nameIdx]) continue;
    const key = normaliseTitleKey(stripDatePrefix(row[nameIdx]));
    const tags = (row[tagIdx] || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tags.length) map[key] = tags;
  }
  return map;
}

function csvRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function stripDatePrefix(s) {
  return s
    .replace(/^\s*\d{1,2}\.\d{1,2}\.\d{4}\s*[-–—]\s*/, '')
    .replace(/^\s*\d{1,2}\s+\d{1,2}\s+\d{4}\s*[-–—]\s*/, '')
    .replace(/^\s*\d{4}-\d{2}-\d{2}\s*[-–—]?\s*/, '');
}

function normaliseTitleKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[🫠🔥—–\-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeTags(primary, extras) {
  const seen = new Set();
  const out = [];
  for (const t of [...primary, ...extras]) {
    const c = String(t || '').trim().toLowerCase();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

// ── DB insertion ─────────────────────────────────────────────────────────────

function saveEntry(parsed) {
  const { title, bodyMd, body_text, date, tags, breakthrough_level, reflectionMd, mediaRefs, sourceDir } = parsed;

  const existing = db
    .prepare('SELECT id FROM entries WHERE title = ? AND date = ?')
    .get(title, date);
  if (existing) return 'skipped';

  // Insert with empty body first, then rewrite with media-resolved HTML so we
  // can use the auto-generated id in the media URL path.
  const result = db
    .prepare(
      `INSERT INTO entries (title, body, body_text, date, tags, breakthrough_level)
       VALUES (?, '', ?, ?, ?, ?)`
    )
    .run(title, body_text, date, JSON.stringify(tags), breakthrough_level);

  const entryId = Number(result.lastInsertRowid);

  const mediaMap = copyMediaForEntry(entryId, mediaRefs, sourceDir);
  const html = markdownToHtml(bodyMd, mediaMap, entryId);

  db.prepare('UPDATE entries SET body = ? WHERE id = ?').run(html, entryId);

  // Reflections
  const blocks = parseReflectionBlocks(reflectionMd);
  if (blocks.length) {
    const data = { opening: null, blocks };
    db.prepare(
      `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, source, updated_at)
       VALUES (?, 1, ?, 'imported', CURRENT_TIMESTAMP)`
    ).run(entryId, JSON.stringify(data));
  }

  return 'imported';
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function stripFrontmatter(content) {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  return content.slice(end + 4).trim();
}

function markdownToPlainText(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  importFromNotion,
  embedAllEntries,
  generateInitialSummary,
  // Exposed for unit-style testing if needed:
  _parseTitle: parseTitle,
  _splitReflection: splitReflection,
  _parseReflectionBlocks: parseReflectionBlocks,
  _markdownToHtml: markdownToHtml,
};
