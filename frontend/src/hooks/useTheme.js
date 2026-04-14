import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'liminal_theme';

function readStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {}
  return 'light';
}

function applyTheme(theme) {
  const el = document.documentElement;
  if (theme === 'dark') el.setAttribute('data-theme', 'dark');
  else el.removeAttribute('data-theme');
}

// Apply before React mounts to avoid a flash.
applyTheme(readStoredTheme());

export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
    window.dispatchEvent(new CustomEvent('liminal:theme-changed', { detail: theme }));
  }, [theme]);

  useEffect(() => {
    function onChange(e) {
      const next = e.detail;
      if (next === 'dark' || next === 'light') setThemeState(next);
    }
    window.addEventListener('liminal:theme-changed', onChange);
    return () => window.removeEventListener('liminal:theme-changed', onChange);
  }, []);

  const setTheme = useCallback((t) => setThemeState(t === 'dark' ? 'dark' : 'light'), []);
  const toggle = useCallback(() => setThemeState(prev => prev === 'dark' ? 'light' : 'dark'), []);

  return { theme, setTheme, toggle };
}
