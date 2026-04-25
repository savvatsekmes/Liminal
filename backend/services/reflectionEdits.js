// Track which reflection blocks have been user-edited, so the UI can surface
// an "edited" badge next to the title. Only AI-generated and imported blocks
// get flagged — Manual blocks are user-authored from the start and have no
// "pristine AI output" state to diverge from.

const CONTENT_FIELDS = ['title', 'body', 'quote'];

function isManualBlock(block) {
  return block && block.archetype === 'Manual';
}

// Local LLMs occasionally emit the string "null"/"undefined"/"none" as the
// quote value instead of a real JSON null. Coerce to a real null so the
// frontend can rely on a simple truthiness check.
function sanitiseQuote(block) {
  if (!block || !('quote' in block)) return block;
  const q = block.quote;
  if (q == null) return block;
  const s = String(q).trim();
  const lower = s.toLowerCase();
  if (s === '' || lower === 'null' || lower === 'undefined' || lower === 'none') {
    return { ...block, quote: null };
  }
  if (s !== q) return { ...block, quote: s };
  return block;
}

// Used by PATCH handlers: merge a partial patch into an existing block and
// stamp `edited: true` if the patch changed any content field. Respects an
// explicit `edited` value in the patch so regenerate-save flows can reset it.
function applyPatchWithEditTracking(existing, patch) {
  let merged = { ...existing, ...patch };
  merged = sanitiseQuote(merged);
  if ('edited' in patch) return merged; // frontend explicitly set the flag
  if (isManualBlock(merged)) return merged;
  if (merged.edited) return merged; // already flagged — stays sticky
  const contentChanged = CONTENT_FIELDS.some(f => f in patch && patch[f] !== existing[f]);
  if (contentChanged) merged.edited = true;
  return merged;
}

// Used by PUT handlers (full replace of the blocks array). Compare each
// incoming block to the block at the same index in the previous save; if any
// content field changed, flag the new block as edited. Out-of-range indices
// (brand-new blocks) are left alone.
function applyPutWithEditTracking(oldBlocks, newBlocks) {
  return newBlocks.map((newBlock, i) => {
    const block = sanitiseQuote(newBlock);
    const old = oldBlocks[i];
    if (!old) return block;
    if ('edited' in block) return block;
    if (isManualBlock(block)) return block;
    if (block.edited) return block;
    const contentChanged = CONTENT_FIELDS.some(f => block[f] !== old[f]);
    return contentChanged ? { ...block, edited: true } : block;
  });
}

module.exports = { applyPatchWithEditTracking, applyPutWithEditTracking, sanitiseQuote };
