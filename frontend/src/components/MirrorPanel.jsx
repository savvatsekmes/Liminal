import { useState, useRef, useEffect } from 'react';
import MirrorBlock from './MirrorBlock';
import AILabel from './AILabel';
import { useLanguage } from '../i18n/LanguageContext';
import { BUILT_IN_ARCHETYPES } from '../constants/archetypes';
import ArchetypeAvatar from './ArchetypeAvatar';
import { parseSqliteUtc } from '../utils/dates';
import { apiFetch } from '../utils/api';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';

const s = {
  root: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--near-white)',
    position: 'relative',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: '40px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  headerCount: {
    fontSize: '11px',
    color: 'var(--muted)',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
  },
  empty: {
    padding: '40px 24px',
    fontSize: '12px',
    color: 'var(--muted)',
    lineHeight: '1.8',
    textAlign: 'center',
  },
  footer: {
    borderTop: 'var(--border-style)',
    padding: '14px 18px',
    flexShrink: 0,
    background: 'var(--white)',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  reflectBtn: {
    width: '100%',
    fontSize: '12px',
    padding: '9px 0',
    fontWeight: '500',
    color: 'var(--white)',
    background: 'var(--strong)',
    borderRadius: '20px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    border: 'none',
    fontFamily: 'var(--font)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
  reflectBtnLoading: {
    opacity: 0.55,
    cursor: 'default',
  },
  loadingState: {
    padding: '40px 24px',
    textAlign: 'center',
  },
  loadingDots: {
    fontSize: '24px',
    color: 'var(--muted)',
    letterSpacing: '4px',
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  loadingText: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginTop: '12px',
  },
  opening: {
    padding: '22px 24px 18px',
    fontSize: '13px',
    fontStyle: 'italic',
    color: 'var(--strong)',
    lineHeight: '1.75',
    borderBottom: 'var(--border-style)',
  },
  error: {
    margin: '16px 24px',
    padding: '12px 16px',
    background: 'var(--panel-bg)',
    border: 'var(--border-style)',
    borderRadius: '2px',
    fontSize: '12px',
    color: 'var(--body)',
    lineHeight: '1.6',
  },
  pillBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '20px',
    border: 'none',
    cursor: 'pointer',
    transition: 'color 0.15s, background 0.15s',
    flexShrink: 0,
  },
  archetypePopup: {
    position: 'absolute',
    bottom: '64px',
    right: '18px',
    background: 'var(--white)',
    borderRadius: '12px',
    padding: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
    zIndex: 50,
    minWidth: '140px',
  },
  archetypeOption: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    textAlign: 'left',
    padding: '7px 14px',
    fontSize: '12px',
    color: 'var(--body)',
    background: 'none',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background 0.1s',
  },
  contextPopup: {
    position: 'fixed',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    zIndex: 100,
    userSelect: 'none',
    background: 'var(--white)',
    borderRadius: '20px',
    padding: '3px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
  },
  contextBtn: {
    color: 'var(--body)',
    fontSize: '11px',
    fontWeight: '500',
    borderRadius: '16px',
    padding: '5px 12px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background 0.12s',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    background: 'transparent',
    border: 'none',
  },
};

export default function MirrorPanel({
  blocks,
  opening,
  loading,
  error,
  entryText,
  entryId,
  ttsOnline,
  onReflect,
  onRegenerateBlock,
  onUpdateBlock,
  onPatchBlock,
  onDeleteBlock,
  onAddBlock,
  previewVersion,
  onClearPreview,
  onNavigateToEntry,
}) {
  const { t } = useLanguage();
  const [readingAll, setReadingAll] = useState(false);
  const [readingOpening, setReadingOpening] = useState(false);
  const openingAudioRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const readingCancelledRef = useRef(false);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState('Auto');
  const [editMode, setEditMode] = useState(false);
  const archetypeRef = useRef(null);
  const [mirrorCustomArchetypes, setMirrorCustomArchetypes] = useState([]);
  const bodyRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => () => {
    readingCancelledRef.current = true;
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  // Load custom archetypes
  useEffect(() => {
    apiFetch('/api/portrait').then(r => r.json()).then(p => {
      if (p) {
        try {
          const custom = Array.isArray(p.custom_archetypes) ? p.custom_archetypes : JSON.parse(p.custom_archetypes || '[]');
          if (custom.length) setMirrorCustomArchetypes(custom);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  // Close archetype popup on outside click
  useEffect(() => {
    if (!archetypeOpen) return;
    function handleClick(e) {
      if (archetypeRef.current && !archetypeRef.current.contains(e.target)) {
        setArchetypeOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [archetypeOpen]);

// Voice selection for read-all / opening / selected-text reads:
  //  1. If the user has a non-Auto archetype selected in the dropdown, use that
  //     voice immediately — no need to re-reflect to hear the new voice.
  //  2. Otherwise, if every block shares the same non-Auto archetype (from a
  //     prior single-archetype reflect), fall back to that.
  //  3. Otherwise leave unset so streamSpeak uses the system default.
  function activeReadArchetype() {
    if (selectedArchetype && selectedArchetype !== 'Auto') return selectedArchetype;
    if (!blocks.length) return undefined;
    const first = blocks[0]?.archetype;
    if (!first || first === 'Auto') return undefined;
    return blocks.every(b => b.archetype === first) ? first : undefined;
  }

  async function handleReadOpening() {
    if (readingOpening) { stopSpeak(openingAudioRef, readingCancelledRef); setReadingOpening(false); return; }
    if (!opening) return;
    readingCancelledRef.current = false;
    setReadingOpening(true);
    await streamSpeak(opening, openingAudioRef, readingCancelledRef, { archetype: activeReadArchetype() });
    setReadingOpening(false);
  }

  async function handleReadAll() {
    if (readingAll) { stopSpeak(ttsAudioRef, readingCancelledRef); setReadingAll(false); return; }
    if (!blocks.length) return;
    const fullText = [opening, ...blocks.map(b => [b.title, b.body, b.quote].filter(Boolean).join('. '))].filter(Boolean).join('\n\n');
    if (!fullText.trim()) return;
    readingCancelledRef.current = false;
    setReadingAll(true);
    await streamSpeak(fullText, ttsAudioRef, readingCancelledRef, { archetype: activeReadArchetype() });
    setReadingAll(false);
  }

if (previewVersion) {
    return (
      <div style={s.root}>
        <div style={s.header}>
          <span style={s.headerLabel}>{t('mirror.versionPreview')}</span>
          <button
            onClick={onClearPreview}
            style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '2px', padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}
          >
            ✕ {t('common.close')}
          </button>
        </div>
        <div style={{ ...s.body, padding: '20px 24px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '14px', fontStyle: 'italic' }}>
            {formatVersionDate(previewVersion.saved_at)}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: '1.85', whiteSpace: 'pre-wrap' }}>
            {previewVersion.body_text || '—'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerLabel}>{t('mirror.title')}</span>
        {blocks.length > 0 && (
          <span style={s.headerCount}>{t('mirror.reflections', { count: blocks.length, s: blocks.length !== 1 ? 's' : '' })}</span>
        )}
      </div>
      <div style={{ padding: '0 14px' }}><AILabel compact /></div>

      {/* Body */}
      <div style={s.body} ref={bodyRef} data-find-scope="1">
        {loading && <LoadingState />}
        {!loading && error && <div style={s.error}>{error}</div>}
        {!loading && !error && blocks.length === 0 && <EmptyState />}
        {!loading && !error && opening && (
          <div style={s.opening}>
            {opening}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '10px', border: 'none', background: 'none', color: readingOpening ? 'var(--strong)' : 'var(--muted)', cursor: 'pointer', padding: 0, transition: 'color 0.12s' }}
                onClick={handleReadOpening}
                aria-label={readingOpening ? 'Stop' : 'Listen'}
              >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <rect x="1" y={readingOpening ? 2 : 4} width="2" height={readingOpening ? 10 : 6} rx="1" fill="currentColor">
                  {readingOpening && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
                </rect>
                <rect x="4.5" y={readingOpening ? 0 : 2} width="2" height={readingOpening ? 14 : 10} rx="1" fill="currentColor">
                  {readingOpening && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
                </rect>
                <rect x="8" y={readingOpening ? 3 : 5} width="2" height={readingOpening ? 8 : 4} rx="1" fill="currentColor">
                  {readingOpening && <animate attributeName="height" values="8;3;8" dur="0.7s" repeatCount="indefinite" />}
                </rect>
                <rect x="11.5" y={readingOpening ? 1 : 3} width="2" height={readingOpening ? 12 : 8} rx="1" fill="currentColor">
                  {readingOpening && <animate attributeName="height" values="12;5;12" dur="0.9s" repeatCount="indefinite" />}
                </rect>
              </svg>
              </button>
            </div>
          </div>
        )}
        {!loading && !error && blocks.map((block, i) => (
          <MirrorBlock
            key={i}
            block={block}
            overrideArchetype={selectedArchetype !== 'Auto' ? selectedArchetype : undefined}
            onChange={editMode && onUpdateBlock ? (next) => onUpdateBlock(entryId, i, next) : undefined}
            onPatch={editMode && onPatchBlock ? (patch) => onPatchBlock(entryId, i, patch) : undefined}
            onDelete={editMode && onDeleteBlock ? () => onDeleteBlock(entryId, i) : undefined}
            onNavigateToEntry={onNavigateToEntry}
          />
        ))}
      </div>

{/* Archetype picker popup */}
      {archetypeOpen && (
        <div style={s.archetypePopup} ref={archetypeRef}>
          {BUILT_IN_ARCHETYPES.map((a) => (
            <button
              key={a.value}
              style={{
                ...s.archetypeOption,
                fontWeight: selectedArchetype === a.value ? '600' : '400',
                color: selectedArchetype === a.value ? 'var(--strong)' : 'var(--body)',
              }}
              onClick={() => { setSelectedArchetype(a.value); setArchetypeOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ArchetypeAvatar archetype={a} size={18} color={selectedArchetype === a.value ? 'var(--strong)' : 'var(--muted)'} />
              <span style={{ marginLeft: '8px' }}>{t(a.key)}</span>
            </button>
          ))}
          {mirrorCustomArchetypes.length > 0 && (
            <div style={{ height: '1px', background: 'var(--border)', margin: '4px 8px' }} />
          )}
          {mirrorCustomArchetypes.map((c) => (
            <button
              key={c.name}
              style={{
                ...s.archetypeOption,
                fontWeight: selectedArchetype === c.name ? '600' : '400',
                color: selectedArchetype === c.name ? 'var(--strong)' : 'var(--body)',
              }}
              onClick={() => { setSelectedArchetype(c.name); setArchetypeOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <ArchetypeAvatar archetype={{ value: c.name, image: c.image }} size={18} color={c.color || 'var(--muted)'} />
              <span style={{ marginLeft: '8px' }}>{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={s.footer}>
        <button
          style={{ ...s.reflectBtn, flex: 1, ...(loading ? s.reflectBtnLoading : {}) }}
          onClick={() => onReflect(selectedArchetype)}
          disabled={loading}
        >
          {loading ? t('mirror.reflecting') : t('mirror.reflect')}
        </button>

        {/* Edit mode toggle */}
        <button
          onClick={() => setEditMode(v => !v)}
          title={editMode ? t('common.done') || 'Done' : t('common.edit') || 'Edit'}
          type="button"
          disabled={blocks.length === 0}
          style={{
            ...s.pillBtn,
            background: editMode ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
            color: editMode ? 'var(--strong)' : 'var(--muted)',
            cursor: blocks.length === 0 ? 'default' : 'pointer',
            opacity: blocks.length === 0 ? 0.35 : 1,
            boxShadow: editMode
              ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
              : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          <PencilIcon />
        </button>

        {/* Add manual block — only in edit mode */}
        {onAddBlock && editMode && (
          <button
            onClick={() => onAddBlock(entryId)}
            title={t('mirror.addBlock')}
            type="button"
            disabled={!entryId}
            style={{
              ...s.pillBtn,
              background: 'var(--near-white)',
              color: 'var(--muted)',
              cursor: entryId ? 'pointer' : 'default',
              opacity: entryId ? 1 : 0.35,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
              fontSize: '18px',
              fontWeight: '300',
              lineHeight: 1,
              paddingBottom: '2px',
            }}
          >+</button>
        )}

        {/* Archetype picker button */}
        <button
          onClick={(e) => { e.stopPropagation(); setArchetypeOpen(!archetypeOpen); }}
          title={t(BUILT_IN_ARCHETYPES.find(a => a.value === selectedArchetype)?.key || 'archetype.auto')}
          type="button"
          style={{
            ...s.pillBtn,
            background: archetypeOpen ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
            color: selectedArchetype !== 'Auto' ? 'var(--strong)' : 'var(--muted)',
            boxShadow: archetypeOpen
              ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
              : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          {(() => {
            const builtIn = BUILT_IN_ARCHETYPES.find(a => a.value === selectedArchetype);
            const custom = mirrorCustomArchetypes.find(a => a.name === selectedArchetype);
            if (builtIn) return <ArchetypeAvatar archetype={builtIn} size={20} color={selectedArchetype !== 'Auto' ? 'var(--strong)' : 'var(--muted)'} />;
            if (custom) return <ArchetypeAvatar archetype={{ value: custom.name, image: custom.image }} size={20} color={custom.color || 'var(--strong)'} />;
            return <ArchetypeIcon />;
          })()}
        </button>

        {/* Read all button */}
        <button
          onClick={handleReadAll}
          title={readingAll ? t('common.stop') : t('common.readAloud')}
          type="button"
          disabled={blocks.length === 0 && !readingAll}
          style={{
            ...s.pillBtn,
            background: readingAll ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
            color: readingAll ? 'var(--strong)' : 'var(--muted)',
            cursor: (blocks.length === 0 && !readingAll) ? 'default' : 'pointer',
            opacity: (blocks.length === 0 && !readingAll) ? 0.35 : 1,
            boxShadow: readingAll
              ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
              : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        >
          <WaveformIcon playing={readingAll} />
        </button>
      </div>
    </div>
  );
}

function formatVersionDate(isoStr) {
  if (!isoStr) return '';
  const d = parseSqliteUtc(isoStr);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + time;
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <div style={s.empty}>
      <div style={{ fontSize: '20px', marginBottom: '12px', color: 'var(--border)' }}>◎</div>
      <div>{t('mirror.empty')}</div>
      <div style={{ marginTop: '6px', color: 'var(--border)' }}>
        {t('mirror.emptyHint')}
      </div>
    </div>
  );
}

function LoadingState() {
  const { t } = useLanguage();
  return (
    <div style={s.loadingState}>
      <div style={s.loadingDots}>· · ·</div>
      <div style={s.loadingText}>{t('mirror.loading')}</div>
    </div>
  );
}

function WaveformIcon({ playing }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y={playing ? 2 : 4} width="2" height={playing ? 10 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
      </rect>
      <rect x="4.5" y={playing ? 0 : 2} width="2" height={playing ? 14 : 10} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
      </rect>
      <rect x="8" y={playing ? 3 : 4} width="2" height={playing ? 8 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />}
      </rect>
      <rect x="11.5" y={playing ? 1 : 3} width="2" height={playing ? 12 : 8} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />}
      </rect>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function ArchetypeIcon() {
  // Simple person/character silhouette icon
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
