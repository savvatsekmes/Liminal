import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { lockbug } from '../utils/lockbugLog';

const API = '/api';

function today() {
  return new Date().toISOString().split('T')[0];
}

export function useEntries() {
  const [entries, setEntries] = useState([]);
  const [activeEntry, setActiveEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  // Monotonic counter for selectEntry's GET fetches. When the user flicks
  // between entries, multiple GETs can be in flight; out-of-order arrival
  // would otherwise let a stale response win and flip activeEntry backward
  // after the user already moved on — the actual root of the lock/flick
  // cross-entry corruption bug. Only the most recently issued selectEntry
  // is allowed to call setActiveEntry.
  const selectSeqRef = useRef(0);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/entries`);
      const data = await res.json();
      setEntries(data);
      return data;
    } catch (err) {
      console.error('[useEntries] Fetch failed:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries().then((data) => {
      if (data.length > 0 && !activeEntry) {
        selectEntry(data[0]);
      }
    });
  }, []);

  // Refetch when something outside this hook (e.g. SelectionMenu's
  // "Save to journal" action) creates an entry, so the new row shows up
  // in the list immediately.
  useEffect(() => {
    function onChanged() { fetchEntries(); }
    window.addEventListener('liminal:entries-changed', onChanged);
    return () => window.removeEventListener('liminal:entries-changed', onChanged);
  }, [fetchEntries]);

  const createEntry = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Entry Title',
          body: '',
          body_text: '',
          date: today(),
        }),
      });
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      setActiveEntry(entry);
      window.dispatchEvent(new CustomEvent('liminal:entry-created', { detail: entry }));
      return entry;
    } catch (err) {
      console.error('[useEntries] Create failed:', err);
    }
  }, []);

  const updateEntry = useCallback(async (id, fields) => {
    try {
      {
        const f = fields || {};
        lockbug('PUT', {
          id,
          fields: Object.keys(f),
          bodyLen: typeof f.body === 'string' ? f.body.length : null,
          bodyPrefix: typeof f.body === 'string' ? f.body.slice(0, 60) : null,
        });
      }
      const res = await apiFetch(`${API}/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const updated = await res.json();
      // Merge only the fields the caller actually sent, plus server-maintained
      // metadata. The backend PUT echoes the full row; if a lock-PUT races an
      // in-flight body-PUT, the lock response's stale `body` column would
      // otherwise clobber the fresh body in React state — the actual root of
      // the lock/cross-entry corruption bug.
      const patch = {};
      for (const k of Object.keys(fields || {})) {
        if (k in updated) patch[k] = updated[k];
      }
      if ('updated_at' in updated) patch.updated_at = updated.updated_at;
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      setActiveEntry((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
      return updated;
    } catch (err) {
      console.error('[useEntries] Update failed:', err);
    }
  }, []);

  const deleteEntry = useCallback(async (id) => {
    try {
      await apiFetch(`${API}/entries/${id}`, { method: 'DELETE' });
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== id);
        if (activeEntry?.id === id) {
          if (next[0]) {
            // Fetch full entry (with body) to avoid loading an entry with undefined body
            apiFetch(`${API}/entries/${next[0].id}`)
              .then((r) => r.json())
              .then((full) => setActiveEntry(full))
              .catch(() => setActiveEntry(next[0]));
          } else {
            setActiveEntry(null);
          }
        }
        return next;
      });
    } catch (err) {
      console.error('[useEntries] Delete failed:', err);
    }
  }, [activeEntry]);

  const selectEntry = useCallback(async (entry) => {
    const seq = ++selectSeqRef.current;
    lockbug('selectEntry:GET', { id: entry?.id, seq });
    try {
      const res = await apiFetch(`${API}/entries/${entry.id}`);
      const full = await res.json();
      if (seq !== selectSeqRef.current) {
        lockbug('selectEntry:GET-dropped', { id: entry?.id, seq, latest: selectSeqRef.current });
        return;
      }
      lockbug('selectEntry:setActive', {
        id: full?.id,
        seq,
        bodyLen: typeof full?.body === 'string' ? full.body.length : null,
        bodyPrefix: typeof full?.body === 'string' ? full.body.slice(0, 60) : null,
      });
      setActiveEntry(full);
    } catch {
      if (seq !== selectSeqRef.current) return;
      // Fallback to the list object only if this is still the latest request.
      // Don't use it when it's missing body (e.g. nav shortcuts pass {id} only)
      // since that would blow away the editor with empty content.
      if (entry && typeof entry.body === 'string') setActiveEntry(entry);
    }
  }, []);

  // Collect manual + auto tags as separate sorted pools so the filter column
  // can render user-typed tags above LLM-applied ones with a visual divider.
  // Auto tags shadowed by a manual one are filtered out (manual wins).
  const allManualTags = [...new Set(entries.flatMap(e => e.tags || []))].sort();
  const manualSet = new Set(allManualTags);
  const allAutoTags = [...new Set(entries.flatMap(e => e.auto_tags || []))]
    .filter((t) => !manualSet.has(t))
    .sort();
  const allTags = [...allManualTags, ...allAutoTags];

  return {
    entries,
    activeEntry,
    loading,
    createEntry,
    updateEntry,
    deleteEntry,
    selectEntry,
    refreshEntries: fetchEntries,
    allTags,
    allManualTags,
    allAutoTags,
  };
}
