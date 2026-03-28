/**
 * Notion import service.
 * Accepts a ZIP path or unzipped folder path from a Notion Markdown export.
 * Parses filenames for date and title, strips frontmatter, inserts into SQLite.
 * Then kicks off background embedding + initial rolling summary generation.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const os = require('os');
const db = require('../database');
const { indexEntry } = require('./embeddingService');
const llm = require('./llmService');

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Import entries from a Notion export ZIP or unzipped folder.
 * @param {string} sourcePath  Absolute path to ZIP or directory
 * @param {function} onProgress  Callback: (done, total, message) => void
 * @returns {Promise<{imported: number, skipped: number, errors: number}>}
 */
async function importFromNotion(sourcePath, onProgress = () => {}) {
  let workDir = sourcePath;
  let tempDir = null;

  // Extract ZIP if needed
  if (sourcePath.toLowerCase().endsWith('.zip')) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'liminal-notion-'));
    onProgress(0, 0, 'Extracting ZIP...');
    const zip = new AdmZip(sourcePath);
    zip.extractAllTo(tempDir, true);
    workDir = tempDir;
  }

  // Collect all .md files
  const mdFiles = walkMarkdown(workDir);
  const total = mdFiles.length;
  onProgress(0, total, `Found ${total} entries`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < mdFiles.length; i++) {
    const filePath = mdFiles[i];
    try {
      const result = processMarkdownFile(filePath);
      if (result) {
        const { title, body, body_text, date } = result;

        // Duplicate check: same title + date
        const existing = db
          .prepare('SELECT id FROM entries WHERE title = ? AND date = ?')
          .get(title, date);

        if (existing) {
          skipped++;
        } else {
          db.prepare(
            `INSERT INTO entries (title, body, body_text, date, tags)
             VALUES (?, ?, ?, ?, '[]')`
          ).run(title, body, body_text, date);
          imported++;
        }
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`[notion-import] Error processing ${filePath}:`, err.message);
      errors++;
    }

    if ((i + 1) % 20 === 0 || i === mdFiles.length - 1) {
      onProgress(i + 1, total, `Importing... ${i + 1}/${total}`);
    }
  }

  // Clean up temp dir
  if (tempDir) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }

  onProgress(total, total, `Import complete: ${imported} imported, ${skipped} skipped`);

  return { imported, skipped, errors };
}

/**
 * Run background embedding for all un-embedded entries.
 * Call this after importFromNotion completes.
 * @param {function} onProgress  (done, total) => void
 */
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

/**
 * Generate initial rolling summary from the 20 most recent entries.
 * Called once after all entries are embedded.
 */
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

// ── File Processing ──────────────────────────────────────────────────────────

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

function processMarkdownFile(filePath) {
  const filename = path.basename(filePath, '.md');
  const raw = fs.readFileSync(filePath, 'utf-8');

  // Strip Notion frontmatter
  const body = stripFrontmatter(raw).trim();
  if (!body) return null;

  // Parse date and title from filename
  const { date, title } = parseFilename(filename, filePath);

  // Plain text for embedding/search
  const body_text = markdownToPlainText(body);

  return { title, body, body_text, date };
}

/**
 * Strip YAML frontmatter (--- ... ---) from Notion exports
 */
function stripFrontmatter(content) {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  return content.slice(end + 4).trim();
}

/**
 * Parse Notion export filename formats:
 *   "22 03 2026 - Title here abc123"
 *   "2026-03-22 Title here"
 *   "Title here abc123" (no date — fallback to file modified date)
 */
function parseFilename(filename, filePath) {
  // Remove Notion's trailing hex ID (last 32-char hex segment)
  const cleanName = filename.replace(/\s+[a-f0-9]{32}$/i, '').trim();

  // Format 1: "DD MM YYYY - Title"
  let m = cleanName.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})\s*[-–]\s*(.+)$/);
  if (m) {
    const [, d, mo, y, t] = m;
    return {
      date: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`,
      title: t.trim(),
    };
  }

  // Format 2: "YYYY-MM-DD Title" or "YYYY-MM-DD - Title"
  m = cleanName.match(/^(\d{4})-(\d{2})-(\d{2})\s*[-–]?\s*(.+)$/);
  if (m) {
    const [, y, mo, d, t] = m;
    return { date: `${y}-${mo}-${d}`, title: t.trim() };
  }

  // Format 3: no recognisable date — use file mtime
  let date;
  try {
    const stat = fs.statSync(filePath);
    date = stat.mtime.toISOString().split('T')[0];
  } catch {
    date = new Date().toISOString().split('T')[0];
  }

  return { date, title: cleanName };
}

/**
 * Minimal markdown → plain text (for embedding / search).
 * Strips headings, bold, italic, links, code blocks, images.
 */
function markdownToPlainText(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')         // code blocks
    .replace(/`[^`]+`/g, '')                 // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')         // images
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')   // links → text
    .replace(/^#{1,6}\s+/gm, '')             // headings
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // bold/italic
    .replace(/^\s*[-*+]\s+/gm, '')           // list bullets
    .replace(/^\s*\d+\.\s+/gm, '')           // numbered lists
    .replace(/\n{3,}/g, '\n\n')              // collapse excess newlines
    .trim();
}

module.exports = {
  importFromNotion,
  embedAllEntries,
  generateInitialSummary,
};
