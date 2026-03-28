import { useState } from 'react';

function formatVersion(isoStr) {
  const d = new Date(isoStr);
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now - 86400000).toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today) return `Today, ${time}`;
  if (d.toDateString() === yesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + time;
}

export default function VersionsPanel({ isOpen, onClose, versions, onRestore, loading, title }) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 199,
          background: 'rgba(0,0,0,0.08)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: '340px',
        background: 'var(--white)',
        borderLeft: 'var(--border-style)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '44px',
          padding: '0 16px',
          borderBottom: 'var(--border-style)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--strong)' }}>
            ◷ {title || 'Versions'}
          </span>
          <button
            onClick={onClose}
            title="Close"
            style={{
              fontSize: '16px',
              color: 'var(--muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px',
              borderRadius: '3px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '24px 16px', fontSize: '12px', color: 'var(--muted)' }}>
              Loading…
            </div>
          ) : versions.length === 0 ? (
            <div style={{ padding: '24px 16px', fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
              No versions yet
            </div>
          ) : (
            versions.map((v) => (
              <VersionItem key={v.id} version={v} onRestore={onRestore} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function VersionItem({ version, onRestore }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 16px',
        borderBottom: 'var(--border-style)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '8px',
        position: 'relative',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: 'var(--strong)', marginBottom: '3px' }}>
          {formatVersion(version.saved_at)}
        </div>
        <div style={{
          fontSize: '11px',
          color: 'var(--muted)',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: '1.4',
        }}>
          {version.preview || '—'}
        </div>
      </div>
      {hover && (
        <button
          onClick={() => onRestore(version)}
          style={{
            fontSize: '11px',
            color: 'var(--muted)',
            background: 'var(--panel-bg)',
            border: 'var(--border-style)',
            borderRadius: '3px',
            cursor: 'pointer',
            padding: '3px 8px',
            flexShrink: 0,
            fontFamily: 'var(--font)',
            whiteSpace: 'nowrap',
          }}
        >
          Restore
        </button>
      )}
    </div>
  );
}
