import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';

// Tags that can never be unlocked (built-in note types that should never
// expose a delete affordance). Applied on top of the user's per-tag lock set.
const ALWAYS_LOCKED = new Set(['idea', 'quote', 'reflection', 'dream', 'gratitude']);

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
      const res = await apiFetch('/api/tags/locked');
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

export function useLockedTags() {
  const [, tick] = useState(0);

  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    listeners.add(fn);
    loadOnce();
    return () => { listeners.delete(fn); };
  }, []);

  const set = cached || new Set();

  function isLocked(tag) {
    const t = String(tag || '').toLowerCase();
    return ALWAYS_LOCKED.has(t) || set.has(t);
  }

  function isAlwaysLocked(tag) {
    return ALWAYS_LOCKED.has(String(tag || '').toLowerCase());
  }

  async function lock(tag) {
    const t = String(tag || '').trim().toLowerCase();
    if (!t || ALWAYS_LOCKED.has(t)) return;
    // Optimistic
    if (!cached) cached = new Set();
    cached.add(t);
    notify();
    try {
      await apiFetch('/api/tags/locked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: t }),
      });
    } catch {
      cached.delete(t);
      notify();
    }
  }

  async function unlock(tag) {
    const t = String(tag || '').trim().toLowerCase();
    if (!t || ALWAYS_LOCKED.has(t)) return;
    if (!cached) cached = new Set();
    cached.delete(t);
    notify();
    try {
      await apiFetch(`/api/tags/locked/${encodeURIComponent(t)}`, { method: 'DELETE' });
    } catch {
      cached.add(t);
      notify();
    }
  }

  return { isLocked, isAlwaysLocked, lock, unlock };
}
