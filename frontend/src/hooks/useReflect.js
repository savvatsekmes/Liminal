import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';

export function useReflect() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ttsOnline, setTtsOnline] = useState(false);

  // Check Chatterbox status on mount
  useEffect(() => {
    fetch('/api/tts/status')
      .then((r) => r.json())
      .then((d) => setTtsOnline(d.online))
      .catch(() => setTtsOnline(false));
  }, []);

  async function reflect(entry) {
    if (!entry || !entry.body_text) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entry.id,
          entryText: entry.body_text || '',
          entryBody: entry.body || '',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Reflection failed.');
      }

      const data = await res.json();
      setBlocks(data.blocks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateBlock(block, archetype, index) {
    if (!archetype) return;

    try {
      const res = await apiFetch('/api/reflect/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryText: block.entryText || '', archetype }),
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
    setError(null);
    if (!entryId) return;
    try {
      const res = await apiFetch(`/api/reflect/${entryId}`);
      if (res.ok) {
        const data = await res.json();
        setBlocks(data.blocks || []);
      }
    } catch {}
  }

  function clearBlocks() {
    setBlocks([]);
    setError(null);
  }

  return { blocks, loading, error, ttsOnline, reflect, regenerateBlock, clearBlocks, loadReflections };
}
