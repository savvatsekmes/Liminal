// UI zoom factor — uses Electron's webContents.setZoomFactor (the same path
// Chrome's Ctrl+/- uses), which reflows the layout correctly. The earlier
// CSS-zoom approach scaled visually but didn't reflow, causing the widget
// edges to clip at large levels.
//
// Stored as a string in localStorage so the value is available synchronously
// at boot, before any /api/settings round-trip resolves. Mirrored to the
// backend `ui_font_scale` setting so the choice survives a fresh install +
// restore. Pattern matches dictate_mic / whisper_model — localStorage is the
// read-side cache, /api/settings is the source of truth.

const KEY = 'liminal_font_scale';

// Chrome's standard zoom levels. Display labels match the browser so users
// don't have to translate between two scales.
export const FONT_SCALE_OPTIONS = [
  { value: '0.5',  label: '50%' },
  { value: '0.67', label: '67%' },
  { value: '0.75', label: '75%' },
  { value: '0.8',  label: '80%' },
  { value: '0.9',  label: '90%' },
  { value: '1',    label: '100%' },
  { value: '1.1',  label: '110%' },
  { value: '1.25', label: '125%' },
  { value: '1.5',  label: '150%' },
  { value: '1.75', label: '175%' },
  { value: '2',    label: '200%' },
];

const LEVELS = FONT_SCALE_OPTIONS.map((o) => parseFloat(o.value));

export function getFontScale() {
  try {
    const v = localStorage.getItem(KEY);
    if (v && !isNaN(parseFloat(v))) return v;
  } catch {}
  return '1';
}

export function applyFontScale(value) {
  const v = parseFloat(value);
  if (!v || isNaN(v)) return;
  // Prefer Electron's IPC (proper layout reflow). Fallback to CSS zoom for
  // browser / non-Electron contexts (LAN / mobile users).
  if (window.liminal?.setZoomFactor) {
    window.liminal.setZoomFactor(v);
  } else {
    document.documentElement.style.zoom = v;
  }
}

export function setFontScale(value) {
  try { localStorage.setItem(KEY, String(value)); } catch {}
  applyFontScale(value);
}

// Snap an arbitrary factor to the nearest preset, biased in `direction`.
// direction = +1 → next-higher level, -1 → next-lower, 0 → reset to 100%.
function snapToPreset(current, direction) {
  if (direction === 0) return 1;
  // Find current's index against the preset list.
  let idx = LEVELS.findIndex((v) => Math.abs(v - current) < 0.001);
  if (idx === -1) {
    // Not on a preset — pick the closest, then step from there.
    idx = LEVELS.reduce((best, v, i) =>
      Math.abs(v - current) < Math.abs(LEVELS[best] - current) ? i : best, 0);
  }
  const next = Math.max(0, Math.min(LEVELS.length - 1, idx + direction));
  return LEVELS[next];
}

// Wire Ctrl+= / Ctrl+- / Ctrl+0 (and Cmd on Mac) to step through presets.
// Mirrors Chrome's behaviour: Ctrl++ zooms in, Ctrl+- zooms out, Ctrl+0 resets.
// Returns an unsubscribe function.
export function installZoomShortcuts(onChange) {
  function handler(e) {
    const cmd = e.ctrlKey || e.metaKey;
    if (!cmd) return;
    let dir = null;
    // '=' is the shifted '+'. Plenty of layouts also map NumpadAdd / NumpadSubtract.
    if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') dir = 1;
    else if (e.key === '-' || e.code === 'NumpadSubtract') dir = -1;
    else if (e.key === '0' || e.code === 'Numpad0') dir = 0;
    else return;
    e.preventDefault();
    const current = parseFloat(getFontScale()) || 1;
    const next = snapToPreset(current, dir);
    setFontScale(String(next));
    if (onChange) onChange(String(next));
  }
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
