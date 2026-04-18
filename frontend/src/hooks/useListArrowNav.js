import { useEffect } from 'react';

// Arrow-key navigation for sidebar lists (journal, notes, oracle).
// Only fires when the user isn't typing (no focus in inputs, textareas,
// selects, or contenteditable — so the editor's own cursor movement is
// untouched).
export function useListArrowNav(items, getId, activeId, onSelect, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (!items || items.length === 0) return;
    function handler(e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el && el !== document.body) {
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (el.isContentEditable) return;
      }
      const idx = items.findIndex(it => getId(it) === activeId);
      let next;
      if (idx < 0) {
        next = 0;
      } else if (e.key === 'ArrowDown') {
        if (idx >= items.length - 1) return;
        next = idx + 1;
      } else {
        if (idx <= 0) return;
        next = idx - 1;
      }
      e.preventDefault();
      onSelect(items[next]);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, getId, activeId, onSelect, enabled]);
}
