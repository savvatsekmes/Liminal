/**
 * One-off recovery: rewrite 5 corrupted entries from cached Notion blocks.
 *
 * The tag-lock bug overwrote these entries' bodies with the content of
 * "Chasing the Robber & Presense." (body length 3041). This script pulls
 * the original blocks from .tmp-import/blocks-*.json (fetched during the
 * Notion import) and writes the original HTML + reflections back.
 *
 * The 6th corrupted entry (id 2 "2026-04-07 — Tarot pull") has no Notion
 * match and is left alone — caller must handle it separately.
 *
 * Usage: node backend/scripts/recoverCorrupted.js
 */

const path = require('path');
const fs = require('fs');

if (!process.env.LIMINAL_USER_DATA) {
  process.env.LIMINAL_USER_DATA = path.join(process.env.APPDATA || '', 'Liminal');
}
const db = require(path.join(__dirname, '..', 'database'));

const {
  blocksToHtml,
  blocksToPlainText,
  splitReflections,
} = require('./_notionBlocks');

const TMP = path.join(__dirname, '..', '..', '.tmp-import');

// entry_id in DB → notion page id (hyphenated form matches the cached file)
const MAPPING = [
  { id: 361, pageId: '33b28a4d-7102-809d-8fd6-e015096387a9', label: '09.04.2026 Learn from other mirrors' },
  { id: 363, pageId: '33e28a4d-7102-80b9-a961-f2c5c2c9264b', label: '10.04.2026 The Lists of Life.' },
  { id: 949, pageId: '2be28a4d-7102-80a0-a805-ce7f4fe9bfe6', label: '04.12.2025 Repressed emotions.' },
  { id: 370, pageId: '34428a4d-7102-807f-bd8b-ed4f2d1df70b', label: '15.04.2026 Love, Fatigue, and Fairness' },
  { id: 356, pageId: '31a28a4d-7102-80fd-8491-efedaab968f9', label: "05.03.2026 If you think you got it, you don't haha" },
];

const updateEntry = db.prepare(
  `UPDATE entries SET body = ?, body_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
);
const upsertReflection = db.prepare(
  `INSERT INTO reflections (entry_id, user_id, blocks, source, updated_at)
   VALUES (?, 1, ?, 'imported', CURRENT_TIMESTAMP)
   ON CONFLICT(entry_id, user_id) DO UPDATE SET
     blocks = excluded.blocks,
     source = excluded.source,
     updated_at = CURRENT_TIMESTAMP`
);
const insertVersion = db.prepare(
  `INSERT INTO entry_versions (entry_id, user_id, title, body, body_text, saved_at)
   VALUES (?, 1, ?, ?, ?, CURRENT_TIMESTAMP)`
);

for (const m of MAPPING) {
  const blockFile = path.join(TMP, `blocks-${m.pageId.replace(/-/g, '')}.json`);
  if (!fs.existsSync(blockFile)) {
    console.log(`[${m.id}] ${m.label} — NO CACHED BLOCKS at ${blockFile}`);
    continue;
  }
  // Some cached files store the flat array; others store the raw Notion
  // API response {results: [...]}. Handle both.
  const raw = JSON.parse(fs.readFileSync(blockFile, 'utf8'));
  const blocks = Array.isArray(raw) ? raw : (raw.results || []);
  if (!blocks.length) {
    console.log(`[${m.id}] ${m.label} — empty blocks`);
    continue;
  }

  const { bodyBlocks, reflectionBlocks } = splitReflections(blocks);
  const bodyHtml = blocksToHtml(bodyBlocks);
  const bodyText = blocksToPlainText(bodyBlocks);

  if (!bodyText.trim() && !bodyHtml.trim()) {
    console.log(`[${m.id}] ${m.label} — no body content from blocks`);
    continue;
  }

  const entry = db.prepare('SELECT id, title, body, body_text FROM entries WHERE id = ?').get(m.id);
  if (!entry) {
    console.log(`[${m.id}] ${m.label} — entry missing in DB`);
    continue;
  }

  // Save a version snapshot of the CURRENT (corrupted) body first, so
  // recovery itself is reversible.
  insertVersion.run(entry.id, entry.title, entry.body, entry.body_text);

  updateEntry.run(bodyHtml, bodyText, m.id);

  if (reflectionBlocks.length) {
    const data = { opening: null, blocks: reflectionBlocks };
    upsertReflection.run(m.id, JSON.stringify(data));
  }

  console.log(`[${m.id}] ${m.label} — restored (body ${bodyHtml.length} chars, ${reflectionBlocks.length} reflections)`);
}

console.log('\nDone.');
