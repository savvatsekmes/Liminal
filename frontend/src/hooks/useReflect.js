import { useState } from 'react';
import { apiFetch } from '../utils/api';
import { useTtsOnline } from '../utils/ttsStatus';

export function useReflect() {
  const [blocks, setBlocks] = useState([]);
  const [opening, setOpening] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ttsOnline = useTtsOnline();

  async function reflect(entry, archetype) {
    if (!entry || !entry.body_text) return;
    setLoading(true);
    setError(null);

    try {
      // Strip inline base64 image data from HTML before sending — backend reads from DB instead
      const strippedBody = (entry.body || '').replace(/data-src="data:image\/[^"]*"/g, 'data-src=""');
      const res = await apiFetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entry.id,
          entryText: entry.body_text || '',
          entryBody: strippedBody,
          archetype: archetype && archetype !== 'Auto' ? archetype : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Reflection failed.');
      }

      const data = await res.json();
      setOpening(data.opening || null);
      setBlocks(data.blocks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateBlock(block, archetype, index, entryText) {
    if (!archetype) return;

    try {
      const res = await apiFetch('/api/reflect/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryText: entryText || block.entryText || '',
          archetype,
          blockTitle: block.title || '',
        }),
      });

      if (!res.ok) throw new Error('Regeneration failed.');

      const newBlock = await res.json();
      setBlocks((prev) => prev.map((b, i) => (i === index ? newBlock : b)));
    } catch (err) {
      console.error('[useReflect] Regen failed:', err.message);
    }
  }

  async function loadReflections(entryId) {
    setBlocks([]);
    setOpening(null);
    setError(null);
    if (!entryId) return;
    try {
      const res = await apiFetch(`/api/reflect/${entryId}`);
      if (res.ok) {
        const data = await res.json();
        setOpening(data.opening || null);
        setBlocks(data.blocks || []);
      }
    } catch {}
  }

  function clearBlocks() {
    setBlocks([]);
    setOpening(null);
    setError(null);
  }

  // Persist the current blocks array to the backend. Used after manual edits,
  // additions, and deletions. Pass the latest array explicitly so we don't race
  // React's state batching.
  async function saveBlocks(entryId, nextBlocks, nextOpening) {
    if (!entryId) return;
    try {
      await apiFetch(`/api/reflect/${entryId}/blocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opening: nextOpening !== undefined ? nextOpening : opening,
          blocks: nextBlocks,
        }),
      });
    } catch (err) {
      console.error('[useReflect] saveBlocks failed:', err.message);
    }
  }

  function updateBlock(entryId, index, patch) {
    setBlocks((prev) => {
      const next = prev.map((b, i) => (i === index ? { ...b, ...patch } : b));
      saveBlocks(entryId, next);
      return next;
    });
  }

  // Patch a single field on a block. Sends a PATCH so the server merges the
  // change into the stored row, and we don't depend on local React state being
  // up-to-date — important when the user edits and immediately switches entries
  // (which would otherwise clobber `blocks` to [] before the save fires).
  async function patchBlock(entryId, index, patch) {
    if (!entryId || index == null) return;
    // Optimistic local update so UI updates instantly when not switching entries
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    try {
      await apiFetch(`/api/reflect/${entryId}/blocks/${index}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch }),
      });
    } catch (err) {
      console.error('[useReflect] patchBlock failed:', err.message);
    }
  }

  function deleteBlock(entryId, index) {
    setBlocks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      saveBlocks(entryId, next);
      return next;
    });
  }

  function addBlock(entryId) {
    setBlocks((prev) => {
      const next = [...prev, { title: '', body: '', quote: null, archetype: 'Manual' }];
      saveBlocks(entryId, next);
      return next;
    });
  }

  return {
    blocks, opening, loading, error, ttsOnline,
    reflect, regenerateBlock, clearBlocks, loadReflections,
    updateBlock, patchBlock, deleteBlock, addBlock,
  };
}
