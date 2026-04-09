import { useState, useEffect, useRef, useCallback } from 'react';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';
import { apiFetch } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';
import { checkWord, suggestWords, addToUserDictionary, wordAtPoint, replaceWordInRange } from '../utils/spellcheck';

// Global vertical right-click menu — mounted once at the app root.
//
// One menu, everywhere in Liminal. Items shown depend on context:
//   - Spell suggestions + "Add to dictionary"   (when right-clicking a misspelled word)
//   - Read aloud · Save to memory · Save to journal   (when there is selected text)
//   - Cut · Copy · Paste · Select all            (clipboard ops, on inputs/contenteditables)
//
// The native Electron `context-menu` event is fired in the main process and
// forwarded over IPC via window.liminal.onContextMenu (see electron/preload.js).
// We always preventDefault on the renderer-side `contextmenu` event so the
// browser never opens its own menu — only ours appears.

export default function SelectionMenu() {
  const { t } = useLanguage();
  const [popup, setPopup] = useState(null);
  const audioRef = useRef(null);
  const cancelRef = useRef(false);
  const menuRef = useRef(null);
  const targetRef = useRef(null);
  // The word + DOM range we'd replace if the user picks a spell suggestion.
  // Stored in a ref (not state) because the popup state already triggers a
  // render and we don't want React to track a Range across renders.
  const spellRangeRef = useRef(null);
  const [savedToMemory, setSavedToMemory] = useState(false);
  const [savedToJournal, setSavedToJournal] = useState(false);

  const dismiss = useCallback(() => {
    setPopup(null);
    setSavedToMemory(false);
    setSavedToJournal(false);
    if (audioRef.current) stopSpeak(audioRef, cancelRef);
  }, []);

  // Track the right-click target so we know where to paste/replace.
  useEffect(() => {
    function onPointerDown(e) {
      if (e.button === 2) targetRef.current = e.target;
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  // Show the menu directly from the renderer's `contextmenu` event.
  //
  // We used to wait for Electron's main-process `webContents.on('context-menu')`
  // event (forwarded via window.liminal.onContextMenu) so we could pull
  // spell-check suggestions out of the native params, but that event was
  // unreliable in our packaged build — it never fired even though the renderer
  // subscribed. Driving the menu straight from the DOM event is rock-solid:
  // we get position from MouseEvent.clientX/Y and selection from
  // window.getSelection(). Spell suggestions are dropped (Electron's
  // suggestions only live on the main-process params); everything else
  // (read aloud, save to memory/journal, clipboard ops) works the same.
  useEffect(() => {
    function onContextMenu(e) {
      e.preventDefault();
      const target = e.target;
      targetRef.current = target;
      const tag = (target?.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      // Pull selection text. For inputs/textareas, window.getSelection() is
      // empty — read it from the element directly.
      let selectionText = '';
      if (tag === 'input' || tag === 'textarea') {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        if (start != null && end != null && end > start) {
          selectionText = target.value.slice(start, end);
        }
      } else {
        selectionText = (window.getSelection()?.toString() || '');
      }
      setSavedToMemory(false);
      setSavedToJournal(false);

      // Detect a misspelled word at the click point. Only do this when there's
      // no selection (a selection means the user wants to act on the highlighted
      // text, not a single word under the cursor). The dictionary is lazy
      // loaded; if it's not ready yet, checkWord returns null and we just
      // skip — the menu still opens, just without spell suggestions.
      let misspelled = '';
      let suggestions = [];
      spellRangeRef.current = null;
      if (!selectionText.trim()) {
        const hit = wordAtPoint(e.clientX, e.clientY);
        if (hit && checkWord(hit.word) === false) {
          misspelled = hit.word;
          suggestions = suggestWords(hit.word, 5);
          spellRangeRef.current = hit.range;
        }
      }

      setPopup({
        x: e.clientX,
        y: e.clientY,
        selection: selectionText,
        misspelled,
        suggestions,
        isInput,
      });
    }
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  // ALSO subscribe to the main-process context-menu event. The DOM event
  // above already opened the popup; if the IPC arrives shortly after with
  // spell-check info (misspelledWord + dictionarySuggestions, which only
  // exist in Electron's main-process params), we merge it into the open
  // popup so spell suggestions appear inline. If the IPC never arrives
  // (e.g. running in a normal browser tab) the menu still works fine.
  useEffect(() => {
    if (!window.liminal?.onContextMenu) return;
    const off = window.liminal.onContextMenu((data) => {
      if (!data.misspelledWord) return;
      setPopup((prev) => prev ? {
        ...prev,
        misspelled: data.misspelledWord,
        suggestions: data.dictionarySuggestions || [],
      } : prev);
    });
    return off;
  }, []);

  // Dismiss on outside click or Escape.
  useEffect(() => {
    if (!popup) return;
    function onMouseDown(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      dismiss();
    }
    function onKey(e) { if (e.key === 'Escape') dismiss(); }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popup, dismiss]);

  if (!popup) return null;

  const hasSelection = !!popup.selection.trim();

  // ── Actions ────────────────────────────────────────────────────────────
  function handleReplaceMisspelling(word) {
    // Replace via the saved Range (works in any contenteditable / text node).
    // Falls back to Electron's main-process replaceMisspelling for inputs/
    // textareas where we don't capture a Range.
    if (spellRangeRef.current) {
      replaceWordInRange(spellRangeRef.current, word);
    } else if (window.liminal?.replaceMisspelling) {
      window.liminal.replaceMisspelling(word);
    }
    spellRangeRef.current = null;
    setPopup(null);
  }
  function handleAddToDictionary() {
    addToUserDictionary(popup.misspelled);
    if (window.liminal?.addToDictionary) window.liminal.addToDictionary(popup.misspelled);
    setPopup(null);
  }
  function handleReadAloud() {
    if (!hasSelection) return;
    cancelRef.current = false;
    streamSpeak(popup.selection, audioRef, cancelRef);
    setPopup(null);
  }
  async function handleCopy() {
    if (!hasSelection) return;
    try { await navigator.clipboard.writeText(popup.selection); } catch {}
    setPopup(null);
  }
  async function handleCut() {
    if (!hasSelection) return;
    try { await navigator.clipboard.writeText(popup.selection); } catch {}
    document.execCommand('cut');
    setPopup(null);
  }
  async function handlePaste() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch {}
    if (!text) { setPopup(null); return; }
    const target = targetRef.current;
    if (!target) { setPopup(null); return; }
    const tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const next = target.value.slice(0, start) + text + target.value.slice(end);
      const proto = tag === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(target, next);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      try { target.setSelectionRange(start + text.length, start + text.length); } catch {}
    } else if (target.isContentEditable) {
      target.focus();
      try { document.execCommand('insertText', false, text); } catch {}
    }
    setPopup(null);
  }
  function handleSelectAll() {
    const target = targetRef.current;
    if (!target) { setPopup(null); return; }
    const tag = (target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      try { target.select(); } catch {}
    } else if (target.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // Plain text — select the closest block
      const block = target.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre');
      if (block) {
        const range = document.createRange();
        range.selectNodeContents(block);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    setPopup(null);
  }
  async function handleSaveToMemory() {
    if (!hasSelection) return;
    try {
      const res = await apiFetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: popup.selection }),
      });
      if (!res.ok) throw new Error('save failed');
      // Tell the memories page (and anything else listening) to refetch.
      window.dispatchEvent(new CustomEvent('liminal:memories-changed'));
      setSavedToMemory(true);
      setTimeout(() => setPopup(null), 900);
    } catch {
      setPopup(null);
    }
  }
  async function handleSaveToJournal() {
    if (!hasSelection) return;
    const text = popup.selection;
    const today = new Date().toISOString().slice(0, 10);
    const title = today + ' — ' + text.slice(0, 60).replace(/\n/g, ' ');
    const body = '<p>' + text.split('\n\n').map(p => p.replace(/\n/g, '<br>')).join('</p><p>') + '</p>';
    try {
      const res = await apiFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, body_text: text, date: today }),
      });
      if (!res.ok) throw new Error('save failed');
      // useEntries listens for this and refetches so the new entry shows
      // up in the journal list immediately.
      window.dispatchEvent(new CustomEvent('liminal:entries-changed'));
      setSavedToJournal(true);
      setTimeout(() => setPopup(null), 900);
    } catch {
      setPopup(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  // Position: open at click point, but flip up/left if we'd run off-screen.
  const MENU_W = 220;
  const ESTIMATED_H = 320;
  const x = Math.min(popup.x + 2, window.innerWidth - MENU_W - 8);
  const y = popup.y + ESTIMATED_H > window.innerHeight
    ? Math.max(8, popup.y - ESTIMATED_H)
    : popup.y + 2;

  const items = [];

  // Spell-check suggestions
  if (popup.misspelled) {
    if (popup.suggestions.length === 0) {
      items.push(<MenuLabel key="no-sug" label={t('common.noSuggestions')} disabled />);
    } else {
      popup.suggestions.forEach((word, i) => {
        items.push(
          <MenuItem
            key={'sug-' + i}
            label={word}
            onClick={() => handleReplaceMisspelling(word)}
            bold
          />
        );
      });
    }
    items.push(
      <MenuItem
        key="add-dict"
        label={t('common.addToDictionary')}
        onClick={handleAddToDictionary}
      />
    );
    items.push(<Separator key="sep-spell" />);
  }

  // Selection-driven actions
  if (hasSelection) {
    items.push(
      <MenuItem
        key="read"
        icon={<WaveformIcon />}
        label={t('common.readAloud')}
        onClick={handleReadAloud}
      />
    );
    items.push(
      <MenuItem
        key="memory"
        icon={savedToMemory ? null : <PlusIcon />}
        label={savedToMemory ? '✓ ' + t('common.savedToMemory') : t('common.saveToMemory')}
        onClick={handleSaveToMemory}
        disabled={savedToMemory}
      />
    );
    items.push(
      <MenuItem
        key="journal"
        icon={savedToJournal ? null : <PlusIcon />}
        label={savedToJournal ? '✓ ' + t('common.savedToJournal') : t('common.saveToJournal')}
        onClick={handleSaveToJournal}
        disabled={savedToJournal}
      />
    );
    items.push(<Separator key="sep-sel" />);
  }

  // Clipboard ops — always present, but cut/copy require selection,
  // paste requires an editable target.
  if (popup.isInput) {
    items.push(<MenuItem key="cut" label={t('common.cut')} onClick={handleCut} disabled={!hasSelection} />);
  }
  items.push(<MenuItem key="copy" label={t('common.copy')} onClick={handleCopy} disabled={!hasSelection} />);
  if (popup.isInput) {
    items.push(<MenuItem key="paste" label={t('common.paste')} onClick={handlePaste} />);
  }
  items.push(<Separator key="sep-end" />);
  items.push(<MenuItem key="all" label={t('common.selectAll')} onClick={handleSelectAll} />);

  return (
    <div
      ref={menuRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: x + 'px',
        top: y + 'px',
        minWidth: MENU_W + 'px',
        background: 'var(--white)',
        borderRadius: '10px',
        padding: '6px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)',
        zIndex: 10000,
        fontFamily: 'var(--font)',
        userSelect: 'none',
      }}
    >
      {items}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function MenuItem({ icon, label, onClick, disabled, bold }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 12px',
        fontSize: '12px',
        fontWeight: bold ? 600 : 500,
        color: disabled ? 'var(--muted)' : 'var(--body)',
        borderRadius: '6px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--near-white)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function MenuLabel({ label, disabled }) {
  return (
    <div style={{
      padding: '7px 12px',
      fontSize: '12px',
      fontStyle: 'italic',
      color: 'var(--muted)',
      opacity: disabled ? 0.55 : 1,
    }}>{label}</div>
  );
}

function Separator() {
  return <div style={{ height: '1px', background: 'var(--border)', margin: '4px 6px' }} />;
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="7" y1="2" x2="7" y2="12" />
      <line x1="2" y1="7" x2="12" y2="7" />
    </svg>
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
