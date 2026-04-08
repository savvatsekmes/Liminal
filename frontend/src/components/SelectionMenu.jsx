import { useState, useEffect, useRef, useCallback } from 'react';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';

// Global right-click selection menu — mounted once at the app root.
//
// Shows {Read aloud · Copy · Paste} when the user right-clicks on selected
// text anywhere in the app. Pages that already render their own selection
// popup (Journal / Notes editors and the Mirror reading panel) opt out by
// wrapping their region in an element with `data-page-context-menu`, so the
// global menu skips events that originate inside those regions.

export default function SelectionMenu() {
  const [popup, setPopup] = useState(null); // { x, y, text, hasSelection, below }
  const audioRef = useRef(null);
  const cancelRef = useRef(false);
  const menuRef = useRef(null);

  const dismiss = useCallback(() => {
    setPopup(null);
    if (audioRef.current) stopSpeak(audioRef, cancelRef);
  }, []);

  useEffect(() => {
    function onContextMenu(e) {
      // Skip regions that have their own popup
      if (e.target.closest && e.target.closest('[data-page-context-menu]')) {
        setPopup(null);
        return;
      }
      // Skip native form controls — let the OS handle them
      const tag = (e.target.tagName || '').toLowerCase();
      const editable = e.target.isContentEditable;
      // Show on text selection OR on inputs/textareas (so paste is reachable)
      const sel = window.getSelection();
      const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
      const isInput = tag === 'input' || tag === 'textarea' || editable;
      if (!text && !isInput) {
        setPopup(null);
        return;
      }
      e.preventDefault();
      setPopup({
        x: e.clientX,
        y: e.clientY,
        text,
        hasSelection: !!text,
        isInput,
        target: e.target,
      });
    }
    function onMouseDown(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setPopup(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [dismiss]);

  if (!popup) return null;

  async function handleCopy() {
    if (!popup.hasSelection) return;
    try { await navigator.clipboard.writeText(popup.text); } catch {}
    setPopup(null);
  }

  async function handlePaste() {
    const target = popup.target;
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch {}
    if (!text) { setPopup(null); return; }
    const tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const next = target.value.slice(0, start) + text + target.value.slice(end);
      // Use the native setter so React picks up the change
      const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(target, next);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      const caret = start + text.length;
      try { target.setSelectionRange(caret, caret); } catch {}
    } else if (target.isContentEditable) {
      target.focus();
      try { document.execCommand('insertText', false, text); } catch {}
    }
    setPopup(null);
  }

  function handleRead() {
    if (!popup.hasSelection) return;
    cancelRef.current = false;
    streamSpeak(popup.text, audioRef, cancelRef);
    setPopup(null);
  }

  const pillStyle = {
    color: 'var(--body)',
    fontSize: '11px',
    fontWeight: 500,
    borderRadius: '16px',
    padding: '5px 12px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background 0.12s',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    userSelect: 'none',
  };
  const disabledStyle = { opacity: 0.35, cursor: 'default' };
  const divider = <div style={{ width: '1px', height: '16px', background: 'var(--border)', flexShrink: 0 }} />;

  // Anchor at the cursor, slightly to the right and down so it sits next
  // to the click point (matches where the native context menu used to open).
  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${popup.x + 4}px`,
        top: `${popup.y + 4}px`,
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        zIndex: 10000,
        background: 'var(--white)',
        borderRadius: '20px',
        padding: '3px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        style={{ ...pillStyle, ...(popup.hasSelection ? {} : disabledStyle) }}
        onClick={popup.hasSelection ? handleRead : undefined}
        onMouseEnter={(e) => { if (popup.hasSelection) e.currentTarget.style.background = 'var(--near-white)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <WaveformIcon /> Read aloud
      </div>
      {divider}
      <div
        style={{ ...pillStyle, ...(popup.hasSelection ? {} : disabledStyle) }}
        onClick={popup.hasSelection ? handleCopy : undefined}
        onMouseEnter={(e) => { if (popup.hasSelection) e.currentTarget.style.background = 'var(--near-white)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        Copy
      </div>
      {popup.isInput && (
        <>
          {divider}
          <div
            style={pillStyle}
            onClick={handlePaste}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--near-white)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Paste
          </div>
        </>
      )}
    </div>
  );
}

function WaveformIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="4" width="2" height="6" rx="1" fill="currentColor" />
      <rect x="4.5" y="2" width="2" height="10" rx="1" fill="currentColor" />
      <rect x="8" y="4" width="2" height="6" rx="1" fill="currentColor" />
      <rect x="11.5" y="3" width="2" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}
