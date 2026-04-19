import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';
import {
  DEFAULT_FONT_ID,
  DEFAULT_HEADING_FONT_ID,
  getFont,
  loadGoogleFont,
} from '../utils/fontCatalog';

const EVENT = 'liminal:font-changed';
const EVENT_HEADING = 'liminal:font-heading-changed';

// Pre-mount defaults so the login screen + first paint already get the right
// attributes applied (per-font CSS tweaks in global.css hook on these).
if (typeof document !== 'undefined') {
  if (!document.documentElement.hasAttribute('data-font')) {
    document.documentElement.setAttribute('data-font', DEFAULT_FONT_ID);
  }
  if (!document.documentElement.hasAttribute('data-font-heading')) {
    document.documentElement.setAttribute('data-font-heading', DEFAULT_HEADING_FONT_ID);
  }
}

function applyBodyFont(id) {
  const font = getFont(id);
  loadGoogleFont(font.id);
  document.documentElement.style.setProperty('--font', font.family);
  document.documentElement.setAttribute('data-font', font.id);
}

function applyHeadingFont(id) {
  const font = getFont(id);
  loadGoogleFont(font.id);
  document.documentElement.style.setProperty('--font-display', font.family);
  document.documentElement.setAttribute('data-font-heading', font.id);
}

export function useFont() {
  const [fontId, setFontIdState] = useState(DEFAULT_FONT_ID);
  const [headingFontId, setHeadingFontIdState] = useState(DEFAULT_HEADING_FONT_ID);

  // Load saved choices from backend on mount; apply optimistically.
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/settings')
      .then((r) => r.json())
      .then((all) => {
        if (cancelled) return;
        const savedBody = all && typeof all.font === 'string' ? all.font : DEFAULT_FONT_ID;
        const savedHeading = all && typeof all.fontHeading === 'string' ? all.fontHeading : DEFAULT_HEADING_FONT_ID;
        const body = getFont(savedBody);
        const heading = getFont(savedHeading);
        setFontIdState(body.id);
        setHeadingFontIdState(heading.id);
        applyBodyFont(body.id);
        applyHeadingFont(heading.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Cross-component sync.
  useEffect(() => {
    const onBody = (e) => { if (typeof e.detail === 'string') setFontIdState(e.detail); };
    const onHeading = (e) => { if (typeof e.detail === 'string') setHeadingFontIdState(e.detail); };
    window.addEventListener(EVENT, onBody);
    window.addEventListener(EVENT_HEADING, onHeading);
    return () => {
      window.removeEventListener(EVENT, onBody);
      window.removeEventListener(EVENT_HEADING, onHeading);
    };
  }, []);

  const setFont = useCallback(async (id) => {
    const font = getFont(id);
    setFontIdState(font.id);
    applyBodyFont(font.id);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: font.id }));
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ font: font.id }),
      });
    } catch {}
  }, []);

  const setHeadingFont = useCallback(async (id) => {
    const font = getFont(id);
    setHeadingFontIdState(font.id);
    applyHeadingFont(font.id);
    window.dispatchEvent(new CustomEvent(EVENT_HEADING, { detail: font.id }));
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fontHeading: font.id }),
      });
    } catch {}
  }, []);

  return { fontId, setFont, headingFontId, setHeadingFont };
}
