import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useRef, useCallback } from 'react';

// ── Safe attribute encoding (HTML in data-attributes breaks the parser) ──────

function encodeAttr(str) {
  try { return btoa(unescape(encodeURIComponent(str || ''))); } catch { return ''; }
}
function decodeAttr(str) {
  try { return decodeURIComponent(escape(atob(str || ''))); } catch { return str || ''; }
}

// ── TipTap Node ──────────────────────────────────────────────────────────────

export const CardReading = Node.create({
  name: 'cardReading',
  group: 'block',
  atom: true,
  selectable: false, // prevents accidental selection + deletion when adjacent nodes are deleted
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      cards:      { default: '[]' },
      reading:    { default: '' },
      deckType:   { default: 'tarot' },
      spreadName: { default: '' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-card-reading]',
      getAttrs: (dom) => ({
        cards:      decodeAttr(dom.getAttribute('data-cards')),
        reading:    decodeAttr(dom.getAttribute('data-reading')),
        deckType:   dom.getAttribute('data-deck-type') || 'tarot',
        spreadName: dom.getAttribute('data-spread-name') || '',
      }),
    }];
  },

  renderHTML({ node }) {
    return ['div', {
      'data-card-reading': '',
      'data-cards':       encodeAttr(node.attrs.cards),
      'data-reading':     encodeAttr(node.attrs.reading),
      'data-deck-type':   node.attrs.deckType,
      'data-spread-name': node.attrs.spreadName,
    }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CardReadingView);
  },
});

// ── Styles ───────────────────────────────────────────────────────────────────

const st = {
  wrapper: {
    margin: '20px 0',
    border: 'var(--border-style)',
    borderRadius: '4px',
    overflow: 'hidden',
    background: 'var(--near-white)',
    position: 'relative',
  },
  header: {
    padding: '12px 16px',
    borderBottom: 'var(--border-style)',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--strong)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
  },
  diamond: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    background: 'var(--strong)',
    transform: 'rotate(45deg)',
    flexShrink: 0,
  },
  dragHandle: {
    cursor: 'grab',
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: '14px',
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.5,
    transition: 'opacity 0.15s',
    flexShrink: 0,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: '1',
    opacity: 0.5,
    transition: 'opacity 0.15s, color 0.15s',
    flexShrink: 0,
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    padding: '16px',
  },
  cardSlot: {
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'transform 0.15s',
  },
  cardImgWrap: {
    width: '90px',
    height: '154px',
    borderRadius: '5px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    border: '1px solid var(--border)',
    transition: 'box-shadow 0.15s, transform 0.15s',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  oracleCard: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 6px',
    background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#d4af37',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  cardLabel: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginTop: '4px',
  },
  cardName: {
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--strong)',
    lineHeight: '1.2',
    marginTop: '1px',
  },
  reversed: {
    fontSize: '8px',
    fontStyle: 'italic',
    color: 'var(--muted)',
  },
  readingToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    borderTop: 'var(--border-style)',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    gap: '6px',
    transition: 'color 0.12s',
    background: 'none',
    border: 'none',
    width: '100%',
    fontFamily: 'var(--font)',
  },
  readingBody: {
    fontSize: '13px',
    color: 'var(--strong)',
    lineHeight: '1.85',
    padding: '0 16px 16px',
    overflow: 'hidden',
    transition: 'max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease',
  },
  /* Detail popup */
  popupOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
    zIndex: 300,
  },
  popup: {
    width: '400px',
    maxWidth: '92vw',
    maxHeight: '80vh',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '4px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  popupTop: {
    display: 'flex',
    gap: '16px',
    padding: '20px',
    alignItems: 'flex-start',
    overflowY: 'auto',
    flex: 1,
  },
  popupImg: {
    width: '120px',
    height: '205px',
    borderRadius: '6px',
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    flexShrink: 0,
  },
  popupInfo: {
    flex: 1,
    minWidth: 0,
  },
  popupPosition: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '4px',
  },
  popupName: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--strong)',
    marginBottom: '4px',
  },
  popupReversed: {
    fontSize: '11px',
    fontWeight: '600',
    fontStyle: 'italic',
    color: 'var(--muted)',
    marginBottom: '8px',
  },
  popupMeaning: {
    fontSize: '12px',
    lineHeight: '1.7',
    color: 'var(--body)',
  },
  popupMeaningLabel: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '4px',
    marginTop: '12px',
  },
  popupFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderTop: 'var(--border-style)',
    gap: '8px',
  },
  popupBtn: {
    padding: '6px 16px',
    fontSize: '11px',
    fontWeight: '500',
    borderRadius: '20px',
    border: 'var(--border-style)',
    background: 'var(--white)',
    color: 'var(--body)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  popupClose: {
    fontSize: '11px',
    color: 'var(--muted)',
    background: 'none',
    border: 'var(--border-style)',
    borderRadius: '2px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
};

// ── React NodeView ───────────────────────────────────────────────────────────

function CardReadingView({ node, deleteNode }) {
  const { cards: cardsJson, reading, deckType, spreadName } = node.attrs;
  const [selectedCard, setSelectedCard] = useState(null);
  const [readingExpanded, setReadingExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  let cards = [];
  try { cards = JSON.parse(cardsJson); } catch {}

  const deckLabel = deckType === 'tarot' ? 'Tarot' : 'Oracle';

  return (
    <NodeViewWrapper
      style={{ display: 'block' }}
      contentEditable={false}
    >
      <div
        style={st.wrapper}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Header with drag handle + delete */}
        <div style={st.header}>
          <div
            data-drag-handle
            style={{ ...st.dragHandle, opacity: hovered ? 0.8 : 0.3 }}
            title="Drag to reorder"
          >
            ⠿
          </div>
          <div style={st.headerLeft}>
            <span style={st.diamond} />
            {deckLabel} Reading — {spreadName}
          </div>
          <button
            style={{ ...st.deleteBtn, opacity: hovered ? 0.8 : 0 }}
            onClick={deleteNode}
            title="Remove reading"
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#c44'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = hovered ? '0.8' : '0'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            ×
          </button>
        </div>

        {/* Card images row */}
        <div style={st.cardRow}>
          {cards.map((card, i) => (
            <div
              key={i}
              style={st.cardSlot}
              onClick={() => setSelectedCard(card)}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={st.cardImgWrap}>
                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.name}
                    style={{
                      ...st.cardImg,
                      transform: card.reversed ? 'rotate(180deg)' : 'none',
                    }}
                  />
                ) : (
                  <div style={st.oracleCard}>
                    <div style={{ width: 10, height: 10, background: '#d4af37', transform: 'rotate(45deg)', marginBottom: 6 }} />
                    <div style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1.3 }}>{card.name}</div>
                  </div>
                )}
              </div>
              <div style={st.cardLabel}>{card.position}</div>
              <div style={st.cardName}>{card.name}</div>
              {card.reversed && <div style={st.reversed}>Reversed</div>}
            </div>
          ))}
        </div>

        {/* Collapsible reading section */}
        {reading && (
          <>
            <button
              style={st.readingToggle}
              onClick={() => setReadingExpanded(prev => !prev)}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--strong)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}
            >
              <ChevronIcon expanded={readingExpanded} />
              {readingExpanded ? 'Hide reading' : 'Show reading'}
            </button>
            <div style={{
              ...st.readingBody,
              maxHeight: readingExpanded ? '2000px' : '0px',
              opacity: readingExpanded ? 1 : 0,
              padding: readingExpanded ? '0 16px 16px' : '0 16px',
            }}>
              <div dangerouslySetInnerHTML={{ __html: reading }} />
            </div>
          </>
        )}
      </div>

      {/* Card detail popup */}
      {selectedCard && (
        <CardDetailPopup card={selectedCard} deckType={deckType} onClose={() => setSelectedCard(null)} />
      )}
    </NodeViewWrapper>
  );
}

// ── Chevron Icon ─────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Card Detail Popup ────────────────────────────────────────────────────────

function CardDetailPopup({ card, deckType, onClose }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  const handleReadAloud = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaying(false);
      return;
    }

    const lines = [card.name];
    if (card.position) lines.push(`Position: ${card.position}`);
    if (card.reversed) lines.push('This card is reversed.');
    const meaning = card.reversed
      ? (card.reversed_meaning || card.upright || card.meaning)
      : (card.upright || card.meaning);
    if (meaning) lines.push(meaning);
    const text = lines.join('. ');

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
        audio.onerror = () => setPlaying(false);
        await audio.play();
        return;
      }
    } catch {}

    // Fallback to browser TTS
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.onend = () => setPlaying(false);
      utt.onerror = () => setPlaying(false);
      window.speechSynthesis.speak(utt);
    } else {
      setPlaying(false);
    }
  }, [card, playing]);

  const uprightMeaning = card.upright || card.meaning || '';
  const reversedMeaning = card.reversed_meaning || '';

  return (
    <div style={st.popupOverlay} onClick={onClose}>
      <div style={st.popup} onClick={e => e.stopPropagation()}>
        <div style={st.popupTop}>
          {/* Card image */}
          <div style={st.popupImg}>
            {card.image ? (
              <img
                src={card.image}
                alt={card.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  transform: card.reversed ? 'rotate(180deg)' : 'none',
                }}
              />
            ) : (
              <div style={{
                ...st.oracleCard,
                width: '100%',
                height: '100%',
                borderRadius: '6px',
              }}>
                <div style={{ width: 16, height: 16, background: '#d4af37', transform: 'rotate(45deg)', marginBottom: 8 }} />
                <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.3 }}>{card.name}</div>
              </div>
            )}
          </div>

          {/* Card info */}
          <div style={st.popupInfo}>
            {card.position && <div style={st.popupPosition}>{card.position}</div>}
            <div style={st.popupName}>{card.name}</div>
            {card.reversed && <div style={st.popupReversed}>Reversed</div>}

            {deckType === 'tarot' ? (
              <>
                <div style={st.popupMeaningLabel}>
                  {card.reversed ? 'Reversed Meaning' : 'Upright Meaning'}
                </div>
                <div style={st.popupMeaning}>
                  {card.reversed ? (reversedMeaning || uprightMeaning) : uprightMeaning}
                </div>
                {card.reversed && uprightMeaning && (
                  <>
                    <div style={st.popupMeaningLabel}>Upright Meaning</div>
                    <div style={st.popupMeaning}>{uprightMeaning}</div>
                  </>
                )}
                {!card.reversed && reversedMeaning && (
                  <>
                    <div style={st.popupMeaningLabel}>Reversed Meaning</div>
                    <div style={st.popupMeaning}>{reversedMeaning}</div>
                  </>
                )}
              </>
            ) : (
              <div style={st.popupMeaning}>{card.meaning}</div>
            )}
          </div>
        </div>

        {/* Footer with read aloud + close */}
        <div style={st.popupFooter}>
          <button style={st.popupBtn} onClick={handleReadAloud}>
            <WaveformIcon playing={playing} />
            {playing ? 'Stop' : 'Read aloud'}
          </button>
          <button style={st.popupClose} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Waveform Icon ────────────────────────────────────────────────────────────

function WaveformIcon({ playing }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y={playing ? 2 : 4} width="2" height={playing ? 10 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
        {playing && <animate attributeName="y" values="2;5;2" dur="0.8s" repeatCount="indefinite" />}
      </rect>
      <rect x="4.5" y={playing ? 0 : 2} width="2" height={playing ? 14 : 10} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
        {playing && <animate attributeName="y" values="0;4;0" dur="0.6s" repeatCount="indefinite" />}
      </rect>
      <rect x="8" y={playing ? 3 : 5} width="2" height={playing ? 8 : 4} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="8;3;8" dur="0.7s" repeatCount="indefinite" />}
        {playing && <animate attributeName="y" values="3;5.5;3" dur="0.7s" repeatCount="indefinite" />}
      </rect>
      <rect x="11.5" y={playing ? 4 : 5} width="2" height={playing ? 6 : 4} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="6;2;6" dur="0.9s" repeatCount="indefinite" />}
        {playing && <animate attributeName="y" values="4;6;4" dur="0.9s" repeatCount="indefinite" />}
      </rect>
    </svg>
  );
}
