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
    await loadLang(code);
    // Persist to backend
    apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    }).catch(() => {});
  }, []);

  // Load initial language if not English
  useEffect(() => {
    if (initialLang !== 'en') loadLang(initialLang);
  }, []);

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
