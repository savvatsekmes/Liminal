import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api';

// Live tag suggestions for the editor's tag bar.
//
// Debounces by 1.5s after the user stops typing, then asks the backend for
// 2–5 themed tag keys. Existing tags on the entry are excluded so the bar
// only ever shows fresh additions the user can click to apply.
//
// Skips the request entirely for very short text — same threshold as the
// backend (80 chars) — so opening a blank entry doesn't fire a call.
export function useTagSuggestions(text, existing = [], { debounceMs = 1500, minChars = 80 } = {}) {
  const [suggestions, setSuggestions] = useState([]);
  const lastTextRef = useRef('');
  const abortRef = useRef(null);

  // Stable string key for `existing` so the effect doesn't re-fire every render
  // when a fresh array reference comes in. Tags are short — JSON.stringify is fine.
  const existingKey = JSON.stringify(existing || []);

  useEffect(() => {
    const t = (text || '').trim();
    if (t.length < minChars) {
      setSuggestions([]);
      lastTextRef.current = '';
      return;
    }
    // Skip if text hasn't actually changed (e.g. tags array updated only)
    if (t === lastTextRef.current) return;

    const handle = setTimeout(async () => {
      lastTextRef.current = t;
      try {
        // Cancel any in-flight previous request
        if (abortRef.current) abortRef.current.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const res = await apiFetch('/api/tags/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: t, existing: JSON.parse(existingKey) }),
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.tags)) setSuggestions(data.tags);
      } catch {
        // Aborts and network blips silently fall through — the bar just keeps
        // its previous suggestions.
      }
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [text, existingKey, debounceMs, minChars]);

  // Allow callers to optimistically clear a single suggestion when the user
  // clicks it (so it disappears from the bar immediately rather than waiting
  // for the next debounce).
  function dismiss(tag) {
    setSuggestions((prev) => prev.filter((s) => s !== tag));
  }

  return { suggestions, dismiss };
}
