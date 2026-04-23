import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';
import AILabel from './AILabel';

const CARD_W = 120;
const CARD_H = 205;
const CARD_BACK = '/cards/card-back.png';

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.35)',
    zIndex: 200,
  },
  modal: {
    width: '680px',
    maxWidth: '95vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '16px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 24px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--strong)',
  },
  closeBtn: {
    fontSize: '11px',
    color: 'var(--muted)',
    background: 'none',
    border: 'var(--border-style)',
    borderRadius: '10px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '10px',
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '20px',
  },
  pill: {
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: '500',
    borderRadius: '20px',
    border: 'var(--border-style)',
    background: 'var(--white)',
    color: 'var(--body)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
  },
  pillActive: {
    background: 'var(--strong)',
    color: 'var(--white)',
    borderColor: 'var(--strong)',
  },
  actionBtn: {
    width: '100%',
    padding: '10px 0',
    fontSize: '12px',
    fontWeight: '500',
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'opacity 0.15s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
    marginBottom: '8px',
  },
  ghostBtn: {
    width: '100%',
    padding: '8px 0',
    fontSize: '11px',
    color: 'var(--muted)',
    background: 'none',
    border: 'var(--border-style)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'color 0.12s, border-color 0.12s',
  },
  /* Card display area */
  cardRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '20px',
    perspective: '1000px',
  },
  cardSlot: {
    width: CARD_W,
    textAlign: 'center',
  },
  flipContainer: {
    width: CARD_W,
    height: CARD_H,
    perspective: '800px',
    cursor: 'default',
    marginBottom: '8px',
  },
  flipInner: {
    position: 'relative',
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    transition: 'transform 0.6s ease',
  },
  flipFace: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
    borderRadius: '6px',
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  cardPosition: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '2px',
  },
  cardName: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--strong)',
    lineHeight: '1.3',
  },
  reversed: {
    fontSize: '9px',
    fontWeight: '600',
    color: 'var(--muted)',
    fontStyle: 'italic',
    display: 'block',
  },
  /* Oracle placeholder card */
  oracleCard: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 8px',
    background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    color: '#d4af37',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  oracleName: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    marginBottom: '6px',
    lineHeight: '1.3',
  },
  oracleDiamond: {
    width: '16px',
    height: '16px',
    background: '#d4af37',
    transform: 'rotate(45deg)',
    marginBottom: '8px',
    flexShrink: 0,
  },
  oracleMeaning: {
    fontSize: '8px',
    lineHeight: '1.5',
    color: 'rgba(212,175,55,0.75)',
    fontStyle: 'italic',
  },
  /* Reading */
  reading: {
    fontSize: '13px',
    color: 'var(--strong)',
    lineHeight: '1.85',
    marginBottom: '16px',
    borderLeft: '2px solid var(--border)',
    paddingLeft: '16px',
  },
};

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CardPullModal({ onClose, onInsert, entryText }) {
  const { t } = useLanguage();
  const [decksData, setDecksData] = useState(null);
  const [deck, setDeck] = useState(null);
  const [spreadId, setSpreadId] = useState(null);
  const [pulledCards, setPulledCards] = useState(null);
  const [flipped, setFlipped] = useState([]);
  const [reading, setReading] = useState(null);
  const [generating, setGenerating] = useState(false);
  const readingRef = useRef(null);
  const shuffledDeckRef = useRef(null); // for free-pull mode — persist the shuffled deck
  const drawIndexRef = useRef(0);       // tracks how far into the shuffled deck we've drawn

  useEffect(() => {
    apiFetch('/api/cards/decks')
      .then(r => r.json())
      .then(setDecksData)
      .catch(() => {});
  }, []);

  const [pulling, setPulling] = useState(false);

  async function handlePull() {
    if (!decksData || !deck || !spreadId || pulling) return;

    const spread = decksData.spreads.find(s => s.id === spreadId);
    if (!spread) return;

    const deckCards = deck === 'tarot' ? decksData.tarot : decksData.oracle;
    const numCards = spread.cardCount === 0 ? 6 : spread.cardCount;

    setPulling(true);
    setReading(null);

    try {
      const res = await apiFetch('/api/cards/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deck, spread: spreadId, count: numCards }),
      });
      const data = await res.json();
      if (!data.cards?.length) throw new Error('No cards returned');
      const cards = data.cards.map((card, i) => {
        const fullCard = deckCards.find(c => c.id === card.id) || card;
        const isReversed = deck === 'tarot' ? !!card.reversed : false;
        return {
          ...fullCard,
          reversed: isReversed,
          reversed_meaning: fullCard.reversed,
          position: card.position ? t(card.position) : (spread.cardCount === 0 ? `${t('cards.positionCard')} ${i + 1}` : t(spread.positions[i]?.labelKey)),
          image: fullCard.image || card.image,
        };
      });

      if (spread.cardCount === 0) {
        shuffledDeckRef.current = cards.length > 1 ? cards : null;
        drawIndexRef.current = 1;
        setPulledCards([cards[0]]);
        setFlipped([false]);
        setTimeout(() => setFlipped([true]), 400);
      } else {
        setPulledCards(cards);
        setFlipped(new Array(cards.length).fill(false));
        shuffledDeckRef.current = null;
        cards.forEach((_, i) => {
          setTimeout(() => {
            setFlipped(prev => { const next = [...prev]; next[i] = true; return next; });
          }, 400 + i * 350);
        });
      }
    } catch (err) {
      console.error('[cards] pull error, falling back to random:', err);
      const deckCards2 = deck === 'tarot' ? decksData.tarot : decksData.oracle;
      if (spread.cardCount === 0) {
        const shuffled = shuffle(deckCards2);
        shuffledDeckRef.current = shuffled;
        drawIndexRef.current = 1;
        setPulledCards([{ ...shuffled[0], position: `${t('cards.positionCard')} 1`, reversed: deck === 'tarot' ? Math.random() < 0.5 : false }]);
        setFlipped([false]);
        setTimeout(() => setFlipped([true]), 400);
      } else {
        const shuffled = shuffle(deckCards2);
        const drawn = shuffled.slice(0, spread.cardCount).map((card, i) => ({
          ...card, position: t(spread.positions[i].labelKey), reversed: deck === 'tarot' ? Math.random() < 0.5 : false,
        }));
        setPulledCards(drawn);
        setFlipped(new Array(drawn.length).fill(false));
        shuffledDeckRef.current = null;
        drawn.forEach((_, i) => {
          setTimeout(() => { setFlipped(prev => { const next = [...prev]; next[i] = true; return next; }); }, 400 + i * 350);
        });
      }
    } finally {
      setPulling(false);
    }
  }

  async function handlePullAnother() {
    if (!pulledCards || pulling) return;
    const spread = decksData?.spreads.find(s => s.id === spreadId);
    const maxCards = spread?.maxCards || 12;
    if (pulledCards.length >= maxCards) return;

    const deckCards = deck === 'tarot' ? decksData.tarot : decksData.oracle;

    if (shuffledDeckRef.current && drawIndexRef.current < shuffledDeckRef.current.length) {
      const card = shuffledDeckRef.current[drawIndexRef.current];
      drawIndexRef.current += 1;
      const fullCard = deckCards.find(c => c.id === card.id) || card;
      const newCard = { ...fullCard, reversed: deck === 'tarot' ? !!card.reversed : false, reversed_meaning: fullCard.reversed, position: `${t('cards.positionCard')} ${pulledCards.length + 1}`, image: fullCard.image || card.image };
      setPulledCards(prev => [...prev, newCard]);
      setFlipped(prev => [...prev, false]);
      setReading(null);
      setTimeout(() => { setFlipped(prev => { const next = [...prev]; next[next.length - 1] = true; return next; }); }, 400);
      return;
    }

    setPulling(true);
    try {
      const res = await apiFetch('/api/cards/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deck, spread: spreadId, count: 1 }),
      });
      const data = await res.json();
      if (data.cards?.length) {
        const card = data.cards[0];
        const fullCard = deckCards.find(c => c.id === card.id) || card;
        const newCard = { ...fullCard, reversed: deck === 'tarot' ? !!card.reversed : false, reversed_meaning: fullCard.reversed, position: `${t('cards.positionCard')} ${pulledCards.length + 1}`, image: fullCard.image || card.image };
        setPulledCards(prev => [...prev, newCard]);
        setFlipped(prev => [...prev, false]);
        setReading(null);
        setTimeout(() => { setFlipped(prev => { const next = [...prev]; next[next.length - 1] = true; return next; }); }, 400);
      }
    } catch (err) {
      console.error('[cards] pull another error:', err);
    } finally {
      setPulling(false);
    }
  }

  async function handleGenerateReading() {
    if (!pulledCards || generating) return;
    setGenerating(true);

    const cardsPayload = pulledCards.map(c => ({
      name: c.name,
      position: c.position,
      reversed: !!c.reversed,
      uprightMeaning: c.upright || c.meaning,
      reversedMeaning: c.reversed_meaning || undefined,
    }));

    try {
      const res = await apiFetch('/api/cards/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deck,
          spread: spreadId,
          cards: cardsPayload,
          entryText: entryText || '',
        }),
      });
      const data = await res.json();
      if (data.reading) {
        setReading(data.reading);
        setTimeout(() => readingRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (err) {
      console.error('Card reading failed:', err);
    } finally {
      setGenerating(false);
    }
  }

  function handleInsert() {
    if (!reading || !pulledCards) return;

    const spread = decksData.spreads.find(s => s.id === spreadId);
    const spreadLabel = spread ? t(spread.nameKey) : '';

    // Pass full card data so the CardReading node can render images + popups
    const cardsForNode = pulledCards.map(c => ({
      name: c.name,
      image: c.image || null,
      position: c.position,
      reversed: c.reversed || false,
      upright: c.upright || c.meaning || '',
      meaning: c.meaning || '',
      reversed_meaning: c.reversed_meaning || '',
    }));

    onInsert({
      type: 'cardReading',
      attrs: {
        cards: JSON.stringify(cardsForNode),
        reading,
        deckType: deck,
        spreadName: spreadLabel,
      },
    });
  }

  function handleStartOver() {
    setPulledCards(null);
    setFlipped([]);
    setReading(null);
    setSpreadId(null);
    setDeck(null);
    shuffledDeckRef.current = null;
    drawIndexRef.current = 0;
  }

  if (!decksData) {
    return (
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  const availableSpreads = decksData.spreads.filter(sp =>
    deck === 'oracle' ? !sp.tarotOnly : true
  );

  const allFlipped = flipped.length > 0 && flipped.every(Boolean);
  const currentSpread = spreadId ? decksData?.spreads.find(sp => sp.id === spreadId) : null;
  const isFreePull = currentSpread?.cardCount === 0;
  const freePullMax = currentSpread?.maxCards || 12;
  const canPullMore = isFreePull && pulledCards && pulledCards.length < freePullMax && allFlipped;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.headerTitle}>{t('cards.title')}</span>
          <button style={s.closeBtn} onClick={onClose}>{t('cards.close')}</button>
        </div>

        <div style={{ padding: '0 20px' }}><AILabel compact /></div>

        {/* Body */}
        <div style={s.body}>
          {/* Step 1: Choose deck */}
          {!pulledCards && (
            <>
              <div style={s.sectionLabel}>{t('cards.chooseDeck')}</div>
              <div style={s.pillRow}>
                <button
                  style={{ ...s.pill, ...(deck === 'tarot' ? s.pillActive : {}) }}
                  onClick={() => { setDeck('tarot'); setSpreadId(null); setPulledCards(null); setReading(null); }}
                >
                  {t('cards.deckTarot')}
                </button>
                <button
                  style={{ ...s.pill, ...(deck === 'oracle' ? s.pillActive : {}) }}
                  onClick={() => { setDeck('oracle'); setSpreadId(null); setPulledCards(null); setReading(null); }}
                >
                  {t('cards.deckOracle')}
                </button>
              </div>

              {/* Step 2: Choose spread */}
              {deck && (
                <>
                  <div style={s.sectionLabel}>{t('cards.chooseSpread')}</div>
                  <div style={s.pillRow}>
                    {availableSpreads.map(sp => (
                      <button
                        key={sp.id}
                        style={{ ...s.pill, ...(spreadId === sp.id ? s.pillActive : {}) }}
                        onClick={() => { setSpreadId(sp.id); setPulledCards(null); setReading(null); }}
                      >
                        {t(sp.nameKey)}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Step 3: Pull button */}
              {deck && spreadId && (
                <button style={{ ...s.actionBtn, opacity: pulling ? 0.5 : 1 }} onClick={handlePull} disabled={pulling}>
                  {pulling ? 'Drawing…' : t('cards.pull')}
                </button>
              )}
            </>
          )}

          {/* Step 4: Show pulled cards */}
          {pulledCards && (
            <>
              <div style={s.cardRow}>
                {pulledCards.map((card, i) => (
                  <div key={i} style={s.cardSlot}>
                    <div style={s.flipContainer}>
                      <div style={{
                        ...s.flipInner,
                        transform: flipped[i] ? 'rotateY(180deg)' : 'rotateY(0deg)',
                      }}>
                        {/* Back face */}
                        <div style={s.flipFace}>
                          <img src={CARD_BACK} alt="Card back" style={s.cardImg} />
                        </div>
                        {/* Front face */}
                        <div style={{
                          ...s.flipFace,
                          transform: 'rotateY(180deg)',
                        }}>
                          {card.image ? (
                            <img
                              src={card.image}
                              alt={card.name}
                              style={{
                                ...s.cardImg,
                                transform: card.reversed ? 'rotate(180deg)' : 'none',
                              }}
                            />
                          ) : (
                            /* Oracle card placeholder */
                            <div style={s.oracleCard}>
                              <div style={s.oracleDiamond} />
                              <div style={s.oracleName}>{card.name}</div>
                              <div style={s.oracleMeaning}>{card.meaning}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Card info below */}
                    {flipped[i] && (
                      <div style={{ opacity: flipped[i] ? 1 : 0, transition: 'opacity 0.3s' }}>
                        <div style={s.cardPosition}>{card.position}</div>
                        <div style={s.cardName}>{card.name}</div>
                        {card.reversed && <span style={s.reversed}>{t('cards.reversed')}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Free-pull: pull another card button */}
              {canPullMore && !reading && (
                <button
                  style={{ ...s.ghostBtn, marginBottom: '8px' }}
                  onClick={handlePullAnother}
                >
                  + {t('cards.pullAnother')}
                </button>
              )}

              {/* Free-pull: max reached notice */}
              {isFreePull && pulledCards && pulledCards.length >= freePullMax && allFlipped && !reading && (
                <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--muted)', marginBottom: '8px' }}>
                  {t('cards.maxReached')}
                </div>
              )}

              {/* Generate reading button — show after all cards flipped */}
              {allFlipped && !reading && (
                <button
                  style={{ ...s.actionBtn, opacity: generating ? 0.5 : 1 }}
                  onClick={handleGenerateReading}
                  disabled={generating}
                >
                  {generating ? t('cards.generating') : t('cards.generateReading')}
                </button>
              )}
            </>
          )}

          {/* Step 5: Show reading */}
          {reading && (
            <div ref={readingRef}>
              <div style={{ ...s.sectionLabel, marginTop: '8px' }}>Reading</div>
              <div
                style={s.reading}
                dangerouslySetInnerHTML={{ __html: reading }}
              />
              <button style={s.actionBtn} onClick={handleInsert}>
                {t('cards.insertReading')}
              </button>
            </div>
          )}

          {/* Start over */}
          {pulledCards && (
            <button style={s.ghostBtn} onClick={handleStartOver}>
              {t('cards.startOver')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
