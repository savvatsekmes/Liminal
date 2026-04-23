import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';

const s = {
  block: {
    padding: '20px 24px',
    position: 'relative',
  },
  divider: {
    width: '95%',
    margin: '0 auto',
    borderBottom: 'var(--border-style)',
  },
  title: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--strong)',
    marginBottom: '10px',
    lineHeight: '1.3',
  },
  body: {
    fontSize: '12px',
    fontStyle: 'italic',
    color: 'var(--body)',
    lineHeight: '1.85',
    marginBottom: '10px',
  },
  quote: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    borderLeft: '2px solid var(--border)',
    paddingLeft: '10px',
    marginTop: '10px',
    marginBottom: '10px',
  },
  echo: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    borderLeft: '2px dashed var(--border)',
    paddingLeft: '10px',
    marginTop: '12px',
    marginBottom: '6px',
    lineHeight: '1.65',
  },
  echoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    marginTop: '6px',
    padding: '3px 9px',
    fontSize: '10px',
    fontFamily: 'var(--font)',
    color: 'var(--muted)',
    background: 'var(--near-white)',
    border: 'var(--border-style)',
    borderRadius: '12px',
    cursor: 'pointer',
    fontStyle: 'normal',
    transition: 'color 0.12s, background 0.12s, border-color 0.12s',
  },
  listenBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '10px',
    border: 'none',
    background: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.12s',
    verticalAlign: 'middle',
    marginLeft: '2px',
  },
  deleteBtn: {
    position: 'absolute',
    top: '8px',
    right: '10px',
    width: '20px',
    height: '20px',
    borderRadius: '10px',
    border: 'none',
    background: 'rgba(0,0,0,0.04)',
    color: 'var(--muted)',
    fontSize: '16px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.12s, color 0.12s',
  },
};

export default function MirrorBlock({ block, overrideArchetype, onChange, onPatch, onDelete, onNavigateToEntry }) {
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const audioRef = useRef(null);
  const cancelRef = useRef(false);

  const editable = typeof onChange === 'function' || typeof onPatch === 'function';
  const isManual = block.archetype === 'Manual';
  const isImported = block.source === 'imported' || block.archetype === 'Imported';
  const isEdited = !!block.edited && !isManual;

  // Provenance labels shown next to the block title, comma-separated.
  const provenance = [
    isManual ? 'added manually' : null,
    isImported ? 'imported' : null,
    isEdited ? 'edited' : null,
  ].filter(Boolean).join(' · ');

  async function handleListen() {
    if (playing) { stopSpeak(audioRef, cancelRef); setPlaying(false); return; }
    const text = (block.title ? block.title + '. ' : '') + (block.body || '') + (block.quote ? ' ' + block.quote : '');
    if (!text.trim()) return;
    cancelRef.current = false;
    setPlaying(true);
    // Override (current dropdown selection) wins over the block's stored archetype
    // so changing the dropdown updates the voice immediately, no re-reflect needed.
    // Manual blocks have no archetype voice — fall through to default.
    const arch = overrideArchetype || (isManual ? undefined : block.archetype);
    await streamSpeak(text, audioRef, cancelRef, { archetype: arch });
    setPlaying(false);
  }

  // Render body with **bold** preserved from the LLM
  function renderBody(text) {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  function commitField(field, value) {
    if (value === block[field]) return;
    if (onPatch) onPatch({ [field]: value });
    else onChange({ ...block, [field]: value });
  }

  return (
    <>
      <div
        style={s.block}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {editable && hovered && (
          <button
            onClick={onDelete}
            aria-label="Delete block"
            title="Delete block"
            style={s.deleteBtn}
          >×</button>
        )}

        {editable ? (
          <EditableField
            value={block.title || ''}
            onCommit={(v) => commitField('title', v)}
            placeholder="Title"
            style={s.title}
            inputStyle={{ fontWeight: '600', color: 'var(--strong)' }}
          />
        ) : (
          <div style={s.title}>
            {block.title}
            {provenance && (
              <span style={{
                marginLeft: 8,
                fontSize: '10px',
                fontWeight: 400,
                fontStyle: 'italic',
                color: 'var(--muted)',
                letterSpacing: '0.3px',
              }}>{provenance}</span>
            )}
          </div>
        )}

        {editable ? (
          <EditableField
            value={block.body || ''}
            onCommit={(v) => commitField('body', v)}
            placeholder="Write your reflection…"
            multiline
            style={s.body}
            inputStyle={{ fontStyle: 'italic', color: 'var(--body)' }}
          />
        ) : (
          <div style={s.body}>{renderBody(block.body)}</div>
        )}

        {editable && (block.quote || hovered) ? (
          <EditableField
            value={block.quote || ''}
            onCommit={(v) => commitField('quote', v || null)}
            placeholder="Quote (optional)"
            multiline
            style={s.quote}
            inputStyle={{ fontStyle: 'italic', color: 'var(--muted)' }}
            wrapInQuotes
          />
        ) : block.quote ? (
          <div style={s.quote}>"{block.quote}"</div>
        ) : null}

        {block.echo && block.echo.snippet ? (
          <EchoCallout echo={block.echo} onNavigate={onNavigateToEntry} />
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            style={{ ...s.listenBtn, color: playing ? 'var(--strong)' : 'var(--muted)' }}
            onClick={handleListen}
            aria-label={playing ? 'Stop' : 'Listen'}
          >
            <WaveformIcon playing={playing} />
          </button>
        </div>
      </div>
      <div style={s.divider} />
    </>
  );
}

// Click-to-edit field. Renders read-only by default; on click, swaps to a
// textarea/input. The actual commit happens in a useLayoutEffect cleanup so
// any path that ends edit mode — blur, Enter, or unmount (e.g. user switches
// to another entry without first blurring) — flushes the latest text. Escape
// cancels via a ref flag the cleanup checks.
function EditableField({ value, onCommit, placeholder, multiline, style, inputStyle, wrapInQuotes }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  const latestRef = useRef('');
  const cancelledRef = useRef(false);
  // Snapshot taken when editing starts. We deliberately do NOT refresh these
  // while editing — if the parent re-renders with a new entry's onCommit/value
  // (because the user clicked a different entry without first blurring), we
  // still need to commit to the entry the user was actually editing.
  const startOnCommitRef = useRef(null);
  const startValueRef = useRef('');

  // Focus, place caret at end, size textarea, and arrange the unmount/leave
  // commit. Cleanup runs both on the editing→false transition AND on real
  // unmount, which is the critical bit for the entry-switch case.
  useLayoutEffect(() => {
    if (!editing) return;
    cancelledRef.current = false;
    latestRef.current = value || '';
    startOnCommitRef.current = onCommit;
    startValueRef.current = value || '';
    const el = ref.current;
    if (el) {
      el.focus();
      try { el.setSelectionRange(el.value.length, el.value.length); } catch {}
      if (multiline) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
    }
    return () => {
      if (cancelledRef.current) return;
      const next = (latestRef.current || '').trim();
      if (next !== (startValueRef.current || '').trim()) {
        startOnCommitRef.current?.(next);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function autoGrow(e) {
    latestRef.current = e.target.value;
    if (!multiline) return;
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }

  if (editing) {
    const Tag = multiline ? 'textarea' : 'input';
    return (
      <Tag
        ref={ref}
        defaultValue={value || ''}
        onInput={autoGrow}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { cancelledRef.current = true; setEditing(false); }
          if (e.key === 'Enter' && !multiline) { e.preventDefault(); setEditing(false); }
        }}
        placeholder={placeholder}
        rows={multiline ? 1 : undefined}
        style={{
          ...style,
          width: '100%',
          boxSizing: 'border-box',
          background: 'var(--white)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '6px 8px',
          fontFamily: 'var(--font)',
          resize: multiline ? 'vertical' : undefined,
          outline: 'none',
          overflow: multiline ? 'hidden' : undefined,
          ...inputStyle,
        }}
      />
    );
  }

  if (!value) {
    return (
      <div
        onClick={() => setEditing(true)}
        style={{ ...style, cursor: 'text', color: 'var(--muted)', opacity: 0.55 }}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <div onClick={() => setEditing(true)} style={{ ...style, cursor: 'text' }}>
      {wrapInQuotes ? `"${value}"` : value}
    </div>
  );
}

function EchoCallout({ echo, onNavigate }) {
  const clickable = typeof onNavigate === 'function' && echo.source_id;
  const dateLabel = (() => {
    if (!echo.source_date) return '';
    try {
      const d = new Date(echo.source_date.replace(' ', 'T') + 'Z');
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
  })();
  return (
    <div style={s.echo}>
      "{echo.snippet}"
      <div>
        <button
          type="button"
          disabled={!clickable}
          onClick={() => clickable && onNavigate(echo.source_id)}
          title={dateLabel || undefined}
          style={{
            ...s.echoBadge,
            cursor: clickable ? 'pointer' : 'default',
            opacity: clickable ? 1 : 0.6,
          }}
          onMouseEnter={(e) => {
            if (!clickable) return;
            e.currentTarget.style.color = 'var(--strong)';
            e.currentTarget.style.background = 'var(--white)';
          }}
          onMouseLeave={(e) => {
            if (!clickable) return;
            e.currentTarget.style.color = 'var(--muted)';
            e.currentTarget.style.background = 'var(--near-white)';
          }}
        >
          <span style={{ fontSize: '11px', lineHeight: 1 }}>↩</span>
          <span>{echo.source_title || 'Source'}</span>
        </button>
      </div>
    </div>
  );
}

function WaveformIcon({ playing }) {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
      <rect x="1" y={playing ? 2 : 4} width="2" height={playing ? 10 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
      </rect>
      <rect x="4.5" y={playing ? 0 : 2} width="2" height={playing ? 14 : 10} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
      </rect>
      <rect x="8" y={playing ? 3 : 4} width="2" height={playing ? 8 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />}
      </rect>
      <rect x="11.5" y={playing ? 1 : 3} width="2" height={playing ? 12 : 8} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />}
      </rect>
    </svg>
  );
}
