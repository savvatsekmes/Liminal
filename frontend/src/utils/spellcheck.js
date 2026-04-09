// Renderer-side spell check.
//
// Why this exists: Electron's main-process `webContents.on('context-menu')`
// event — which normally exposes `misspelledWord` and `dictionarySuggestions`
// — never fires in our packaged build (we tried attaching at every lifecycle
// hook, no luck). So we run our own Hunspell-based spellchecker in the
// renderer using `nspell` + `dictionary-en`. The dictionary is lazy-loaded
// the first time `getSpellChecker()` is called so we don't pay the ~600KB
// cost on initial app load.

import nspell from 'nspell';
// Vite asset imports: ?url gives us a static URL to fetch at runtime.
// This keeps the Hunspell .aff/.dic out of the main JS bundle.
import affUrl from '../../node_modules/dictionary-en/index.aff?url';
import dicUrl from '../../node_modules/dictionary-en/index.dic?url';

let spellPromise = null;
const userDictionary = new Set();

export function getSpellChecker() {
  if (spellPromise) return spellPromise;
  spellPromise = (async () => {
    const [affRes, dicRes] = await Promise.all([fetch(affUrl), fetch(dicUrl)]);
    const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);
    const spell = nspell({ aff, dic });
    // Replay any words the user added before the dict finished loading.
    for (const w of userDictionary) spell.add(w);
    return spell;
  })();
  return spellPromise;
}

// Synchronous-feeling check: returns null if dict not yet loaded (callers
// should treat that as "no opinion"); returns true/false once ready.
let cachedSpell = null;
getSpellChecker().then((s) => { cachedSpell = s; }).catch(() => {});

export function checkWord(word) {
  if (!cachedSpell || !word) return null;
  if (userDictionary.has(word.toLowerCase())) return true;
  return cachedSpell.correct(word);
}

export function suggestWords(word, max = 5) {
  if (!cachedSpell || !word) return [];
  return cachedSpell.suggest(word).slice(0, max);
}

export function addToUserDictionary(word) {
  if (!word) return;
  userDictionary.add(word.toLowerCase());
  if (cachedSpell) cachedSpell.add(word);
}

// Find the word at a given (clientX, clientY) point. Returns
// { word, range, target } or null. The range covers exactly the word so
// callers can replace it via Range APIs (works for both contenteditable
// and plain text). For inputs/textareas there's no Range, so we return
// { word, inputStart, inputEnd, target }.
export function wordAtPoint(x, y) {
  // 1. Plain inputs / textareas — no caretRangeFromPoint support; we read
  //    the value and bisect by selectionStart at the time of right-click.
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    // We don't get a caret position from a point in inputs reliably across
    // browsers; the most useful thing is the current selection or the
    // currently-focused word. Skip — inputs don't show spell underlines
    // for most of our editable surfaces anyway (TipTap is contenteditable).
    return null;
  }

  // 2. Contenteditable / regular text — use caretPositionFromPoint
  //    (Firefox) or caretRangeFromPoint (WebKit/Chromium).
  let node = null;
  let offset = 0;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) { node = pos.offsetNode; offset = pos.offset; }
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) { node = r.startContainer; offset = r.startOffset; }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.nodeValue || '';
  if (!text) return null;

  // Expand left and right to word boundaries. We treat letters,
  // apostrophes, and hyphens as part of a word.
  const isWordChar = (ch) => /[\p{L}'-]/u.test(ch);
  let start = offset;
  let end = offset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;
  if (start === end) return null;

  const raw = text.slice(start, end);
  // Strip leading/trailing apostrophes/hyphens that aren't really part of
  // the word (e.g. trailing 's after a contraction-less word).
  const leadingTrim = (raw.match(/^['-]*/) || [''])[0].length;
  const trailingTrim = (raw.match(/['-]*$/) || [''])[0].length;
  const wordStart = start + leadingTrim;
  const wordEnd = end - trailingTrim;
  if (wordEnd <= wordStart) return null;
  const trimmed = text.slice(wordStart, wordEnd);
  if (trimmed.length < 2) return null;

  const range = document.createRange();
  range.setStart(node, wordStart);
  range.setEnd(node, wordEnd);

  return { word: trimmed, range, target: el };
}

// Replace the word in the given range with `replacement`. Works for any
// contenteditable / text node. Dispatches an `input` event so TipTap and
// React's controlled inputs notice the change.
export function replaceWordInRange(range, replacement) {
  if (!range) return;
  range.deleteContents();
  range.insertNode(document.createTextNode(replacement));
  // Collapse the selection to the end of the inserted word.
  const sel = window.getSelection();
  sel.removeAllRanges();
  const after = document.createRange();
  after.setStart(range.endContainer, range.endOffset);
  after.collapse(true);
  sel.addRange(after);
  // Notify any framework listening for input.
  const editable = range.startContainer.parentElement?.closest('[contenteditable], input, textarea');
  if (editable) {
    editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: replacement }));
  }
}
