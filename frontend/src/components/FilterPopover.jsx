import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Shared pieces of the card-style list pages (Chats, Notes; Journal has its
// own copy of the same behaviour in EntryList): a Filter button that sits
// beside the search box, and a pop-out for the tag filters that opens from
// the list card's right edge. Click outside or Esc closes it; right-click
// menus and emoji pickers drawn inside the pills count as inside.

export const LIST_CARD_STYLE = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  margin: '0 0 16px 16px',
  background: 'var(--near-white)',
  borderRadius: '16px',
};

export const MAIN_CARD_STYLE = {
  background: 'var(--near-white)',
  borderRadius: '16px',
  overflow: 'hidden',
};

const POPOVER_WIDTH = 100;

const popoverStyle = {
  position: 'fixed',
  width: `${POPOVER_WIDTH}px`,
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  background: 'var(--white)',
  border: 'var(--border-style)',
  borderRadius: '16px',
  boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '12px 6px',
  gap: '6px',
  boxSizing: 'border-box',
};

const btnStyle = {
  width: '28px',
  height: '28px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'var(--border-style)',
  borderRadius: '10px',
  background: 'var(--white)',
  color: 'var(--muted)',
  cursor: 'pointer',
  padding: 0,
  transition: 'color 0.12s, background 0.12s',
};

/**
 * State for a filter pop-out anchored to a card. Returns refs for the card
 * and the button, `open`, `toggle`, `close`, and `render(children)` which
 * portals the pop-out (null while closed).
 */
export function useFilterPopover() {
  const cardRef = useRef(null);
  const buttonRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null); // { left, top, maxHeight } while open
  const open = !!pos;

  function toggle() {
    if (open) { setPos(null); return; }
    const card = cardRef.current?.getBoundingClientRect();
    const btn = buttonRef.current?.getBoundingClientRect();
    if (!card || !btn) return;
    const left = Math.min(card.right + 8, window.innerWidth - POPOVER_WIDTH - 8);
    setPos({ left, top: btn.top, maxHeight: window.innerHeight - btn.top - 16 });
  }
  const close = () => setPos(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      setPos(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setPos(null); };
    const onResize = () => setPos(null);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const render = (children, label) => (open ? createPortal(
    <div ref={popRef} role="dialog" aria-label={label} style={{ ...popoverStyle, left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}>
      {children}
    </div>,
    document.body,
  ) : null);

  return { cardRef, buttonRef, open, toggle, close, render };
}

/** The funnel button. Dark while a filter is on. */
export function FilterButton({ popover, active, label, tourId }) {
  return (
    <button
      ref={popover.buttonRef}
      data-tour-id={tourId}
      onClick={popover.toggle}
      title={label}
      aria-label={label}
      aria-expanded={popover.open}
      style={{
        ...btnStyle,
        ...(active ? { background: 'var(--strong)', color: 'var(--white)', border: '1px solid var(--strong)' }
          : popover.open ? { background: 'var(--panel-bg)', color: 'var(--strong)' } : {}),
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" />
      </svg>
    </button>
  );
}
