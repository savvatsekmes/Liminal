import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';
import { useLanguage } from '../i18n/LanguageContext';
import ResizeDivider from '../components/ResizeDivider';

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  root: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  leftCol: {
    minWidth: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  leftInner: {
    padding: '32px 36px 80px',
    maxWidth: '600px',
    width: '100%',
  },
  rightCol: {
    minWidth: 0,
    flexShrink: 0,
    background: 'var(--near-white)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--strong)',
    marginBottom: '20px',
  },
  section: {
    marginBottom: '24px',
  },
  rule: {
    border: 'none',
    borderTop: '0.5px solid var(--strong)',
    margin: '24px 0',
    opacity: 0.15,
  },
  text: {
    fontSize: '13px',
    lineHeight: '1.8',
    color: 'var(--body)',
  },
  textMuted: {
    fontSize: '12px',
    color: 'var(--muted)',
    lineHeight: '1.7',
  },
  meaning: {
    fontSize: '13px',
    lineHeight: '1.8',
    color: 'var(--muted)',
    fontStyle: 'italic',
    marginTop: '16px',
  },
  conditionRow: {
    display: 'flex',
    gap: '24px',
    marginBottom: '16px',
    fontSize: '12px',
    lineHeight: '1.7',
  },
  conditionName: {
    width: '80px',
    flexShrink: 0,
    fontWeight: '600',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontSize: '10px',
    color: 'var(--strong)',
    paddingTop: '2px',
  },
  conditionDetail: {
    flex: 1,
    color: 'var(--body)',
    fontSize: '12px',
    lineHeight: '1.7',
  },
  retroLabel: {
    fontWeight: '600',
    color: 'var(--strong)',
    letterSpacing: '0.04em',
  },
  eventRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '8px',
    fontSize: '12px',
    lineHeight: '1.8',
  },
  eventDate: {
    width: '60px',
    flexShrink: 0,
    color: 'var(--muted)',
    fontVariantNumeric: 'tabular-nums',
  },
  eventDesc: {
    flex: 1,
    color: 'var(--body)',
  },
  entryRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '6px',
    fontSize: '12px',
    lineHeight: '1.8',
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  entryDate: {
    width: '60px',
    flexShrink: 0,
    color: 'var(--muted)',
    fontVariantNumeric: 'tabular-nums',
  },
  entryTitle: {
    flex: 1,
    color: 'var(--body)',
  },
  loading: {
    fontSize: '12px',
    color: 'var(--muted)',
    textAlign: 'center',
    padding: '60px 0',
    letterSpacing: '0.06em',
  },
  tabBar: {
    display: 'flex',
    gap: '0',
    marginBottom: '32px',
    borderBottom: '0.5px solid var(--border)',
  },
  tab: {
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    padding: '10px 20px',
    cursor: 'pointer',
    borderBottom: '1.5px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
    background: 'none',
    fontFamily: 'var(--font)',
  },
  tabActive: {
    color: 'var(--strong)',
    borderBottomColor: 'var(--strong)',
  },
  // Panel (right column) shared styles
  panelHeader: {
    padding: '20px 20px 14px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  panelHeaderLabel: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  panelHint: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    marginTop: '2px',
  },
  panelContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  },
  panelFooter: {
    padding: '14px 20px',
    borderTop: 'var(--border-style)',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  // Card tab styles
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
    padding: '10px 24px',
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
  },
  ghostBtn: {
    padding: '8px 16px',
    fontSize: '11px',
    color: 'var(--muted)',
    background: 'none',
    border: 'var(--border-style)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'color 0.12s, border-color 0.12s',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '20px',
    perspective: '1000px',
  },
  cardSlot: {
    width: 120,
    textAlign: 'center',
  },
  flipContainer: {
    width: 120,
    height: 205,
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
  reading: {
    fontSize: '13px',
    color: 'var(--strong)',
    lineHeight: '1.85',
    marginBottom: '16px',
    borderLeft: '2px solid var(--border)',
    paddingLeft: '16px',
  },
};

const CARD_BACK = '/cards/card-back.png';

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Moon Phase SVG ──────────────────────────────────────────────────────────

function MoonPhaseSVG({ illumination = 50, phase = '' }) {
  const size = 80;
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const fill = '#1A1A1A';

  const isWaning = phase.toLowerCase().includes('waning') || phase === 'Last Quarter';
  const isNew = phase === 'New Moon';
  const isFull = phase === 'Full Moon';
  const frac = illumination / 100;

  if (isNew) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={fill} strokeWidth="0.5" />
      </svg>
    );
  }

  if (isFull) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill={fill} />
      </svg>
    );
  }

  const terminatorX = r * Math.abs(2 * frac - 1);

  let d;
  if (!isWaning) {
    if (frac <= 0.5) {
      d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${terminatorX} ${r} 0 0 1 ${cx} ${cy - r}`;
    } else {
      d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${terminatorX} ${r} 0 0 0 ${cx} ${cy - r}`;
    }
  } else {
    if (frac <= 0.5) {
      d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${terminatorX} ${r} 0 0 0 ${cx} ${cy - r}`;
    } else {
      d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${terminatorX} ${r} 0 0 1 ${cx} ${cy - r}`;
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={fill} strokeWidth="0.5" opacity="0.15" />
      <path d={d} fill={fill} />
    </svg>
  );
}

// ── Generating Dots ─────────────────────────────────────────────────────────

function GeneratingDots({ label }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(iv);
  }, []);
  return <span>{label}{dots}</span>;
}

// ── Main Page ───────────────────────────────────────────────────────────────

const TABS = ['sky', 'cards'];

export default function SkyPage({ onNavigateEntry, initialTab, hideTabBar }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState(initialTab || 'sky');

  // Sync tab when parent changes initialTab
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  // ── Sky state ──
  const [skyData, setSkyData] = useState(null);
  const [events, setEvents] = useState(null);
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [skySummary, setSkySummary] = useState('');
  const [skyGenerating, setSkyGenerating] = useState(false);

  // ── Cards state ──
  const [decksData, setDecksData] = useState(null);
  const [deck, setDeck] = useState(null);
  const [spreadId, setSpreadId] = useState(null);
  const [pulledCards, setPulledCards] = useState(null);
  const [flipped, setFlipped] = useState([]);
  const [cardReading, setCardReading] = useState(null);
  const [cardGenerating, setCardGenerating] = useState(false);
  const [cardPlaying, setCardPlaying] = useState(false);
  const cardAudioRef = useRef(null);
  const shuffledDeckRef = useRef(null);
  const drawIndexRef = useRef(0);
  const readingRef = useRef(null);

  // ── Resizable split ──
  const contentRef = useRef(null);
  const [splitPct, setSplitPct] = useState(55);
  const startDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPct = splitPct;
    const contentW = contentRef.current?.offsetWidth || 1;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(evt) {
      const delta = evt.clientX - startX;
      const deltaPct = (delta / contentW) * 100;
      setSplitPct(Math.max(25, Math.min(75, startPct + deltaPct)));
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [splitPct]);

  // ── TTS ──
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const cancelRef = useRef(false);
  const cardCancelRef = useRef(false);

  // ── Load sky data ──
  useEffect(() => {
    Promise.all([
      apiFetch('/api/sky/current').then(r => r.json()),
      apiFetch('/api/sky/upcoming').then(r => r.json()),
      apiFetch('/api/sky/entries-this-cycle').then(r => r.json()),
    ])
      .then(([current, upcoming, cycleEntries]) => {
        setSkyData(current);
        setEvents(upcoming);
        setEntries(cycleEntries);
      })
      .catch((err) => console.error('[sky] load error:', err))
      .finally(() => setLoading(false));
  }, []);

  // ── Load card decks ──
  useEffect(() => {
    apiFetch('/api/cards/decks')
      .then(r => r.json())
      .then(setDecksData)
      .catch(() => {});
  }, []);

  const moon = skyData?.moon;
  const conditions = skyData?.conditions;

  const formatEventDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  };

  // ── Sky generate ──
  async function handleSkyGenerate() {
    setSkyGenerating(true);
    try {
      const res = await apiFetch('/api/sky/generate', { method: 'POST' });
      const data = await res.json();
      if (data.summary) {
        setSkySummary(data.summary);
        setSkyEditText(data.summary);
      }
    } catch (err) {
      console.error('[sky] generate error:', err);
    } finally {
      setSkyGenerating(false);
    }
  }

  // ── Sky TTS ──
  async function handleSkyListen() {
    if (playing) { stopSpeak(audioRef, cancelRef); setPlaying(false); return; }
    if (!skySummary) return;
    cancelRef.current = false;
    setPlaying(true);
    await streamSpeak(skySummary, audioRef, cancelRef);
    setPlaying(false);
  }

  // ── Card TTS ──
  async function handleCardListen() {
    if (cardPlaying) { stopSpeak(cardAudioRef, cardCancelRef); setCardPlaying(false); return; }
    if (!cardReading) return;
    const plainText = cardReading.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    cardCancelRef.current = false;
    setCardPlaying(true);
    await streamSpeak(plainText, cardAudioRef, cardCancelRef);
    setCardPlaying(false);
  }

  // ── Card pull logic ──
  const [pulling, setPulling] = useState(false);

  async function handlePull() {
    if (!decksData || !deck || !spreadId || pulling) return;
    const spread = decksData.spreads.find(sp => sp.id === spreadId);
    if (!spread) return;

    const deckCards = deck === 'tarot' ? decksData.tarot : decksData.oracle;
    const numCards = spread.cardCount === 0 ? 6 : spread.cardCount;

    setPulling(true);
    setCardReading(null);

    try {
      const res = await apiFetch('/api/cards/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deck, spread: spreadId, count: numCards }),
      });
      const data = await res.json();
      if (!data.cards?.length) throw new Error('No cards returned');
      const cards = data.cards.map((card, i) => {
        // Merge with full deck data (for images etc.)
        const fullCard = deckCards.find(c => c.id === card.id) || card;
        const isReversed = deck === 'tarot' ? !!card.reversed : false;
        return {
          ...fullCard,
          reversed: isReversed,
          reversed_meaning: fullCard.reversed, // preserve the meaning string
          position: card.position ? t(card.position) : (spread.cardCount === 0 ? `${t('cards.positionCard')} ${i + 1}` : t(spread.positions[i]?.labelKey)),
          image: fullCard.image || card.image,
        };
      });

      if (spread.cardCount === 0) {
        // Free pull — store remaining cards from LLM-guided shuffle for "pull another"
        // Request a larger batch and store extras
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
            setFlipped(prev => {
              const next = [...prev];
              next[i] = true;
              return next;
            });
          }, 400 + i * 350);
        });
      }
    } catch (err) {
      console.error('[cards] pull error, falling back to random:', err);
      // Fallback to local random
      if (spread.cardCount === 0) {
        const shuffled = shuffle(deckCards);
        shuffledDeckRef.current = shuffled;
        drawIndexRef.current = 1;
        const card = shuffled[0];
        setPulledCards([{ ...card, position: `${t('cards.positionCard')} 1`, reversed: deck === 'tarot' ? Math.random() < 0.5 : false }]);
        setFlipped([false]);
        setTimeout(() => setFlipped([true]), 400);
      } else {
        const shuffled = shuffle(deckCards);
        const drawn = shuffled.slice(0, spread.cardCount).map((card, i) => ({
          ...card,
          position: t(spread.positions[i].labelKey),
          reversed: deck === 'tarot' ? Math.random() < 0.5 : false,
        }));
        setPulledCards(drawn);
        setFlipped(new Array(drawn.length).fill(false));
        shuffledDeckRef.current = null;
        drawn.forEach((_, i) => {
          setTimeout(() => {
            setFlipped(prev => { const next = [...prev]; next[i] = true; return next; });
          }, 400 + i * 350);
        });
      }
    } finally {
      setPulling(false);
    }
  }

  async function handlePullAnother() {
    if (!pulledCards || pulling) return;
    const spread = decksData?.spreads.find(sp => sp.id === spreadId);
    const maxCards = spread?.maxCards || 12;
    if (pulledCards.length >= maxCards) return;

    const deckCards = deck === 'tarot' ? decksData.tarot : decksData.oracle;

    // Try to draw from pre-fetched batch first
    if (shuffledDeckRef.current && drawIndexRef.current < shuffledDeckRef.current.length) {
      const card = shuffledDeckRef.current[drawIndexRef.current];
      drawIndexRef.current += 1;
      const fullCard = deckCards.find(c => c.id === card.id) || card;
      const newCard = {
        ...fullCard,
        reversed: deck === 'tarot' ? !!card.reversed : false,
        reversed_meaning: fullCard.reversed,
        position: `${t('cards.positionCard')} ${pulledCards.length + 1}`,
        image: fullCard.image || card.image,
      };
      setPulledCards(prev => [...prev, newCard]);
      setFlipped(prev => [...prev, false]);
      setCardReading(null);
      setTimeout(() => {
        setFlipped(prev => { const next = [...prev]; next[next.length - 1] = true; return next; });
      }, 400);
      return;
    }

    // Fetch one more from LLM
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
        const newCard = {
          ...fullCard,
          reversed: deck === 'tarot' ? !!card.reversed : false,
          reversed_meaning: fullCard.reversed,
          position: `${t('cards.positionCard')} ${pulledCards.length + 1}`,
          image: fullCard.image || card.image,
        };
        setPulledCards(prev => [...prev, newCard]);
        setFlipped(prev => [...prev, false]);
        setCardReading(null);
        setTimeout(() => {
          setFlipped(prev => { const next = [...prev]; next[next.length - 1] = true; return next; });
        }, 400);
      }
    } catch (err) {
      console.error('[cards] pull another error:', err);
    } finally {
      setPulling(false);
    }
  }

  async function handleGenerateReading() {
    if (!pulledCards || cardGenerating) return;
    setCardGenerating(true);

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
        body: JSON.stringify({ deck, spread: spreadId, cards: cardsPayload, entryText: '' }),
      });
      const data = await res.json();
      if (data.reading) {
        setCardReading(data.reading);
        setTimeout(() => readingRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (err) {
      console.error('Card reading failed:', err);
    } finally {
      setCardGenerating(false);
    }
  }

  function handleStartOver() {
    setPulledCards(null);
    setFlipped([]);
    setCardReading(null);
    setSpreadId(null);
    setDeck(null);
    shuffledDeckRef.current = null;
    drawIndexRef.current = 0;
  }

  const availableSpreads = decksData?.spreads.filter(sp =>
    deck === 'oracle' ? !sp.tarotOnly : true
  ) || [];

  const allFlipped = flipped.length > 0 && flipped.every(Boolean);
  const currentSpread = spreadId ? decksData?.spreads.find(sp => sp.id === spreadId) : null;
  const isFreePull = currentSpread?.cardCount === 0;
  const freePullMax = currentSpread?.maxCards || 12;
  const canPullMore = isFreePull && pulledCards && pulledCards.length < freePullMax && allFlipped;

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div style={s.root} ref={contentRef}>

      {/* ── LEFT COLUMN ──────────────────────────────────────────────────── */}
      <div style={{ ...s.leftCol, width: `${splitPct}%` }}>
        <div style={s.leftInner}>

          {/* Tabs */}
          {!hideTabBar && (
            <div style={s.tabBar}>
              {TABS.map(t => (
                <button
                  key={t}
                  style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
                  onClick={() => setTab(t)}
                >
                  {t === 'sky' ? 'Sky' : 'Cards'}
                </button>
              ))}
            </div>
          )}

          {/* ── SKY TAB LEFT: sky data ──────────────────────────────────── */}
          {tab === 'sky' && loading && <div style={s.loading}>Calculating positions...</div>}
          {tab === 'sky' && !loading && !skyData && <div style={s.loading}>Unable to load sky data.</div>}

          {tab === 'sky' && !loading && skyData && (
            <>
              {/* Moon */}
              <div style={s.section}>
                <div style={s.sectionLabel}>Moon</div>
                <div style={{ display: 'flex', gap: '28px', alignItems: 'flex-start' }}>
                  <MoonPhaseSVG illumination={moon.illumination} phase={moon.phase} />
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--strong)', marginBottom: '4px' }}>
                      {moon.phase}
                    </div>
                    <div style={s.text}>{moon.illumination}% illuminated</div>
                    <div style={s.text}>Moon in {moon.moonSign}</div>
                    <div style={s.textMuted}>
                      {moon.daysSinceNewMoon != null && `${moon.daysSinceNewMoon} days into cycle`}
                      {moon.daysUntilNewMoon != null && ` · ${moon.daysUntilNewMoon} until next new moon`}
                    </div>
                    {moon.daysUntilFullMoon != null && moon.daysUntilFullMoon > 0 && (
                      <div style={s.textMuted}>
                        Next full moon in {moon.daysUntilFullMoon} {moon.daysUntilFullMoon === 1 ? 'day' : 'days'}
                        {moon.nextFullMoonSign && ` · ${moon.nextFullMoonSign}`}
                      </div>
                    )}
                    {moon.daysSinceFullMoon != null && moon.daysSinceFullMoon >= 0 && moon.daysSinceFullMoon <= 3 && moon.phase !== 'Full Moon' && (
                      <div style={s.textMuted}>
                        {moon.daysSinceFullMoon} {moon.daysSinceFullMoon === 1 ? 'day' : 'days'} past full moon
                      </div>
                    )}
                  </div>
                </div>
                <div style={s.meaning}>{moon.meaning}</div>
              </div>

              <hr style={s.rule} />

              {/* Planetary Conditions */}
              <div style={s.section}>
                <div style={s.sectionLabel}>Planetary Conditions</div>
                {conditions.map((c) => (
                  <div key={c.planet} style={s.conditionRow}>
                    <div style={s.conditionName}>{c.planet}</div>
                    <div style={s.conditionDetail}>
                      {c.retrograde ? (
                        <>
                          <span style={s.retroLabel}>Retrograde</span>
                          {c.retrogradeEnds && <span> until {c.retrogradeEnds}</span>}
                          {c.description && <div style={{ ...s.textMuted, marginTop: '4px' }}>{c.description}</div>}
                        </>
                      ) : (
                        <>
                          <span>In {c.sign}</span>
                          {c.signChangeDate && <span style={{ color: 'var(--muted)' }}> · moves to {c.nextSign}: {formatEventDate(c.signChangeDate)}</span>}
                          {c.nextRetrograde && (
                            <div style={s.textMuted}>Next retrograde: {formatEventDate(c.nextRetrograde)}</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <hr style={s.rule} />

              {/* Upcoming Events */}
              {events && events.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionLabel}>Coming Up</div>
                  {events.map((e, i) => (
                    <div key={i} style={s.eventRow}>
                      <div style={s.eventDate}>{formatEventDate(e.date)}</div>
                      <div style={s.eventDesc}>
                        {e.type}
                        {e.sign && <span style={{ color: 'var(--muted)' }}> · {e.sign}</span>}
                        {e.name && <span style={{ color: 'var(--muted)' }}> · {e.name}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <hr style={s.rule} />

              {/* Entries This Cycle */}
              <div style={s.section}>
                <div style={s.sectionLabel}>Your Entries This Moon Cycle</div>
                {entries && entries.length > 0 ? (
                  entries.map((e) => (
                    <div
                      key={e.id}
                      style={s.entryRow}
                      onClick={() => onNavigateEntry && onNavigateEntry(e.id)}
                      onMouseEnter={(ev) => { ev.currentTarget.style.color = 'var(--strong)'; }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.color = ''; }}
                    >
                      <div style={s.entryDate}>{formatEventDate(e.date || e.created_at)}</div>
                      <div style={s.entryTitle}>{e.title}</div>
                    </div>
                  ))
                ) : (
                  <div style={s.textMuted}>
                    No entries yet this cycle.{moon && ` The moon is in ${moon.moonSign}.`}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── CARDS TAB LEFT: settings ───────────────────────────────── */}
          {tab === 'cards' && (
            <>
              <div style={s.sectionLabel}>Deck</div>
              <div style={s.pillRow}>
                <button
                  style={{ ...s.pill, ...(deck === 'tarot' ? s.pillActive : {}) }}
                  onClick={() => { setDeck('tarot'); setSpreadId(null); setPulledCards(null); setCardReading(null); }}
                >
                  {t('cards.deckTarot')}
                </button>
                <button
                  style={{ ...s.pill, ...(deck === 'oracle' ? s.pillActive : {}) }}
                  onClick={() => { setDeck('oracle'); setSpreadId(null); setPulledCards(null); setCardReading(null); }}
                >
                  {t('cards.deckOracle')}
                </button>
              </div>

              {deck && (
                <>
                  <div style={s.sectionLabel}>Spread</div>
                  <div style={s.pillRow}>
                    {availableSpreads.map(sp => (
                      <button
                        key={sp.id}
                        style={{ ...s.pill, ...(spreadId === sp.id ? s.pillActive : {}) }}
                        onClick={() => { setSpreadId(sp.id); setPulledCards(null); setCardReading(null); }}
                      >
                        {t(sp.nameKey)}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {deck && spreadId && !pulledCards && (
                <button style={{ ...s.actionBtn, opacity: pulling ? 0.5 : 1 }} onClick={handlePull} disabled={pulling}>
                  {pulling ? t('cards.drawing') || 'Drawing…' : t('cards.pull')}
                </button>
              )}

              {pulledCards && (
                <div style={{ marginTop: '16px' }}>
                  <button style={s.ghostBtn} onClick={handleStartOver}>
                    {t('cards.startOver')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────────────────── */}
      <ResizeDivider onMouseDown={startDrag} inverted />

      {/* ── RIGHT COLUMN ─────────────────────────────────────────────────── */}
      <div style={{ ...s.rightCol, width: `${100 - splitPct}%` }}>

        {/* ── SKY TAB RIGHT: astrology summary panel ───────────────────── */}
        {tab === 'sky' && (
          <>
            <div style={s.panelHeader}>
              <div style={s.panelHeaderLabel}>Astrology Summary</div>
              <div style={s.panelHint}>Personalised to your chart & current sky</div>
            </div>
            <div style={s.panelContent}>
              {skyGenerating && (
                <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: '1.8' }}>
                  <GeneratingDots label="Reading the sky" />
                </div>
              )}
              {!skyGenerating && skySummary && (
                <p style={{ fontSize: '13px', lineHeight: '1.85', color: 'var(--strong)', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {skySummary}
                </p>
              )}
              {!skyGenerating && !skySummary && (
                <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: '1.7' }}>
                  Generate a personalised astrology reading based on the current sky and your birth chart.
                </div>
              )}
            </div>
            <div style={s.panelFooter}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1, fontSize: '12px', padding: '9px 0', opacity: skyGenerating ? 0.5 : 1 }}
                  onClick={handleSkyGenerate}
                  disabled={skyGenerating}
                >
                  {skyGenerating ? 'Generating...' : skySummary ? 'Regenerate' : 'Generate'}
                </button>
                <button
                  onClick={handleSkyListen}
                  title={playing ? 'Stop' : 'Read aloud'}
                  type="button"
                  disabled={!skySummary || skyGenerating}
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '20px',
                    border: 'none',
                    background: playing ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
                    color: playing ? 'var(--strong)' : 'var(--muted)',
                    cursor: (!skySummary || skyGenerating) ? 'default' : 'pointer',
                    transition: 'color 0.15s, background 0.15s',
                    flexShrink: 0,
                    opacity: (!skySummary || skyGenerating) ? 0.35 : 1,
                    boxShadow: playing
                      ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                      : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
                  }}
                >
                  <WaveformIcon playing={playing} />
                </button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5', marginTop: '2px' }}>
                Based on current planetary positions and your portrait data.
              </div>
            </div>
          </>
        )}

        {/* ── CARDS TAB RIGHT: pulled cards + reading ──────────────────── */}
        {tab === 'cards' && (
          <>
            <div style={s.panelHeader}>
              <div style={s.panelHeaderLabel}>Reading</div>
              <div style={s.panelHint}>Your pulled cards and interpretation</div>
            </div>
            <div style={s.panelContent}>
              {!pulledCards && (
                <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: '1.7' }}>
                  Choose a deck and spread, then pull cards to begin your reading.
                </div>
              )}

              {pulledCards && (
                <>
                  {/* Card display */}
                  <div style={s.cardRow}>
                    {pulledCards.map((card, i) => (
                      <div key={i} style={s.cardSlot}>
                        <div style={s.flipContainer}>
                          <div style={{
                            ...s.flipInner,
                            transform: flipped[i] ? 'rotateY(180deg)' : 'rotateY(0deg)',
                          }}>
                            <div style={s.flipFace}>
                              <img src={CARD_BACK} alt="Card back" style={s.cardImg} />
                            </div>
                            <div style={{ ...s.flipFace, transform: 'rotateY(180deg)' }}>
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
                                <div style={s.oracleCard}>
                                  <div style={s.oracleDiamond} />
                                  <div style={s.oracleName}>{card.name}</div>
                                  <div style={s.oracleMeaning}>{card.meaning}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {flipped[i] && (
                          <div style={{ opacity: 1, transition: 'opacity 0.3s' }}>
                            <div style={s.cardPosition}>{card.position}</div>
                            <div style={s.cardName}>{card.name}</div>
                            {card.reversed && <span style={s.reversed}>{t('cards.reversed')}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Free-pull: pull another */}
                  {canPullMore && !cardReading && (
                    <button
                      style={{ ...s.ghostBtn, width: '100%', marginBottom: '8px' }}
                      onClick={handlePullAnother}
                    >
                      + {t('cards.pullAnother')}
                    </button>
                  )}

                  {/* Free-pull max reached */}
                  {isFreePull && pulledCards.length >= freePullMax && allFlipped && !cardReading && (
                    <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--muted)', marginBottom: '8px' }}>
                      {t('cards.maxReached')}
                    </div>
                  )}

                  {/* Reading */}
                  {cardReading && (
                    <div ref={readingRef} style={{ marginTop: '16px' }}>
                      <div style={{ ...s.sectionLabel, marginBottom: '12px' }}>Reading</div>
                      <div
                        style={s.reading}
                        dangerouslySetInnerHTML={{ __html: cardReading }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={s.panelFooter}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="btn-primary"
                  style={{ flex: 1, fontSize: '12px', padding: '9px 0', opacity: (!allFlipped || cardGenerating) ? 0.5 : 1 }}
                  onClick={handleGenerateReading}
                  disabled={!allFlipped || cardGenerating}
                >
                  {cardGenerating ? 'Generating...' : cardReading ? 'Regenerate' : 'Generate Reading'}
                </button>
                <button
                  onClick={handleCardListen}
                  title={cardPlaying ? 'Stop' : 'Read aloud'}
                  type="button"
                  disabled={!cardReading || cardGenerating}
                  style={{
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '20px',
                    border: 'none',
                    background: cardPlaying ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
                    color: cardPlaying ? 'var(--strong)' : 'var(--muted)',
                    cursor: (!cardReading || cardGenerating) ? 'default' : 'pointer',
                    transition: 'color 0.15s, background 0.15s',
                    flexShrink: 0,
                    opacity: (!cardReading || cardGenerating) ? 0.35 : 1,
                    boxShadow: cardPlaying
                      ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                      : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
                  }}
                >
                  <WaveformIcon playing={cardPlaying} />
                </button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5', marginTop: '2px' }}>
                {!pulledCards ? 'Pull cards to generate a reading.' : !allFlipped ? 'Waiting for cards to reveal...' : 'Reading based on your cards and portrait.'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Waveform Icon ───────────────────────────────────────────────────────────

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
