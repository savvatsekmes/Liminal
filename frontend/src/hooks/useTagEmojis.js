// Per-user dynamic tag→emoji map.
//
// Loads the merged { overrides, cache } from the backend on mount. Exposes
// a stable `dynamicMap` ref the tagEmoji utility resolvers can take as an
// optional argument to layer user overrides + LLM-suggested cache on top of
// the hardcoded TAG_EMOJI classics.
//
// Exported as a React Context provider so every leaf consumer (tag pills,
// entry strips, filter rows) shares the same single source of truth — no
// duplicate network fetches, instant consistency when overrides change.
//
// Also exposes:
//   - setOverride(tag, emoji)   → PUT /api/tags/emoji-overrides
//   - clearOverride(tag)        → DELETE /api/tags/emoji-overrides/:tag
//   - lookup(tag)               → POST /api/tags/emoji-suggest (async, fills cache)
//   - primeUnknown(tags[])      → batch lookups, max 3 concurrent
//
// `lookup` is debounced internally — multiple callers requesting the same
// tag dedupe into a single backend call. Already-cached or hardcoded tags
// skip the call entirely.

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api';

// Local mirror of the hardcoded TAG_EMOJI keys so we don't re-import the
// full map (we only need to know which keys to skip on lookup). Kept in
// sync manually with frontend/src/utils/tagEmoji.js — if you add a classic
// there, add the key here too.
const HARDCODED_KEYS = new Set([
  'breakthrough','fights','idea','quote','goal','reflection','none',
  'identity','career','spirituality','relationships','self-work','creativity',
  'health','ideas','grief','body','fear','joy','transition','work','family',
  'nature','dreams','money','love','anxiety','growth','anger','gratitude',
  'travel','friendship','loss','success','failure','conflict','healing',
  'motivation','stress','peace','change','music','art','food','fitness',
  'sleep','therapy','daily','dream','sex','nostalgia','loneliness',
  'confidence','vulnerability',
]);

const TagEmojiContext = createContext(null);

// Wrap somewhere near the app root so every descendant `useTagEmojis()`
// returns the same shared map. Outside the provider the hook still works
// but each component gets its own state (legacy mode for tests).
export function TagEmojiProvider({ children }) {
  const value = _useTagEmojisInternal();
  return createElement(TagEmojiContext.Provider, { value }, children);
}

export function useTagEmojis() {
  const ctx = useContext(TagEmojiContext);
  if (ctx) return ctx;
  // Fallback for components not yet wrapped in the provider.
  return _useTagEmojisInternal();
}

function _useTagEmojisInternal() {
  const [overrides, setOverrides] = useState({});
  const [cache, setCache] = useState({});
  // Single dynamic-map object reference whose identity changes only when
  // either map mutates. Lets consumers memoise derived values.
  const [dynamicMap, setDynamicMap] = useState({ overrides: {}, cache: {} });
  const inflightRef = useRef(new Map()); // tag → Promise (dedupes concurrent lookups)

  useEffect(() => {
    setDynamicMap({ overrides, cache });
  }, [overrides, cache]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/tags/emoji-map');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setOverrides(data.overrides || {});
        setCache(data.cache || {});
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const setOverride = useCallback(async (tag, emoji) => {
    const key = String(tag || '').trim().toLowerCase();
    if (!key) return;
    // Optimistic update
    setOverrides((prev) => {
      const next = { ...prev };
      if (emoji) next[key] = emoji; else delete next[key];
      return next;
    });
    try {
      await apiFetch('/api/tags/emoji-overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: key, emoji: emoji || null }),
      });
    } catch (err) {
      console.warn('[useTagEmojis] setOverride failed:', err?.message);
    }
  }, []);

  const clearOverride = useCallback(async (tag) => {
    const key = String(tag || '').trim().toLowerCase();
    if (!key) return;
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      await apiFetch(`/api/tags/emoji-overrides/${encodeURIComponent(key)}`, { method: 'DELETE' });
    } catch {}
  }, []);

  // Fire an LLM emoji lookup for `tag` if we don't already have one.
  // No-ops for tags covered by overrides or hardcoded classics. Returns a
  // promise that resolves to the resolved emoji string (or null).
  const lookup = useCallback(async (tag) => {
    const key = String(tag || '').trim().toLowerCase();
    if (!key) return null;
    if (overrides[key]) return overrides[key];
    if (HARDCODED_KEYS.has(key)) return null; // classic handled by tagEmoji() resolver
    if (cache[key] !== undefined) return cache[key] || null;
    // Dedupe concurrent lookups
    if (inflightRef.current.has(key)) return inflightRef.current.get(key);
    const p = (async () => {
      try {
        const res = await apiFetch('/api/tags/emoji-suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: key }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const emoji = data?.emoji || '';
        // Update cache state — empty string is intentional, marks "we tried"
        setCache((prev) => ({ ...prev, [key]: emoji }));
        return emoji || null;
      } catch {
        return null;
      } finally {
        inflightRef.current.delete(key);
      }
    })();
    inflightRef.current.set(key, p);
    return p;
  }, [overrides, cache]);

  // Batched primer — given a list of tags, fire lookups for any that aren't
  // covered by overrides + hardcoded + cache. Caps at 1 concurrent lookup
  // and adds a 3-second deferral after the hook mounts so the rush of tag
  // lookups doesn't pile onto the local LLM at app startup. On some Ollama
  // installs each call briefly bumps a process state that flashes a console
  // window — staggering avoids the visual noise even when the underlying
  // priming is otherwise fine.
  const mountedAtRef = useRef(Date.now());
  const primeUnknown = useCallback((tags) => {
    if (!Array.isArray(tags) || !tags.length) return;
    const queue = [];
    const seen = new Set();
    for (const raw of tags) {
      const key = String(raw || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (overrides[key] || HARDCODED_KEYS.has(key) || cache[key] !== undefined) continue;
      queue.push(key);
    }
    if (!queue.length) return;
    // Defer the first lookup so initial-render bursts don't all fire at once.
    const sinceMount = Date.now() - mountedAtRef.current;
    const startDelay = Math.max(0, 3000 - sinceMount);
    setTimeout(() => {
      // Serial — one at a time, with a small gap between calls. The cache
      // persists per-user so a second open of the same page will skip these.
      (async () => {
        for (const tag of queue) {
          try { await lookup(tag); } catch {}
          await new Promise(r => setTimeout(r, 250));
        }
      })();
    }, startDelay);
  }, [overrides, cache, lookup]);

  return { dynamicMap, setOverride, clearOverride, lookup, primeUnknown };
}
