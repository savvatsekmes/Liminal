import { useState, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const ARCHETYPE_KEYS = [
  { value: 'Auto', key: 'archetype.auto' },
  { value: 'Zen', key: 'archetype.zen' },
  { value: 'Jungian', key: 'archetype.jungian' },
  { value: 'Stoic', key: 'archetype.stoic' },
  { value: 'Somatic', key: 'archetype.somatic' },
  { value: 'Taoist', key: 'archetype.taoist' },
  { value: 'Direct Friend', key: 'archetype.directFriend' },
];

const s = {
  block: {
    padding: '20px 24px',
    borderBottom: 'var(--border-style)',
    position: 'relative',
  },
  title: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--strong)',
    marginBottom: '10px',
    lineHeight: '1.3',
  },
  body: {
    fontSize: '12px',
    fontStyle: 'italic',
    color: 'var(--body)',
    lineHeight: '1.85',
    marginBottom: '10px',
  },
  quote: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    borderLeft: '2px solid var(--border)',
    paddingLeft: '10px',
    marginTop: '10px',
    marginBottom: '10px',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '10px',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '3px',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'color 0.12s, background 0.12s',
  },
  actionBtnActive: {
    color: 'var(--strong)',
    background: 'var(--panel-bg)',
  },
  dropdown: {
    fontSize: '11px',
    color: 'var(--muted)',
    border: 'var(--border-style)',
    borderRadius: '2px',
    padding: '2px 6px',
    background: 'var(--white)',
    cursor: 'pointer',
    outline: 'none',
    height: '24px',
    fontFamily: 'var(--font)',
    marginLeft: '2px',
  },
  playingIndicator: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--strong)',
    animation: 'pulse 1s ease-in-out infinite',
    marginLeft: '4px',
  },
};

export default function MirrorBlock({ block, entryText, onRegenerate, ttsOnline }) {
  const { t } = useLanguage();
  const [playing, setPlaying] = useState(false);
  const [regenerating, setRegen] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState(block.archetype || 'Auto');
  const audioRef = useRef(null);

  async function handleListen() {
    if (playing) {
      // Stop playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }

    const text = block.body + (block.quote ? ' ' + block.quote : '');

    if (ttsOnline) {
      // Try Chatterbox
      try {
        setPlaying(true);
        const res = await fetch('/api/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, exaggeration: 0.5 }),
        });

        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
          audio.onerror = () => { setPlaying(false); fallbackTTS(text); };
          await audio.play();
          return;
        }
      } catch {}
    }

    // Fallback to Web Speech API
    fallbackTTS(text);
  }

  function fallbackTTS(text) {
    if (!window.speechSynthesis) { setPlaying(false); return; }
    const utt = new SpeechSynthesisUtterance(text);
    utt.onend = () => setPlaying(false);
    utt.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utt);
    setPlaying(true);
  }

  async function handleRegenerate() {
    if (!onRegenerate || regenerating) return;
    setRegen(true);
    try {
      await onRegenerate(block, selectedArchetype || 'Auto');
    } finally {
      setRegen(false);
    }
  }

  // Render body with **bold** preserved from the LLM
  function renderBody(text) {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  return (
    <div style={s.block}>
      <div style={s.title}>{block.title}</div>
      <div style={s.body}>{renderBody(block.body)}</div>
      {block.quote && <div style={s.quote}>"{block.quote}"</div>}

      <div style={s.actions}>
        {/* Waveform / Listen button */}
        <button
          style={{
            ...s.actionBtn,
            ...(playing ? s.actionBtnActive : {}),
            opacity: !ttsOnline && !window.speechSynthesis ? 0.4 : 1,
          }}
          onClick={handleListen}
          title={playing ? t('mirror.stop') : t('mirror.listen')}
          aria-label={playing ? t('mirror.stop') : t('mirror.listen')}
        >
          <WaveformIcon playing={playing} />
        </button>

        {/* Regenerate button */}
        <button
          style={{ ...s.actionBtn, ...(regenerating ? s.actionBtnActive : {}) }}
          onClick={handleRegenerate}
          title={t('mirror.regenerate')}
          aria-label={t('mirror.regenerate')}
          disabled={regenerating}
        >
          {regenerating ? '…' : <RegenIcon />}
        </button>

        {/* Archetype selector */}
        <select
          style={s.dropdown}
          value={selectedArchetype}
          onChange={(e) => setSelectedArchetype(e.target.value)}
          title="Choose archetype for regeneration"
          aria-label="Archetype"
        >
          {ARCHETYPE_KEYS.map((a) => (
            <option key={a.value} value={a.value}>{t(a.key)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function WaveformIcon({ playing }) {
  // Four bars — animated height when playing
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y={playing ? 2 : 4} width="2" height={playing ? 10 : 6} rx="1" fill="currentColor">
        {playing && (
          <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />
        )}
      </rect>
      <rect x="4.5" y={playing ? 0 : 2} width="2" height={playing ? 14 : 10} rx="1" fill="currentColor">
        {playing && (
          <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />
        )}
      </rect>
      <rect x="8" y={playing ? 3 : 4} width="2" height={playing ? 8 : 6} rx="1" fill="currentColor">
        {playing && (
          <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />
        )}
      </rect>
      <rect x="11.5" y={playing ? 1 : 3} width="2" height={playing ? 12 : 8} rx="1" fill="currentColor">
        {playing && (
          <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />
        )}
      </rect>
    </svg>
  );
}

function RegenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M13.5 8A5.5 5.5 0 1 1 8 2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8 0.5L10.5 2.5L8 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
