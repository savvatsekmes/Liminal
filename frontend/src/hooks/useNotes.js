import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/api';

const API = '/api/notes';

export function useNotes() {
  const [notes, setNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterCustomTag, setFilterCustomTag] = useState(null);
  const [customTags, setCustomTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const saveTimers = useRef({});

  const fetchNotes = useCallback(async (type = filterType, customTag = filterCustomTag) => {
    const params = new URLSearchParams();
    if (type && type !== 'all') params.set('type', type);
    if (type === 'custom' && customTag) params.set('custom_tag', customTag);
    const res = await apiFetch(`${API}?${params}`);
    const data = await res.json();
    setNotes(data);
    // Keep active note in sync
    setActiveNote((prev) => {
      if (!prev) return prev;
      return data.find((n) => n.id === prev.id) || null;
    });
  }, [filterType, filterCustomTag]);

  const fetchCustomTags = useCallback(async () => {
    const res = await apiFetch(`${API}/custom-tags`);
    setCustomTags(await res.json());
  }, []);

  useEffect(() => {
    fetchNotes(filterType, filterCustomTag);
  }, [filterType, filterCustomTag]);

  useEffect(() => {
    fetchCustomTags();
  }, []);

  async function createNote(type = 'idea', customTag = null) {
    const body = {
      type,
      body: '',
      ...(type === 'custom' && customTag ? { custom_tag: customTag } : {}),
    };
    const res = await apiFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const note = await res.json();
    setNotes((prev) => [note, ...prev]);
    setActiveNote(note);
    if (type === 'custom' && customTag) {
      setCustomTags((prev) => prev.includes(customTag) ? prev : [...prev, customTag].sort());
    }
    return note;
  }

  function updateNoteLocal(id, fields) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...fields } : n));
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
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setActiveNote((prev) => prev?.id === id ? null : prev);
  }

  async function deleteCustomTag(tag) {
    await apiFetch(`${API}/custom-tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
    setNotes((prev) => prev.map((n) =>
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
    if (filterType === 'custom' && filterCustomTag === tag) {
      setFilterType('none');
      setFilterCustomTag(null);
    }
  }

  function selectNote(note) {
    setActiveNote(note);
  }

  function changeFilter(type, customTag = null) {
    setFilterType(type);
    setFilterCustomTag(customTag);
    setActiveNote(null);
  }

  return {
    notes,
    activeNote,
    filterType,
    filterCustomTag,
    customTags,
    loading,
    createNote,
    scheduleUpdate,
    deleteNote,
    deleteCustomTag,
    selectNote,
    changeFilter,
    refreshCustomTags: fetchCustomTags,
  };
}
