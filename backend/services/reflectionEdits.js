// Track which reflection blocks have been user-edited, so the UI can surface
// an "edited" badge next to the title. Only AI-generated and imported blocks
// get flagged — Manual blocks are user-authored from the start and have no
// "pristine AI output" state to diverge from.

const CONTENT_FIELDS = ['title', 'body', 'quote'];

function isManualBlock(block) {
  return block && block.archetype === 'Manual';
}

// Used by PATCH handlers: merge a partial patch into an existing block and
// stamp `edited: true` if the patch changed any content field. Respects an
// explicit `edited` value in the patch so regenerate-save flows can reset it.
function applyPatchWithEditTracking(existing, patch) {
  const merged = { ...existing, ...patch };
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
    const old = oldBlocks[i];
    if (!old) return newBlock;
    if ('edited' in newBlock) return newBlock;
    if (isManualBlock(newBlock)) return newBlock;
    if (newBlock.edited) return newBlock;
    const contentChanged = CONTENT_FIELDS.some(f => newBlock[f] !== old[f]);
    return contentChanged ? { ...newBlock, edited: true } : newBlock;
  });
}

module.exports = { applyPatchWithEditTracking, applyPutWithEditTracking };
