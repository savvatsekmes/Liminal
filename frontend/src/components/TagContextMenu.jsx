import { useEffect, useRef } from 'react';

// Tiny right-click menu for a tag pill. Renders as a fixed-position floating
// panel at the cursor. Closes on outside click, Escape, or window scroll.
//
// Usage:
//   <TagContextMenu x={…} y={…} items={[{label, onClick, danger?}]} onClose={…} />
export default function TagContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onClose?.();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    function onScroll() { onClose?.(); }
    // Delay the document listener by a tick so the original contextmenu event
    // that opened us doesn't immediately trigger a close.
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDown, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', onScroll, true);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 10000,
        minWidth: '140px',
        padding: '4px',
        background: 'var(--white)',
        border: 'var(--border-style)',
        borderRadius: '6px',
        boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
        fontFamily: 'var(--font)',
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => { it.onClick?.(); onClose?.(); }}
          disabled={it.disabled}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 10px',
            fontSize: '12px',
            background: 'none',
            border: 'none',
            color: it.disabled ? 'var(--muted)' : (it.danger ? '#c0392b' : 'var(--strong)'),
            cursor: it.disabled ? 'default' : 'pointer',
            borderRadius: '4px',
            fontFamily: 'var(--font)',
          }}
          onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = 'var(--panel-bg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
