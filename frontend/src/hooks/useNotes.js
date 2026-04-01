import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiFetch } from '../utils/api';

const API = '/api/notes';

export function useNotes() {
  const [allNotes, setAllNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [activeFilters, setActiveFilters] = useState([]); // empty = show all
  const [customTags, setCustomTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const saveTimers = useRef({});

  // Collect all unique tags across notes
  const allTags = useMemo(() =>
    [...new Set(allNotes.flatMap(n => n.tags || []))].sort()
  , [allNotes]);

  // Client-side filtered list — check note.tags array
  const notes = useMemo(() => {
    if (activeFilters.length === 0) return allNotes;
    return allNotes.filter((n) =>
      (n.tags || []).some(tag => activeFilters.includes(tag))
    );
  }, [allNotes, activeFilters]);

  const fetchNotes = useCallback(async () => {
    const res = await apiFetch(API);
    const data = await res.json();
    setAllNotes(data);
    setActiveNote((prev) => {
      if (!prev) return data[0] || null;
      return data.find((n) => n.id === prev.id) || data[0] || null;
    });
  }, []);

  const fetchCustomTags = useCallback(async () => {
    const res = await apiFetch(`${API}/custom-tags`);
    setCustomTags(await res.json());
  }, []);

  useEffect(() => { fetchNotes(); }, []);
  useEffect(() => { fetchCustomTags(); }, []);

  // Auto-select first note when filters change and active note is no longer visible
  useEffect(() => {
    if (activeNote && !notes.find((n) => n.id === activeNote.id)) {
      setActiveNote(notes[0] || null);
    }
  }, [notes]);

  function toggleFilter(key) {
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function clearFilters() {
    setActiveFilters([]);
  }

  async function createNote(type = 'none', customTag = null, tags = []) {
    const body = {
      type,
      body: '',
      tags,
      ...(type === 'custom' && customTag ? { custom_tag: customTag } : {}),
    };
    const res = await apiFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const note = await res.json();
    setAllNotes((prev) => [note, ...prev]);
    setActiveNote(note);
    if (type === 'custom' && customTag) {
      setCustomTags((prev) => prev.includes(customTag) ? prev : [...prev, customTag].sort());
    }
    return note;
  }

  function updateNoteLocal(id, fields) {
    setAllNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...fields } : n));
    setActiveNote((prev) => prev?.id === id ? { ...prev, ...fields } : prev);
  }

  function scheduleUpdate(id, fields) {
    updateNoteLocal(id, fields);
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      saveNote(id, fields);
      delete saveTimers.current[id];
    }, 700);
  }

  async function saveNote(id, fields) {
    await apiFetch(`${API}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
  }

  async function deleteNote(id) {
    clearTimeout(saveTimers.current[id]);
    delete saveTimers.current[id];
    await apiFetch(`${API}/${id}`, { method: 'DELETE' });
    setAllNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      setActiveNote((cur) => cur?.id === id ? (next[0] || null) : cur);
      return next;
    });
  }

  async function deleteCustomTag(tag) {
    await apiFetch(`${API}/custom-tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
    setAllNotes((prev) => prev.map((n) =>
      n.type === 'custom' && n.custom_tag === tag
        ? { ...n, type: 'none', custom_tag: null }
        : n
    ));
    setActiveNote((prev) =>
      prev?.type === 'custom' && prev?.custom_tag === tag
        ? { ...prev, type: 'none', custom_tag: null }
        : prev
    );
    setCustomTags((prev) => prev.filter((t) => t !== tag));
    setActiveFilters((prev) => prev.filter(k => k !== `custom:${tag}`));
  }

  function selectNote(note) {
    setActiveNote(note);
  }

  return {
    notes,
    activeNote,
    activeFilters,
    allTags,
    customTags,
    loading,
    createNote,
    scheduleUpdate,
    deleteNote,
    deleteCustomTag,
    selectNote,
    toggleFilter,
    clearFilters,
    refreshCustomTags: fetchCustomTags,
  };
}
