import { useState } from 'react';
import MirrorBlock from './MirrorBlock';

const s = {
  root: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--near-white)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: '40px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  headerCount: {
    fontSize: '11px',
    color: 'var(--muted)',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
  },
  empty: {
    padding: '40px 24px',
    fontSize: '12px',
    color: 'var(--muted)',
    lineHeight: '1.8',
    textAlign: 'center',
  },
  footer: {
    borderTop: 'var(--border-style)',
    padding: '14px 18px',
    flexShrink: 0,
    background: 'var(--white)',
  },
  reflectBtn: {
    width: '100%',
    fontSize: '12px',
    padding: '9px 0',
    fontWeight: '500',
    color: 'var(--white)',
    background: 'var(--strong)',
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    border: 'none',
    fontFamily: 'var(--font)',
  },
  reflectBtnLoading: {
    opacity: 0.55,
    cursor: 'default',
  },
  loadingState: {
    padding: '40px 24px',
    textAlign: 'center',
  },
  loadingDots: {
    fontSize: '24px',
    color: 'var(--muted)',
    letterSpacing: '4px',
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  loadingText: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginTop: '12px',
  },
  opening: {
    padding: '22px 24px 18px',
    fontSize: '13px',
    fontStyle: 'italic',
    color: 'var(--strong)',
    lineHeight: '1.75',
    borderBottom: 'var(--border-style)',
  },
  error: {
    margin: '16px 24px',
    padding: '12px 16px',
    background: 'var(--panel-bg)',
    border: 'var(--border-style)',
    borderRadius: '2px',
    fontSize: '12px',
    color: 'var(--body)',
    lineHeight: '1.6',
  },
};

export default function MirrorPanel({
  blocks,
  opening,
  loading,
  error,
  entryText,
  ttsOnline,
  onReflect,
  onRegenerateBlock,
  previewVersion,
  onClearPreview,
}) {
  if (previewVersion) {
    return (
      <div style={s.root}>
        <div style={s.header}>
          <span style={s.headerLabel}>Version Preview</span>
          <button
            onClick={onClearPreview}
            style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            ✕ Close
          </button>
        </div>
        <div style={{ ...s.body, padding: '20px 24px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px', fontStyle: 'italic' }}>
            {formatVersionDate(previewVersion.saved_at)}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: '1.85', whiteSpace: 'pre-wrap' }}>
            {previewVersion.body_text || '—'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerLabel}>Mirror</span>
        {blocks.length > 0 && (
          <span style={s.headerCount}>{blocks.length} reflection{blocks.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Body */}
      <div style={s.body}>
        {loading && <LoadingState />}
        {!loading && error && <div style={s.error}>{error}</div>}
        {!loading && !error && blocks.length === 0 && <EmptyState />}
        {!loading && !error && opening && (
          <div style={s.opening}>{opening}</div>
        )}
        {!loading && !error && blocks.map((block, i) => (
          <MirrorBlock
            key={i}
            block={block}
            entryText={entryText}
            ttsOnline={ttsOnline}
            onRegenerate={(blk, archetype) => onRegenerateBlock(blk, archetype, i, entryText)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <button
          style={{ ...s.reflectBtn, ...(loading ? s.reflectBtnLoading : {}) }}
          onClick={onReflect}
          disabled={loading}
        >
          {loading ? 'Reflecting…' : '✦ Reflect'}
        </button>
      </div>
    </div>
  );
}

function formatVersionDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + time;
}

function EmptyState() {
  return (
    <div style={s.empty}>
      <div style={{ fontSize: '20px', marginBottom: '12px', color: 'var(--border)' }}>◎</div>
      <div>Write something, then press Reflect.</div>
      <div style={{ marginTop: '6px', color: 'var(--border)' }}>
        The Mirror reads your whole story.
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={s.loadingState}>
      <div style={s.loadingDots}>· · ·</div>
      <div style={s.loadingText}>Reading your entry…</div>
    </div>
  );
}
