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
const INSTAGRAM_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+[^\s]*/;

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
  const { content, meta } = extractFrontmatter(raw);
  const stripped = stripLeadingTitle(content.trim()).trim();
  if (!stripped) return null;

  const { date, title, tags, breakthrough_level } = parseTitle(filename, filePath);

  const { bodyMd, reflectionBlocks } = splitReflection(stripped);

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
    reflectionBlocks,
    mediaRefs,
    pageAssetDir,
    sourceDir: path.dirname(filePath),
    createdAt: meta.notion_created_time || null,
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

  // Format 1: "DD.MM.YYYY - Title" (the user's manual format; dash optional)
  let m = name.match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–—]?\s+(.+)$/);
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
      } else {
        // Format 4: "D-M-YY - Title" or "DD-MM-YYYY - Title" (old user format with dashes)
        m = name.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})\s*[-–—]\s*(.+)$/);
        if (m) {
          const [, d, mo, yRaw, t] = m;
          const y = yRaw.length === 2 ? '20' + yRaw : yRaw;
          date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
          title = t;
        }
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

// Two Leela formats are supported:
//   1. H2-terminated: user's writing, then `## \`Section\`` H2 blocks at the end
//      with code-wrapped paragraphs under each heading.
//   2. Interleaved: ChatGPT responses appear as consecutive paragraphs wrapped
//      fully in backticks, sprinkled throughout the user's raw writing. No H2s.
//
// Algorithm: walk paragraphs (blocks separated by blank lines), classify each
// as H2-header / code-paragraph / body. Open a reflection "run" at any H2 or
// at the start of a contiguous stretch of code-paragraphs. Body paragraphs
// close the current run. Each closed run is one reflection block.
function splitReflection(md) {
  const paragraphs = splitParagraphs(md);

  const bodyParts = [];
  const blocks = [];
  let current = null; // { title, bodyLines }
  let autoCount = 0;

  const flush = () => {
    if (!current) return;
    const body = markdownToPlainText(current.bodyLines.join('\n\n')).trim();
    if (body) {
      blocks.push({
        title: current.title,
        body,
        quote: null,
        archetype: 'Imported',
      });
    }
    current = null;
  };

  for (const para of paragraphs) {
    // Toggle blocks are always body content — never treat as heading or code paragraph
    if (para.startsWith(':::toggle ')) {
      flush();
      bodyParts.push(para);
      continue;
    }

    const heading = para.match(/^#{2,3}\s+(.+?)\s*$/);
    if (heading) {
      flush();
      const rawTitle = heading[1].trim()
        .replace(/`/g, '')           // strip code wrapping
        .replace(/^\*+|\*+$/g, '')   // strip bold/italic markers
        .replace(/^[\p{Emoji}\p{Emoji_Presentation}\u200d\uFE0F]+\s*/u, '') // strip leading emoji
        .trim();
      current = {
        title: rawTitle || `Reflection ${++autoCount}`,
        bodyLines: [],
      };
      continue;
    }

    if (isCodeParagraph(para)) {
      if (!current) {
        // Extract a title from the first code run's text (strip backticks, bold, etc.)
        const firstText = para.replace(/`/g, '').replace(/\*+/g, '').replace(/^[-*+]\s+/, '').trim();
        const autoTitle = firstText.split(/[.!?\n]/)[0].trim().slice(0, 80) || `Reflection ${++autoCount}`;
        current = { title: autoTitle, bodyLines: [] };
      }
      current.bodyLines.push(para);
      continue;
    }

    // Horizontal rule inside reflection run — keep the run open, skip the rule
    if (/^-{3,}\s*$/.test(para) && current) continue;

    // Body paragraph — close any open reflection run
    flush();
    bodyParts.push(para);
  }
  flush();

  return {
    bodyMd: bodyParts.join('\n\n').trim(),
    reflectionBlocks: blocks,
  };
}

// Split markdown into paragraph-sized blocks on blank lines.
// Toggle fences (:::toggle...:::endtoggle) are collapsed into single blocks
// using \x00 as an internal paragraph separator so blank lines inside them
// don't split the fence apart.
function splitParagraphs(md) {
  let text = String(md || '').replace(/\r\n?/g, '\n');
  // Protect toggle fences from being split on blank lines
  text = text.replace(/:::toggle ([^\n]*)\n([\s\S]*?):::endtoggle/g, (_, title, body) => {
    return `:::toggle ${title}\x00${body.trim().replace(/\n\n+/g, '\x00')}\x00:::endtoggle`;
  });
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// A "code paragraph" is one where the backtick-wrapped runs cover ≥60% of
// non-whitespace characters. Handles partial bold/italic markers around the
// code runs (e.g. `**\`text\`**`) and paragraphs with multiple code runs.
function isCodeParagraph(para) {
  if (!para.includes('`')) return false;
  // Strip horizontal-rule-only lines from consideration
  if (/^-{3,}\s*$/.test(para)) return false;

  const nonWs = para.replace(/\s+/g, '').length;
  if (nonWs === 0) return false;

  let codeChars = 0;
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(para))) {
    // Include the wrapping backticks — for very short runs like `or` the
    // backticks themselves dominate the character count and the content
    // would otherwise fall below the 60% threshold (2/4 = 0.5 → body).
    codeChars += m[0].replace(/\s+/g, '').length;
  }
  return codeChars / nonWs >= 0.6;
}

// ── Markdown → Tiptap-compatible HTML ────────────────────────────────────────

/**
 * Hand-rolled minimal markdown converter that emits HTML Liminal's Tiptap
 * schema accepts: <p>, <h1-h6>, <ul>/<ol>/<li>, <blockquote>, <strong>, <em>,
 * <code>, <a>, <br>, plus Liminal's custom div wrappers for images + YouTube.
 *
 * Not a general-purpose MD engine — handles what Notion exports commonly use.
 */
/**
 * Parse a markdown list block (ul or ol) with nested sub-items into HTML.
 * Indented lines (2+ spaces before the marker) become nested lists.
 */
function parseNestedList(block, defaultTag, mediaMap) {
  const lines = block.split('\n').filter((l) => l.trim());
  const isUl = (l) => /^\s*[-*+]\s+/.test(l);
  const isOl = (l) => /^\s*\d+\.\s+/.test(l);
  const getIndent = (l) => l.match(/^(\s*)/)[1].length;
  const stripMarker = (l) => l.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '');

  function buildList(idx, baseIndent) {
    const items = [];
    while (idx < lines.length) {
      const line = lines[idx];
      const indent = getIndent(line);
      if (indent < baseIndent) break;
      if (indent === baseIndent && (isUl(line) || isOl(line))) {
        const text = inlineMd(stripMarker(line), mediaMap);
        idx++;
        // Check for children at deeper indent
        if (idx < lines.length && getIndent(lines[idx]) > baseIndent) {
          const childResult = buildList(idx, getIndent(lines[idx]));
          const childTag = isOl(lines[idx]) ? 'ol' : (isUl(lines[idx]) ? 'ul' : defaultTag);
          items.push(`<li>${text}<${childTag}>${childResult.html}</${childTag}></li>`);
          idx = childResult.idx;
        } else {
          items.push(`<li>${text}</li>`);
        }
      } else {
        // Indented content that's not a list marker — skip or treat as text
        idx++;
      }
    }
    return { html: items.join(''), idx };
  }

  const result = buildList(0, getIndent(lines[0] || ''));
  return `<${defaultTag}>${result.html}</${defaultTag}>`;
}

function markdownToHtml(md, mediaMap = {}, entryId = null) {
  if (!md) return '';

  // Normalise line endings
  let text = md.replace(/\r\n?/g, '\n');

  // Collapse :::toggle...:::endtoggle fences — use \x00 as internal separator
  // so blank-line splitting doesn't break them apart
  text = text.replace(/:::toggle ([^\n]*)\n([\s\S]*?):::endtoggle/g, (_, title, body) => {
    return `:::toggle ${title}\x00${body.trim().replace(/\n\n+/g, '\x00')}`;
  });

  // Split into blocks on blank lines
  const rawBlocks = text.split(/\n{2,}/);
  // Re-merge toggle blocks: :::toggle line + all following blocks until we have all content
  const blocks = [];
  for (let i = 0; i < rawBlocks.length; i++) {
    blocks.push(rawBlocks[i]);
  }
  const htmlBlocks = [];

  for (let raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    // Toggle block (:::toggle Title\x00content...\x00:::endtoggle)
    if (block.startsWith(':::toggle ')) {
      const parts = block.split('\x00').filter(p => p.trim() !== ':::endtoggle');
      const summary = escapeHtml(parts[0].replace(/^:::toggle\s+/, ''));
      const innerMd = parts.slice(1).join('\n\n');
      const innerHtml = innerMd ? markdownToHtml(innerMd, mediaMap, entryId) : '<p></p>';
      htmlBlocks.push(
        `<details data-toggle="" data-summary="${escapeAttr(summary)}" open><div data-details-content>${innerHtml}</div></details>`
      );
      continue;
    }

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

    // Standalone Instagram URL line → embed
    const igMatch = block.match(new RegExp(`^${INSTAGRAM_RE.source}\\s*$`));
    if (igMatch) {
      const igUrl = igMatch[0].trim().split('?')[0].replace(/\/$/, '');
      htmlBlocks.push(
        `<div data-instagram-embed="" data-url="${escapeAttr(igUrl)}" data-width="100%"></div>`
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

    // Unordered list (with nested sub-items)
    if (/^[-*+]\s+/.test(block)) {
      htmlBlocks.push(parseNestedList(block, 'ul', mediaMap));
      continue;
    }

    // Ordered list (with nested sub-items)
    if (/^\d+\.\s+/.test(block)) {
      htmlBlocks.push(parseNestedList(block, 'ol', mediaMap));
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
  const { title, bodyMd, body_text, date, tags, breakthrough_level, reflectionBlocks, mediaRefs, sourceDir, createdAt } = parsed;

  const existing = db
    .prepare('SELECT id FROM entries WHERE title = ? AND date = ?')
    .get(title, date);
  if (existing) return 'skipped';

  // Insert with empty body first, then rewrite with media-resolved HTML so we
  // can use the auto-generated id in the media URL path.
  const result = createdAt
    ? db
        .prepare(
          `INSERT INTO entries (title, body, body_text, date, tags, breakthrough_level, created_at)
           VALUES (?, '', ?, ?, ?, ?, ?)`
        )
        .run(title, body_text, date, JSON.stringify(tags), breakthrough_level, createdAt)
    : db
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
  if (reflectionBlocks && reflectionBlocks.length) {
    const data = { opening: null, blocks: reflectionBlocks };
    db.prepare(
      `INSERT OR REPLACE INTO reflections (entry_id, user_id, blocks, source, updated_at)
       VALUES (?, 1, ?, 'imported', CURRENT_TIMESTAMP)`
    ).run(entryId, JSON.stringify(data));
  }

  return 'imported';
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

function extractFrontmatter(content) {
  if (!content.startsWith('---')) return { content, meta: {} };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { content, meta: {} };
  const yaml = content.slice(3, end).trim();
  const rest = content.slice(end + 4).trim();
  const meta = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { content: rest, meta };
}

// Notion's markdown export prepends the page title as an H1 on the first
// non-empty line. Liminal already stores the title separately, so we strip
// that redundant heading to avoid showing the title twice in the body.
function stripLeadingTitle(content) {
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && /^#\s+/.test(lines[i])) {
    lines.splice(i, 1);
    // Also drop any blank lines immediately following the removed title
    while (i < lines.length && lines[i].trim() === '') lines.splice(i, 1);
  }
  return lines.join('\n');
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
  _isCodeParagraph: isCodeParagraph,
  _extractFrontmatter: extractFrontmatter,
  _markdownToHtml: markdownToHtml,
};
