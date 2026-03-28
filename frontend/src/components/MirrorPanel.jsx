import { useState } from 'react';
import MirrorBlock from './MirrorBlock';

const s = {
  root: {
    width: '100%',
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
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    background: 'var(--white)',
  },
  footerLeft: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  footerBtn: {
    fontSize: '12px',
    color: 'var(--muted)',
    padding: '5px 10px',
    border: 'var(--border-style)',
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'color 0.12s, border-color 0.12s',
    background: 'var(--white)',
  },
  reflectBtn: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--white)',
    background: 'var(--strong)',
    padding: '7px 18px',
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    border: 'none',
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
  loading,
  error,
  entryText,
  ttsOnline,
  onReflect,
  onRegenerateBlock,
}) {
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
        {!loading && !error && blocks.map((block, i) => (
          <MirrorBlock
            key={i}
            block={block}
            entryText={entryText}
            ttsOnline={ttsOnline}
            onRegenerate={(blk, archetype) => onRegenerateBlock(blk, archetype, i)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <div style={s.footerLeft}>
          <button style={s.footerBtn} title="Archetypes (coming in Phase 4)">
            Archetypes
          </button>
          <button style={s.footerBtn} title="Sliders (coming in Phase 4)">
            Sliders
          </button>
        </div>

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
