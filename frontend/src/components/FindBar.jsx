import { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// Scoped find-on-page overlay. Walks only text inside elements marked with
// `data-find-scope="1"` (journal/notes editor wraps + their mirror panels),
// so list-sidebar text and chrome don't drown out real prose matches.
//
// Uses the Selection API to highlight the current match; Range+scrollIntoView
// brings it into view inside whichever scrollable container owns the text.
export default function FindBar({ onClose }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  // Remember the query that produced the current matches, so Enter repeated
  // on the same string steps forward instead of re-collecting every time.
  const [searchedQuery, setSearchedQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Walk every scoped container's text nodes and collect ranges of each
  // occurrence of the needle. Skips nodes inside display:none / visibility:
  // hidden ancestors so collapsed UI doesn't produce unreachable matches.
  const collectMatches = useCallback((needle) => {
    if (!needle) return [];
    const lower = needle.toLowerCase();
    const scopes = document.querySelectorAll('[data-find-scope="1"]');
    const out = [];
    for (const root of scopes) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          let el = node.parentElement;
          while (el && el !== root) {
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
            el = el.parentElement;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let node;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue.toLowerCase();
        let idx = 0;
        while ((idx = text.indexOf(lower, idx)) !== -1) {
          out.push({ node, start: idx, end: idx + lower.length });
          idx += lower.length || 1;
        }
      }
    }
    return out;
  }, []);

  function highlight(match) {
    try {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      const range = document.createRange();
      range.setStart(match.node, match.start);
      range.setEnd(match.node, match.end);
      sel?.addRange(range);
      const el = match.node.parentElement;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    } catch {}
  }

  // Run (or advance) the search. If the query string hasn't changed since the
  // last run, step through the existing match list — otherwise recollect and
  // land on the first result. Called from Enter / Shift+Enter / the nav buttons.
  //
  // We deliberately don't search-as-you-type: the selection/scrollIntoView
  // calls pull focus out of the input, so the user would have to re-click the
  // field between every keystroke.
  function runSearch(dir = 1) {
    if (!query) {
      setMatches([]); setActiveIdx(-1); setSearchedQuery('');
      try { window.getSelection()?.removeAllRanges(); } catch {}
      return;
    }
    if (query !== searchedQuery) {
      const m = collectMatches(query);
      setMatches(m);
      setSearchedQuery(query);
      if (m.length > 0) {
        const first = dir >= 0 ? 0 : m.length - 1;
        setActiveIdx(first);
        highlight(m[first]);
        // Don't refocus the input — focusing a text input clears the document
        // Selection, which is what draws the blue highlight on the match.
      } else {
        setActiveIdx(-1);
        try { window.getSelection()?.removeAllRanges(); } catch {}
      }
      return;
    }
    if (matches.length === 0) return;
    const next = (activeIdx + dir + matches.length) % matches.length;
    setActiveIdx(next);
    highlight(matches[next]);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); runSearch(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
  }

  function handleClose() {
    try { window.getSelection()?.removeAllRanges(); } catch {}
    onClose();
  }

  const labelFind = t('findBar.find') || 'Find';
  const labelNoMatches = t('findBar.noMatches') || 'No matches';
  const labelPrev = t('findBar.previous') || 'Previous';
  const labelNext = t('findBar.next') || 'Next';
  const labelClose = t('common.close') || 'Close';

  // Only show count/no-matches after a search has actually been run for this
  // query — while the user is still typing, stay quiet.
  const countText = query && query === searchedQuery
    ? (matches.length === 0 ? labelNoMatches : `${activeIdx + 1}/${matches.length}`)
    : '';

  return (
    <div
      role="dialog"
      aria-label={labelFind}
      style={{
        position: 'fixed',
        top: '12px',
        right: '16px',
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 8px',
        background: 'var(--surface, #fff)',
        border: 'var(--border-style, 1px solid #e5e5e5)',
        borderRadius: '10px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
        fontFamily: 'var(--font)',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={labelFind}
        style={{
          width: '220px',
          padding: '6px 8px',
          fontSize: '13px',
          border: 'var(--border-style, 1px solid #e5e5e5)',
          borderRadius: '6px',
          background: 'var(--near-white, #fafafa)',
          color: 'var(--body, #222)',
          fontFamily: 'var(--font)',
          outline: 'none',
        }}
      />
      {countText && (
        <span style={{ fontSize: '11px', color: 'var(--muted, #888)', padding: '0 4px', minWidth: '40px', textAlign: 'center' }}>
          {countText}
        </span>
      )}
      <button
        onClick={() => runSearch(1)}
        title={t('common.search') || 'Search'}
        aria-label={t('common.search') || 'Search'}
        style={iconBtnStyle}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="7" cy="7" r="4.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" />
        </svg>
      </button>
      <button
        onClick={() => runSearch(-1)}
        title={labelPrev}
        aria-label={labelPrev}
        style={iconBtnStyle}
      >↑</button>
      <button
        onClick={() => runSearch(1)}
        title={labelNext}
        aria-label={labelNext}
        style={iconBtnStyle}
      >↓</button>
      <button
        onClick={handleClose}
        title={labelClose}
        aria-label={labelClose}
        style={iconBtnStyle}
      >✕</button>
    </div>
  );
}

const iconBtnStyle = {
  width: '26px',
  height: '26px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '6px',
  background: 'transparent',
  color: 'var(--muted, #666)',
  cursor: 'pointer',
  fontSize: '13px',
  fontFamily: 'var(--font)',
};
