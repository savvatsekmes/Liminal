import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';

// Captured items — the final section under a reflection. The backend scrapes
// goals / gratitudes / dreams / books / affirmations from the entry; each item
// the user accepts becomes a note tagged with the matching category, which then
// surfaces in the corresponding home-screen widget.
//
// Category key (matches backend extractService) → { tag filed on the note,
// display label key, emoji }.
const CATEGORY_META = {
  goals:        { tag: 'goal',        labelKey: 'captured.goals',        addKey: 'captured.addToGoals',        addFallback: 'Add to Goals',        emoji: '🎯' },
  gratitudes:   { tag: 'gratitude',   labelKey: 'captured.gratitudes',   addKey: 'captured.addToGratitudes',   addFallback: 'Add to Gratitude',    emoji: '🙏' },
  dreams:       { tag: 'dream',       labelKey: 'captured.dreams',       addKey: 'captured.addToDreams',       addFallback: 'Add to Dreams',       emoji: '🌙' },
  books:        { tag: 'reading',     labelKey: 'captured.books',        addKey: 'captured.addToBooks',        addFallback: 'Add to Reading',      emoji: '📚' },
  affirmations: { tag: 'affirmation', labelKey: 'captured.affirmations', addKey: 'captured.addToAffirmations', addFallback: 'Add to Affirmations', emoji: '✨' },
  // Filed as a native `quote` note (not `idea`) so it renders with quotation
  // marks and an attribution line like a hand-made quote note.
  quotes:       { tag: 'quote',       labelKey: 'captured.quotes',       addKey: 'captured.addToQuotes',       addFallback: 'Add to Quotes',       emoji: '❝', noteType: 'quote' },
};
const ORDER = ['goals', 'gratitudes', 'dreams', 'books', 'affirmations', 'quotes'];

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function CapturedItems({ items }) {
  const { t } = useLanguage();
  // Per-item add state, keyed "category:index" → 'idle' | 'saving' | 'done'.
  const [state, setState] = useState({});
  const [collapsed, setCollapsed] = useState(false);

  // On load, mark items that already exist as notes (filed in a prior session,
  // or manually) so they show "Added" and can't be duplicated.
  useEffect(() => {
    if (!items) return;
    const flat = [];
    for (const cat of ORDER) {
      (items[cat] || []).forEach((text, idx) => {
        flat.push({ key: `${cat}:${idx}`, tag: CATEGORY_META[cat].tag, text });
      });
    }
    if (!flat.length) return;
    let cancelled = false;
    apiFetch('/api/notes/captured-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: flat.map((f) => ({ tag: f.tag, text: f.text })) }),
    })
      .then((r) => r.json())
      .then(({ results }) => {
        if (cancelled || !Array.isArray(results)) return;
        setState((prev) => {
          const next = { ...prev };
          flat.forEach((f, i) => { if (results[i] && next[f.key] !== 'done') next[f.key] = 'done'; });
          return next;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [items]);

  if (!items) return null;
  const groups = ORDER.filter((cat) => Array.isArray(items[cat]) && items[cat].length);
  if (!groups.length) return null;

  async function addItem(cat, idx, text) {
    const key = `${cat}:${idx}`;
    if (state[key] === 'saving' || state[key] === 'done') return;
    setState((p) => ({ ...p, [key]: 'saving' }));
    try {
      const body = '<p>' + escapeHtml(text) + '</p>';
      const res = await apiFetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Title and body both get the item text — the captured phrase is short
        // enough to be the title, and the body carries it as note content.
        body: JSON.stringify({
          type: CATEGORY_META[cat].noteType || 'idea',
          title: text,
          body,
          tags: [CATEGORY_META[cat].tag],
        }),
      });
      if (!res.ok) throw new Error('save failed');
      window.dispatchEvent(new CustomEvent('liminal:notes-changed'));
      setState((p) => ({ ...p, [key]: 'done' }));
    } catch {
      setState((p) => ({ ...p, [key]: 'idle' }));
    }
  }

  return (
    <div style={s.wrap}>
      <button
        style={s.header}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span>{t('captured.title') || 'Captured from this entry'}</span>
        <span style={{ ...s.chevron, transform: collapsed ? 'rotate(-90deg)' : 'none' }}>▾</span>
      </button>
      {!collapsed && groups.map((cat) => {
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat} style={s.group}>
            <div style={s.groupLabel}>
              <span style={{ marginRight: '6px' }}>{meta.emoji}</span>
              {t(meta.labelKey) || cat}
            </div>
            {items[cat].map((text, idx) => {
              const st = state[`${cat}:${idx}`] || 'idle';
              const done = st === 'done';
              const addLabel = t(meta.addKey) || meta.addFallback;
              return (
                <div key={idx} style={s.row}>
                  <span style={s.bullet}>•</span>
                  <span style={s.itemText}>{text}</span>
                  <button
                    onClick={() => addItem(cat, idx, text)}
                    disabled={st !== 'idle'}
                    style={{ ...s.addBtn, ...(done ? s.addBtnDone : {}) }}
                    aria-label={done ? t('captured.added') || 'Added' : addLabel}
                  >
                    {done ? '✓ ' + (t('captured.added') || 'Added')
                          : st === 'saving' ? '…'
                          : '+ ' + addLabel}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const s = {
  // Full-width top divider, but content inset 24px to line up with the
  // opening / blocks / closing-question text above.
  wrap: {
    marginTop: '24px',
    borderTop: '1px solid var(--border)',
    padding: '18px 24px 4px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '14px',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  chevron: {
    fontSize: '10px',
    transition: 'transform 0.15s',
    display: 'inline-block',
  },
  group: { marginBottom: '16px' },
  groupLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--strong)',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  // Items inset under their heading, bullet-list style.
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 0 5px 14px',
  },
  bullet: { color: 'var(--muted)', fontSize: '12px', flexShrink: 0, lineHeight: 1.5 },
  itemText: { fontSize: '13px', color: 'var(--body)', lineHeight: 1.5, flex: 1, minWidth: 0 },
  addBtn: {
    flexShrink: 0,
    fontSize: '11px',
    fontFamily: 'var(--font)',
    color: 'var(--body)',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '10px',
    padding: '4px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'color 0.12s, border-color 0.12s',
  },
  addBtnDone: {
    color: 'var(--muted)',
    cursor: 'default',
    borderColor: 'transparent',
    background: 'transparent',
  },
};
