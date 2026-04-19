// Curated font catalogue shared by the two Appearance pickers (body font +
// heading font). Each entry except `system` corresponds to a Google Fonts
// family. The body picker rewrites `--font`; the heading picker rewrites
// `--font-display`.

export const FONTS = [
  {
    id: 'cormorant',
    label: 'Cormorant Garamond',
    family: "'Cormorant Garamond', 'Georgia', 'Times New Roman', serif",
    googleParam: 'Cormorant+Garamond:wght@400;500;600;700',
  },
  {
    id: 'segoe-ui',
    label: 'Segoe UI',
    family: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'",
    googleParam: null,
  },
  {
    id: 'roboto',
    label: 'Roboto',
    family: "'Roboto', -apple-system, 'Segoe UI', sans-serif",
    googleParam: 'Roboto:wght@400;500;700',
  },
  {
    id: 'inter',
    label: 'Inter',
    family: "'Inter', system-ui, sans-serif",
    googleParam: 'Inter:wght@400;500;600;700',
  },
  {
    id: 'ibm-plex',
    label: 'IBM Plex Sans',
    family: "'IBM Plex Sans', system-ui, sans-serif",
    googleParam: 'IBM+Plex+Sans:wght@400;500;600;700',
  },
  {
    id: 'lora',
    label: 'Lora',
    family: "'Lora', Georgia, serif",
    googleParam: 'Lora:wght@400;500;600;700',
  },
  {
    id: 'source-serif',
    label: 'Source Serif',
    family: "'Source Serif 4', Georgia, serif",
    googleParam: 'Source+Serif+4:wght@400;500;600;700',
  },
  {
    id: 'crimson',
    label: 'Crimson Pro',
    family: "'Crimson Pro', Georgia, serif",
    googleParam: 'Crimson+Pro:wght@400;500;600;700',
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    family: "'Work Sans', system-ui, sans-serif",
    googleParam: 'Work+Sans:wght@400;500;600;700',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    family: "'Space Grotesk', system-ui, sans-serif",
    googleParam: 'Space+Grotesk:wght@400;500;600;700',
  },
];

export const DEFAULT_FONT_ID = 'segoe-ui';
export const DEFAULT_HEADING_FONT_ID = 'cormorant';

export function getFont(id) {
  return FONTS.find((f) => f.id === id) || FONTS.find((f) => f.id === DEFAULT_FONT_ID);
}

// Idempotently inject the Google Fonts <link> for a given font id.
// No-op for `system` and for fonts whose link already exists in <head>
// (Cormorant Garamond is preloaded statically by index.html).
export function loadGoogleFont(id) {
  const font = getFont(id);
  if (!font || !font.googleParam) return;
  const linkId = `liminal-font-${font.id}`;
  if (document.getElementById(linkId)) return;
  // Cormorant is already in index.html under a different id — skip.
  if (font.id === 'cormorant' && document.querySelector('link[href*="Cormorant+Garamond"]')) return;

  const link = document.createElement('link');
  link.id = linkId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.googleParam}&display=swap`;
  document.head.appendChild(link);
}
