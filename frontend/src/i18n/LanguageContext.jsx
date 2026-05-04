import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import en from './en';

const translations = { en };

// Lazy-load other languages
const loaders = {
  el: () => import('./el'),
  es: () => import('./es'),
  fr: () => import('./fr'),
  de: () => import('./de'),
  pt: () => import('./pt'),
  it: () => import('./it'),
  ja: () => import('./ja'),
  zh: () => import('./zh'),
  ko: () => import('./ko'),
  ru: () => import('./ru'),
  ar: () => import('./ar'),
  tr: () => import('./tr'),
  nl: () => import('./nl'),
  sv: () => import('./sv'),
  pl: () => import('./pl'),
};

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'el', label: 'Greek' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'tr', label: 'Turkish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'pl', label: 'Polish' },
];

const LanguageContext = createContext();

export function LanguageProvider({ children, initialLang = 'en' }) {
  const [lang, setLangState] = useState(initialLang);
  const [strings, setStrings] = useState(translations[initialLang] || en);

  async function loadLang(code) {
    if (translations[code]) {
      setStrings(translations[code]);
      return;
    }
    if (loaders[code]) {
      try {
        const mod = await loaders[code]();
        translations[code] = mod.default;
        setStrings(mod.default);
      } catch {
        setStrings(en);
      }
    }
  }

  const setLanguage = useCallback(async (code) => {
    setLangState(code);
    try { localStorage.setItem('lang', code); } catch {}
    await loadLang(code);
    // Persist to backend
    apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    }).catch(() => {});
    // Pre-warm the TTS model for this language under the standard loading
    // toast so the user sees feedback during the swap and is ready for the
    // next read-aloud without delay. Spawn Chatterbox first if it isn't
    // already running — without this, the popup only appeared when the
    // model happened to be warm, which felt inconsistent.
    try {
      const { withLoadingToast, waitForChatterbox } = await import('../utils/ttsStatus');
      withLoadingToast(async () => {
        const ok = await waitForChatterbox(45000);
        if (!ok) return;
        await apiFetch('/api/tts/preload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: code }),
        });
      }).catch(() => {});
    } catch {}
  }, []);

  // React to initialLang changes from the parent — App.jsx fetches the saved
  // language from /api/settings asynchronously after mount, so this prop
  // arrives later than the first render. Without this effect, useState(initialLang)
  // captures only the first value and the UI stays in English forever.
  useEffect(() => {
    setLangState(initialLang);
    try { localStorage.setItem('lang', initialLang); } catch {}
    if (initialLang !== 'en') loadLang(initialLang);
    else setStrings(en);
  }, [initialLang]);

  const t = useCallback((key, replacements) => {
    let str = strings[key] || en[key] || key;
    if (replacements) {
      for (const [k, v] of Object.entries(replacements)) {
        str = str.replaceAll(`{${k}}`, v);
      }
    }
    return str;
  }, [strings]);

  return (
    <LanguageContext.Provider value={{ lang, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
