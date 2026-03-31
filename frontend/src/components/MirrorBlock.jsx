import { useState, useRef } from 'react';

const s = {
  block: {
    padding: '20px 24px',
    position: 'relative',
  },
  divider: {
    width: '95%',
    margin: '0 auto',
    borderBottom: 'var(--border-style)',
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
  listenBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '10px',
    border: 'none',
    background: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.12s',
    verticalAlign: 'middle',
    marginLeft: '2px',
  },
};

export default function MirrorBlock({ block }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  async function handleListen() {
    if (playing) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }

    const text = block.body + (block.quote ? ' ' + block.quote : '');
    setPlaying(true);

    try {
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
    <>
      <div style={s.block}>
        <div style={s.title}>{block.title}</div>
        <div style={s.body}>{renderBody(block.body)}</div>
        {block.quote && <div style={s.quote}>"{block.quote}"</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            style={{ ...s.listenBtn, color: playing ? 'var(--strong)' : 'var(--muted)' }}
            onClick={handleListen}
            aria-label={playing ? 'Stop' : 'Listen'}
          >
            <WaveformIcon playing={playing} />
          </button>
        </div>
      </div>
      <div style={s.divider} />
    </>
  );
}

function WaveformIcon({ playing }) {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
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
