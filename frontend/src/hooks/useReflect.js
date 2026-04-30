import { useState } from 'react';
import { apiFetch } from '../utils/api';
import { useTtsOnline } from '../utils/ttsStatus';
import { useCrisisGate } from '../components/CrisisGate';

export function useReflect() {
  const [blocks, setBlocks] = useState([]);
  const [opening, setOpening] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const ttsOnline = useTtsOnline();
  // Reflect is a single-shot operation on the user's own writing. The output
  // banner was firing on the model's dramatic interpretation of journal
  // entries (framing the user as "feeling suicidal" when they weren't), not
  // on genuine novel crisis content. The banner now lives only on Oracle —
  // the only true open-ended chat surface.
  const { confirmIfCrisis } = useCrisisGate();

  async function reflect(entry, archetype) {
    if (!entry || !entry.body_text) return;
    if (!await confirmIfCrisis(entry.body_text)) return;
    setLoading(true);
    setError(null);
    // Reset blocks/opening so prior reflection visibly clears as the new one
    // streams in. The MirrorPanel renders empty state during the gap.
    setOpening(null);
    setBlocks([]);

    try {
      // Strip inline base64 image data from HTML before sending — backend reads from DB instead
      const strippedBody = (entry.body || '').replace(/data-src="data:image\/[^"]*"/g, 'data-src=""');
      // Pass UI language so the backend's quote bank picks from the matching
      // language pool. LanguageContext mirrors `lang` to localStorage on every
      // change; default 'en'.
      let lang;
      try { lang = localStorage.getItem('lang') || undefined; } catch {}
      const res = await apiFetch('/api/reflect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entry.id,
          entryText: entry.body_text || '',
          entryBody: strippedBody,
          archetype: archetype && archetype !== 'Auto' ? archetype : undefined,
          ...(lang ? { language: lang } : {}),
        }),
      });

      if (!res.ok) {
        // Backend may respond with a JSON error if the failure happened
        // before SSE init (e.g. crisis gate, missing entry text). After SSE
        // starts, errors arrive as `event: error` over the stream itself.
        let msg = 'Reflection failed.';
        try {
          const err = await res.json();
          msg = err.error || msg;
        } catch {}
        throw new Error(msg);
      }

      // Stream parser: walk the response body as text/event-stream chunks,
      // dispatching each `event: <name>` block into state. Backend emits:
      //   opening  → setOpening
      //   block    → append to blocks (each block is fully post-processed)
      //   update   → patch one existing block (echo callout post-stream)
      //   done     → end of stream
      //   error    → error event
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamErr = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE events are separated by a blank line (\n\n).
        let sepIdx;
        while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
          const eventChunk = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          // Each chunk is a sequence of "event: foo" / "data: ..." lines.
          let eventName = 'message';
          let dataLines = [];
          for (const line of eventChunk.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
          }
          if (!dataLines.length) continue;
          let payload;
          try { payload = JSON.parse(dataLines.join('\n')); } catch { continue; }
          if (eventName === 'opening') {
            setOpening(payload.opening || null);
          } else if (eventName === 'block') {
            // Strip backend-internal `_index` field before storing.
            const { _index, ...rest } = payload;
            setBlocks((prev) => [...prev, rest]);
          } else if (eventName === 'update') {
            const { _index, ...rest } = payload;
            setBlocks((prev) => {
              const next = [...prev];
              if (typeof _index === 'number' && _index >= 0 && _index < next.length) {
                next[_index] = rest;
              }
              return next;
            });
          } else if (eventName === 'error') {
            streamErr = payload.error || 'Stream error';
          } else if (eventName === 'done') {
            // No-op: final marker. Keep reading until reader.read() reports done.
          }
        }
      }
      if (streamErr) throw new Error(streamErr);
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
