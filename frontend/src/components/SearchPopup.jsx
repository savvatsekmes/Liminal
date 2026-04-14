import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';

const DEBOUNCE_MS = 180;

export default function SearchPopup({ open, onClose, onNavigateEntry, onNavigateNote, onNavigateOracle }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ entries: [], notes: [], oracle: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults({ entries: [], notes: [], oracle: [] });
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

  if (!open) return null;

  const total = results.entries.length + results.notes.length + results.oracle.length;
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
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 92vw)', maxHeight: '72vh',
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
          {loading && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>…</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', padding: '2px 6px' }}>esc</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 6px' }}>
          {!query.trim() && (
            <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center' }}>
              Type to search across journal entries, notes, and conversations.
            </div>
          )}
          {query.trim() && !loading && total === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center' }}>
              No results for "{query}"
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
    </div>
  );
}
