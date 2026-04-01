import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';

const API = '/api';

function today() {
  return new Date().toISOString().split('T')[0];
}

export function useEntries() {
  const [entries, setEntries] = useState([]);
  const [activeEntry, setActiveEntry] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const createEntry = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: today() + ' — Untitled',
          body: '',
          body_text: '',
          date: today(),
        }),
      });
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      setActiveEntry(entry);
      return entry;
    } catch (err) {
      console.error('[useEntries] Create failed:', err);
    }
  }, []);

  const updateEntry = useCallback(async (id, fields) => {
    try {
      const res = await apiFetch(`${API}/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const updated = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...updated } : e)));
      setActiveEntry((prev) => (prev?.id === id ? { ...prev, ...updated } : prev));
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
    try {
      const res = await apiFetch(`${API}/entries/${entry.id}`);
      const full = await res.json();
      setActiveEntry(full);
    } catch {
      setActiveEntry(entry);
    }
  }, []);

  // Collect all unique tags across entries
  const allTags = [...new Set(entries.flatMap(e => e.tags || []))].sort();

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
  };
}
