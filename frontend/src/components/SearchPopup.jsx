import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';

const DEBOUNCE_MS = 180;
// Meaning-based results use the local embedding model — wait for a pause in
// typing rather than firing on every keystroke.
const RELATED_DEBOUNCE_MS = 450;

export default function SearchPopup({ open, onClose, onNavigateEntry, onNavigateNote, onNavigateOracle }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ entries: [], notes: [], oracle: [] });
  const [loading, setLoading] = useState(false);
  const [related, setRelated] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const inputRef = useRef(null);
  const reqIdRef = useRef(0);
  const relatedReqIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults({ entries: [], notes: [], oracle: [] });
    setRelated([]);
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setResults({ entries: [], notes: [], oracle: [] }); setLoading(false); return; }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    const handle = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(data => {
          if (reqId !== reqIdRef.current) return;
          setResults(data || { entries: [], notes: [], oracle: [] });
        })
        .catch(() => {})
        .finally(() => { if (reqId === reqIdRef.current) setLoading(false); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const reqId = ++relatedReqIdRef.current;
    if (q.length < 3) { setRelated([]); setRelatedLoading(false); return; }
    setRelatedLoading(true);
    const handle = setTimeout(() => {
      apiFetch(`/api/search/related?q=${encodeURIComponent(q)}&limit=12`)
        .then(r => r.json())
        .then(data => { if (reqId === relatedReqIdRef.current) setRelated(data?.entries || []); })
        .catch(() => {})
        .finally(() => { if (reqId === relatedReqIdRef.current) setRelatedLoading(false); });
    }, RELATED_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (!open) return null;

  // Entries the word search already lists aren't repeated under "related".
  const exactIds = new Set(results.entries.map(e => e.id));
  const relatedEntries = related.filter(e => !exactIds.has(e.id)).slice(0, 10);
  const exactTotal = results.entries.length + results.notes.length + results.oracle.length;
  const total = exactTotal + relatedEntries.length;
  const stripHtml = (s) => String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const snippet = (text, q) => {
    const s = stripHtml(text);
    if (!s) return '';
    if (!q) return s.slice(0, 140);
    const idx = s.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return s.slice(0, 140);
    const start = Math.max(0, idx - 40);
    const end = Math.min(s.length, idx + q.length + 80);
    return (start > 0 ? '…' : '') + s.slice(start, end) + (end < s.length ? '…' : '');
  };
  const hl = (text, q) => {
    if (!q) return text;
    const parts = String(text).split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
    return parts.map((p, i) => p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} style={{ background: 'var(--panel-bg)', color: 'var(--strong)', padding: 0 }}>{p}</mark>
      : <span key={i}>{p}</span>);
  };

  const groupStyle = { marginBottom: '14px' };
  const groupHeader = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', padding: '4px 14px', marginBottom: '4px' };
  const item = {
    padding: '10px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: '3px',
  };
  const title = { fontSize: '13px', color: 'var(--strong)', fontWeight: 500 };
  const snip = { fontSize: '12px', color: 'var(--body)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' };
  const meta = { fontSize: '10px', color: 'var(--muted)' };
  // Related-by-meaning panel: its own scroll under the exact matches, tinted
  // blue (translucent, so it reads on both the light and the dark theme).
  const relatedTint = 'rgba(80, 135, 225, 0.08)';
  const relatedHover = 'rgba(80, 135, 225, 0.15)';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99990,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh',
      }}
    >
      {/* Two stacked cards: the word search, and under it a separate box of
          entries related by meaning. Each scrolls on its own. */}
      <div style={{
        width: 'min(560px, 92vw)', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: '1 1 auto', minHeight: 0,
          background: 'var(--white)', borderRadius: '12px',
          border: 'var(--border-style)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: 'var(--border-style)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--muted)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entries, notes, conversations…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: '15px', color: 'var(--strong)', padding: 0,
            }}
          />
          {(loading || relatedLoading) && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>…</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', padding: '2px 6px' }}>esc</button>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '12px 6px', margin: '0 3px 10px 0' }}>
          {!query.trim() && (
            <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center' }}>
              Type to search across journal entries, notes, and conversations.
            </div>
          )}
          {query.trim() && !loading && !relatedLoading && total === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center' }}>
              No results for "{query}"
            </div>
          )}
          {query.trim() && !loading && exactTotal === 0 && relatedEntries.length > 0 && (
            <div style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center' }}>
              No exact matches for "{query}"
            </div>
          )}

          {results.entries.length > 0 && (
            <div style={groupStyle}>
              <div style={groupHeader}>Journal entries · {results.entries.length}</div>
              {results.entries.map(e => (
                <div
                  key={`e-${e.id}`}
                  style={item}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = 'var(--near-white)'}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = 'transparent'}
                  onClick={() => { onNavigateEntry?.(e.id); onClose?.(); }}
                >
                  <div style={title}>{hl(e.title || 'Untitled', query)}</div>
                  <div style={snip}>{hl(snippet(e.body_text, query), query)}</div>
                  <div style={meta}>{e.date || ''}</div>
                </div>
              ))}
            </div>
          )}

          {results.notes.length > 0 && (
            <div style={groupStyle}>
              <div style={groupHeader}>Notes · {results.notes.length}</div>
              {results.notes.map(n => (
                <div
                  key={`n-${n.id}`}
                  style={item}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = 'var(--near-white)'}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = 'transparent'}
                  onClick={() => { onNavigateNote?.(n.id); onClose?.(); }}
                >
                  <div style={title}>{hl(n.title || (n.type ? n.type.charAt(0).toUpperCase() + n.type.slice(1) : 'Note'), query)}</div>
                  <div style={snip}>{hl(snippet(n.body, query), query)}</div>
                </div>
              ))}
            </div>
          )}

          {results.oracle.length > 0 && (
            <div style={groupStyle}>
              <div style={groupHeader}>Conversations · {results.oracle.length}</div>
              {results.oracle.map(o => (
                <div
                  key={`o-${o.session_id}`}
                  style={item}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = 'var(--near-white)'}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = 'transparent'}
                  onClick={() => { onNavigateOracle?.(o.session_id); onClose?.(); }}
                >
                  <div style={title}>{hl(o.title, query)}</div>
                  <div style={snip}>{hl(snippet(o.snippet, query), query)}</div>
                  <div style={meta}>{o.archetype}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

        {relatedEntries.length > 0 && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: '0 1 auto', minHeight: 0, maxHeight: '34vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              backgroundColor: 'var(--white)',
              backgroundImage: `linear-gradient(${relatedTint}, ${relatedTint})`,
              borderRadius: '12px', border: 'var(--border-style)',
              // Bevel: a light top edge and a soft dark bottom edge, inside the drop shadow.
              boxShadow: '0 20px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.12)',
            }}
          >
            {/* Inset from the box's rounded corners so the scrollbar stays inside. */}
            <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '2px 6px 0', margin: '8px 3px 8px 0' }}>
            <div style={groupHeader} title="Entries about the same thing, even if they use different words">Related · {relatedEntries.length}</div>
            {relatedEntries.map(e => (
              <div
                key={`r-${e.id}`}
                style={item}
                onMouseEnter={(ev) => ev.currentTarget.style.background = relatedHover}
                onMouseLeave={(ev) => ev.currentTarget.style.background = 'transparent'}
                onClick={() => { onNavigateEntry?.(e.id); onClose?.(); }}
              >
                <div style={title}>{e.title || 'Untitled'}</div>
                <div style={{ ...snip, WebkitLineClamp: 3 }}>{e.excerpt}</div>
                <div style={meta}>{e.date || ''}</div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
