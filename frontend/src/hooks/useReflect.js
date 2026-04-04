import { useState } from 'react';
import { apiFetch } from '../utils/api';
import { useTtsOnline } from '../utils/ttsStatus';

export function useReflect() {
  const [blocks, setBlocks] = useState([]);
  const [opening, setOpening] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ttsOnline = useTtsOnline();

  async function reflect(entry) {
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

  return { blocks, opening, loading, error, ttsOnline, reflect, regenerateBlock, clearBlocks, loadReflections };
}
