import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';

// Per-user "core" tag set. Core tags are pinned to the top of the tag-filter
// column. Independent of locked tags — a tag can be core, locked, both, or
// neither. Note built-in types (idea, quote, …) are not part of this set:
// they already render as their own TypePill row above the custom tags.

let cached = null;
let loading = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(cached);
}

async function loadOnce() {
  if (cached) return cached;
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await apiFetch('/api/tags/core');
      const data = await res.json();
      cached = new Set((data?.tags || []).map(t => String(t).toLowerCase()));
    } catch {
      cached = new Set();
    }
    notify();
    return cached;
  })();
  return loading;
}

export function useCoreTags() {
  const [, tick] = useState(0);

  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    listeners.add(fn);
    loadOnce();
    return () => { listeners.delete(fn); };
  }, []);

  const set = cached || new Set();
  const coreList = [...set].sort();

  function isCore(tag) {
    return set.has(String(tag || '').toLowerCase());
  }

  async function makeCore(tag) {
    const t = String(tag || '').trim().toLowerCase();
    if (!t) return;
    if (!cached) cached = new Set();
    cached.add(t);
    notify();
    try {
      await apiFetch('/api/tags/core', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: t }),
      });
    } catch {
      cached.delete(t);
      notify();
    }
  }

  async function removeCore(tag) {
    const t = String(tag || '').trim().toLowerCase();
    if (!t) return;
    if (!cached) cached = new Set();
    cached.delete(t);
    notify();
    try {
      await apiFetch(`/api/tags/core/${encodeURIComponent(t)}`, { method: 'DELETE' });
    } catch {
      cached.add(t);
      notify();
    }
  }

  return { isCore, makeCore, removeCore, coreList };
}
