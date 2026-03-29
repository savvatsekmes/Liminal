import { useState, useRef, useEffect } from 'react';
import MirrorBlock from './MirrorBlock';
import { useLanguage } from '../i18n/LanguageContext';

const s = {
  root: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--near-white)',
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
};

export default function MirrorPanel({
  blocks,
  opening,
  loading,
  error,
  entryText,
  ttsOnline,
  onReflect,
  onRegenerateBlock,
  previewVersion,
  onClearPreview,
}) {
  const { t } = useLanguage();
  const [readingAll, setReadingAll] = useState(false);
  const ttsAudioRef = useRef(null);
  const readingCancelledRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => () => {
    readingCancelledRef.current = true;
    if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  async function handleReadAll() {
    if (readingAll) {
      readingCancelledRef.current = true;
      if (ttsAudioRef.current) { ttsAudioRef.current.pause(); ttsAudioRef.current = null; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setReadingAll(false);
      return;
    }
    if (!blocks.length) return;

    const fullText = [opening, ...blocks.map(b => b.body)].filter(Boolean).join('\n\n');
    if (!fullText.trim()) return;

    readingCancelledRef.current = false;
    setReadingAll(true);

    // Try custom TTS
    try {
      const res = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText, exaggeration: 0.5 }),
      });
      if (res.ok && !readingCancelledRef.current) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        audio.onended = () => { setReadingAll(false); URL.revokeObjectURL(url); };
        audio.onerror = () => { setReadingAll(false); };
        await audio.play();
        return;
      }
    } catch {}

    if (readingCancelledRef.current) return;

    // Fallback to browser TTS
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(fullText);
      utt.onend = () => setReadingAll(false);
      utt.onerror = () => setReadingAll(false);
      window.speechSynthesis.speak(utt);
    } else {
      setReadingAll(false);
    }
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

      {/* Body */}
      <div style={s.body}>
        {loading && <LoadingState />}
        {!loading && error && <div style={s.error}>{error}</div>}
        {!loading && !error && blocks.length === 0 && <EmptyState />}
        {!loading && !error && opening && (
          <div style={s.opening}>{opening}</div>
        )}
        {!loading && !error && blocks.map((block, i) => (
          <MirrorBlock
            key={i}
            block={block}
            entryText={entryText}
            ttsOnline={ttsOnline}
            onRegenerate={(blk, archetype) => onRegenerateBlock(blk, archetype, i, entryText)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ ...s.footer, display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          style={{ ...s.reflectBtn, flex: 1, ...(loading ? s.reflectBtnLoading : {}) }}
          onClick={onReflect}
          disabled={loading}
        >
          {loading ? t('mirror.reflecting') : t('mirror.reflect')}
        </button>
        <button
          onClick={handleReadAll}
          title={readingAll ? t('common.stop') : t('common.readAloud')}
          type="button"
          disabled={blocks.length === 0 && !readingAll}
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '20px',
            border: 'none',
            background: readingAll ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
            color: readingAll ? 'var(--strong)' : 'var(--muted)',
            cursor: (blocks.length === 0 && !readingAll) ? 'default' : 'pointer',
            transition: 'color 0.15s, background 0.15s',
            flexShrink: 0,
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
  const d = new Date(isoStr);
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
