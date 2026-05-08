import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react';
import { apiFetch } from '../utils/api';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';
import MicButton from '../components/MicButton';
import { useDictation } from '../hooks/useDictation';
import { useLanguage } from '../i18n/LanguageContext';
import { getDailyQuote, loadPool } from '../data/quotes';
import { getHomeStrings } from '../data/homeStrings';
import { BUILT_IN_ARCHETYPES } from '../constants/archetypes';
import ArchetypeAvatar from '../components/ArchetypeAvatar';
import { useLayout, WIDGET_LABELS } from '../hooks/useLayout';
import { useIsMobile } from '../hooks/useIsMobile';
import LayoutEditor from '../components/LayoutEditor';
import ThemeToggle from '../components/ThemeToggle';
import SearchPopup from '../components/SearchPopup';
import { useFirstTourTrigger } from '../components/TutorialContext';
import { useTheme } from '../hooks/useTheme';
import WidgetWrapper from '../components/WidgetWrapper';
import { DndContext, pointerWithin, rectIntersection, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';

function getDailyPrompt(prompts) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  return prompts[dayOfYear % prompts.length];
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = {
  root: {
    flex: 1,
    overflowY: 'auto',
    padding: '48px 48px 80px',
  },
  inner: {
    maxWidth: '100%',
  },
  greeting: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--strong)',
    marginBottom: '6px',
  },
  greetingDate: {
    fontSize: '13px',
    color: 'var(--muted)',
    marginBottom: '0',
  },
  quoteBlock: {
    marginBottom: '24px',
    paddingLeft: '14px',
    borderLeft: '2px solid var(--border)',
  },
  quoteText: {
    fontSize: '14px',
    fontStyle: 'italic',
    color: '#555555',
    lineHeight: '1.8',
    display: 'block',
    marginBottom: '4px',
  },
  // Activity + Portrait row
  activityPortraitRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '28px',
  },
  beveledSquare: {
    background: 'var(--near-white)',
    border: 'none',
    borderRadius: '16px',
    padding: '16px 20px',
    minWidth: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  statsTable: {
    display: 'grid',
    gridTemplateColumns: 'minmax(110px, max-content) minmax(120px, max-content) minmax(130px, max-content) minmax(160px, 1fr) auto auto',
    gap: '0',
    alignItems: 'center',
    overflow: 'hidden',
  },
  statsCell: {
    padding: '14px 16px 14px 24px',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  statsCellLabel: {
    padding: '10px 10px',
    paddingRight: '14px',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  statsCellLatest: {
    padding: '14px 16px 14px 24px',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  statsCellDate: {
    padding: '14px 16px 14px 24px',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  statsRowBorder: {
    gridColumn: '1 / -1',
    borderTop: 'var(--border-style)',
    margin: '4px 0',
  },
  insightValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--strong)',
    lineHeight: 1.3,
  },
  insightLabel: {
    fontSize: '10px',
    color: 'var(--muted)',
    letterSpacing: '0.04em',
  },
  insightDivider: {
    width: '1px',
    background: 'var(--border)',
    alignSelf: 'stretch',
    minHeight: '28px',
  },
  newLinkInline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'var(--font)',
    padding: '0 12px',
    borderRight: '1px solid var(--border)',
    alignSelf: 'stretch',
    flexShrink: 0,
    textAlign: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsArrow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    padding: '0 8px',
    fontSize: '16px',
    color: 'var(--muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'var(--font)',
    transition: 'color 0.12s',
  },
  newLinkValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--strong)',
    lineHeight: 1,
  },
  newLinkLabel: {
    fontSize: '10px',
    color: 'var(--muted)',
    letterSpacing: '0.04em',
  },
  // Moon + Daily Card row
  moonCardRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '28px',
  },
  moonCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    border: 'none',
    borderRadius: '16px',
    padding: '16px 20px',
    background: 'var(--near-white)',
    minWidth: 0,
    boxSizing: 'border-box',
    height: '100%',
    overflow: 'hidden',
    flexWrap: 'wrap',
  },
  moonInfo: {
    flex: 2,
    minWidth: 0,
  },
  moonPhase: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--strong)',
    marginBottom: '2px',
  },
  moonDetail: {
    fontSize: '11px',
    color: 'var(--muted)',
    lineHeight: '1.5',
  },
  moonMeaning: {
    fontSize: '11px',
    color: 'var(--body)',
    fontStyle: 'italic',
    lineHeight: '1.5',
    marginTop: '4px',
  },
  // Daily card panel
  dailyCardPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    border: 'none',
    borderRadius: '16px',
    padding: '16px 20px',
    background: 'var(--near-white)',
    minWidth: 0,
    boxSizing: 'border-box',
    height: '100%',
    overflow: 'hidden',
    flexWrap: 'wrap',
  },
  dailyFlipContainer: {
    width: 110,
    height: 188,
    perspective: '800px',
    flexShrink: 0,
  },
  dailyFlipInner: {
    position: 'relative',
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    transition: 'transform 0.7s ease',
  },
  dailyFlipFace: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
    borderRadius: '4px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  dailyCardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  dailyOracleCard: {
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
  dailyOracleDiamond: {
    width: 10,
    height: 10,
    background: '#d4af37',
    transform: 'rotate(45deg)',
    marginBottom: '6px',
    flexShrink: 0,
  },
  dailyOracleName: {
    fontSize: '8px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    lineHeight: '1.3',
  },
  dailyCardInfo: {
    flexShrink: 0,
  },
  dailyCardLabel: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '2px',
  },
  dailyCardName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--strong)',
    marginBottom: '4px',
    lineHeight: '1.3',
  },
  dailyCardMeaning: {
    fontSize: '10px',
    color: 'var(--muted)',
    lineHeight: '1.5',
    marginBottom: '4px',
  },
  dailyCardDivider: {
    width: '1px',
    height: 137,
    background: 'var(--border)',
    flexShrink: 0,
    marginLeft: '40px',
  },
  dailyCardReading: {
    flex: 2,
    fontSize: '14px',
    color: 'var(--body)',
    fontStyle: 'italic',
    lineHeight: '1.7',
    minWidth: 0,
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '8px',
  },
  cardActionBtn: {
    fontSize: '11px',
    fontFamily: 'var(--font)',
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    transition: 'color 0.15s',
    letterSpacing: '0.02em',
  },
  cardSpeakBtn: {
    marginTop: '6px',
    alignSelf: 'flex-start',
    fontSize: '9px',
    fontFamily: 'var(--font)',
    letterSpacing: '0.04em',
    color: 'var(--muted)',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '3px 10px',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
  },
  dailyCardInsight: {
    fontSize: '10px',
    color: 'var(--body)',
    fontStyle: 'italic',
    lineHeight: '1.5',
  },
  moonDivider: {
    width: '1px',
    background: 'var(--border)',
    alignSelf: 'stretch',
  },
  conditionsInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    flex: 2,
    minWidth: 0,
  },
  conditionRow: {
    display: 'flex',
    gap: '6px',
    fontSize: '11px',
    lineHeight: '1.4',
  },
  conditionPlanet: {
    fontWeight: '600',
    color: 'var(--strong)',
    width: '52px',
    flexShrink: 0,
  },
  conditionSign: {
    color: 'var(--muted)',
  },
  moonArrow: {
    fontSize: '22px',
    color: 'var(--muted)',
    flexShrink: 0,
    lineHeight: 1,
  },
  moonArrowLink: {
    fontSize: '22px',
    color: 'var(--muted)',
    flexShrink: 0,
    lineHeight: 1,
    cursor: 'pointer',
    transition: 'color 0.15s',
    padding: '4px',
  },
  // Portrait pill
  portraitPill: {
    background: 'var(--near-white)',
    border: 'none',
    borderRadius: '16px',
    padding: '28px 34px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    minWidth: 0,
    boxSizing: 'border-box',
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    height: '100%',
    overflow: 'hidden',
    flexWrap: 'wrap',
  },
  portraitContent: {
    flex: 1,
    minWidth: 0,
  },
  portraitHeader: {
    marginBottom: '14px',
  },
  portraitLabel: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  portraitGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px 16px',
  },
  portraitItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  portraitItemLabel: {
    fontSize: '10px',
    color: 'var(--muted)',
    letterSpacing: '0.04em',
  },
  portraitItemValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--strong)',
  },
  // Quick Ask
  sectionTitle: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '10px',
  },
  suggestedRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '28px',
  },
  suggestedPill: {
    fontSize: '12px',
    color: 'var(--body)',
    border: 'var(--border-style)',
    borderRadius: '20px',
    padding: '7px 14px',
    cursor: 'pointer',
    background: 'var(--white)',
    transition: 'color 0.12s, border-color 0.12s, background 0.12s',
    fontFamily: 'var(--font)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  askCard: {
    border: 'var(--border-style)',
    borderRadius: '16px',
    background: 'var(--white)',
    marginBottom: '14px',
    overflow: 'visible',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  textarea: {
    width: '100%',
    fontSize: '14px',
    padding: '18px 20px 10px',
    border: 'none',
    background: 'transparent',
    color: 'var(--strong)',
    outline: 'none',
    fontFamily: 'var(--font)',
    lineHeight: '1.6',
    resize: 'none',
    minHeight: '60px',
    maxHeight: '200px',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  askCardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px 12px',
    gap: '8px',
  },
  charBtn: {
    width: '32px',
    height: '32px',
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
    top: '42px',
    right: 0,
    background: 'var(--white)',
    borderRadius: '12px',
    padding: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
    zIndex: 50,
    minWidth: '160px',
    maxHeight: '60vh',
    overflowY: 'auto',
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
  askBtn: {
    padding: '7px 16px',
    fontSize: '12px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '20px',
    background: 'var(--strong)',
    color: 'var(--white)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font)',
    flexShrink: 0,
    transition: 'opacity 0.12s',
  },
  // Response card
  responseCard: {
    marginTop: '24px',
    border: 'var(--border-style)',
    borderRadius: '16px',
    padding: '22px 24px',
    background: 'var(--near-white)',
  },
  responseHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  responseQuestion: {
    fontSize: '12px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    flex: 1,
  },
  responseArchPill: {
    fontSize: '10px',
    color: 'var(--muted)',
    border: 'var(--border-style)',
    borderRadius: '20px',
    padding: '2px 10px',
    flexShrink: 0,
  },
  regenBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '3px',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '13px',
    flexShrink: 0,
    transition: 'color 0.12s',
  },
  responseBody: {
    fontSize: '13px',
    color: 'var(--body)',
    lineHeight: '1.85',
    whiteSpace: 'pre-wrap',
  },
  responseActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '16px',
    paddingTop: '14px',
    borderTop: 'var(--border-style)',
  },
  actionLink: {
    fontSize: '11px',
    color: 'var(--muted)',
    cursor: 'pointer',
    transition: 'color 0.12s',
    fontFamily: 'var(--font)',
    background: 'none',
    border: 'none',
    padding: 0,
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
  savedMsg: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontStyle: 'italic',
  },
  loadingDots: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    padding: '12px 0',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--muted)',
  },
  // Pulse
  pulseBlock: {
    marginBottom: '24px',
    paddingLeft: '14px',
    borderLeft: '2px solid var(--border)',
  },
  pulseText: {
    fontSize: '14px',
    fontStyle: 'italic',
    color: '#555555',
    lineHeight: '1.8',
    marginBottom: '4px',
  },
  pulseAttribution: {
    fontSize: '11px',
    color: 'var(--muted)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  pulseSpeaker: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    padding: '2px',
    transition: 'color 0.15s',
  },
  // Themes + Rhythm row
  themesRhythmRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '28px',
  },
  themesRhythmPill: {
    background: 'var(--near-white)',
    border: 'none',
    borderRadius: '16px',
    padding: '20px 28px',
    flex: 1,
  },
  themesHalf: {
    flex: '0 0 39%',
    minWidth: 0,
  },
  rhythmHalf: {
    flex: 1,
    minWidth: 0,
  },
  themesHeader: {
    marginBottom: '10px',
  },
  themesLabel: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  themesPeriod: {
    fontSize: '9px',
    color: 'var(--muted)',
    opacity: 0.6,
  },
  themesRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  themePill: {
    padding: '4px 14px',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    fontSize: '11px',
    color: 'var(--body)',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  // Insight
  insightBlock: {
    marginBottom: '24px',
    paddingLeft: '14px',
    borderLeft: '2px solid var(--border)',
  },
  insightHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  insightRefresh: {
    fontSize: '10px',
    fontFamily: 'var(--font)',
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.15s',
  },
  insightBody: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  insightText: {
    fontSize: '14px',
    fontStyle: 'italic',
    color: '#555555',
    lineHeight: '1.8',
    flex: 1,
  },
  // Rhythm (inside combined pill)
  rhythmHeader: {
    marginBottom: '10px',
  },
  rhythmLabel: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  rhythmPeriod: {
    fontSize: '9px',
    color: 'var(--muted)',
    opacity: 0.6,
  },
  rhythmRows: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
    flex: 1,
  },
  rhythmDot: {
    width: '7px',
    height: '7px',
    minWidth: '7px',
    minHeight: '7px',
    borderRadius: '50%',
  },
  // Sky widget
  skyWidget: {
    marginBottom: '28px',
  },
  skyWidgetHeader: {
    marginBottom: '10px',
  },
  skyWidgetLabel: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  skyWidgetBody: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    border: 'var(--border-style)',
    borderRadius: '16px',
    padding: '14px 20px',
    background: 'var(--near-white)',
  },
  skyWidgetInfo: {
    flex: 1,
    minWidth: 0,
  },
};

const DOT_SIZE = 7;
const DOT_GAP = 5;
const RHYTHM_ROWS = 3;

function RhythmGrid({ rhythm }) {
  const ref = useRef(null);
  const [perRow, setPerRow] = useState(0);

  const measure = useCallback(() => {
    if (!ref.current) return;
    const width = ref.current.offsetWidth;
    setPerRow(Math.floor((width + DOT_GAP) / (DOT_SIZE + DOT_GAP)));
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure]);

  const visible = perRow > 0 ? rhythm.slice(-(perRow * RHYTHM_ROWS)) : rhythm;

  return (
    <div ref={ref} style={s.rhythmRows}>
      {visible.map((day) => (
        <div
          key={day.date}
          style={{
            ...s.rhythmDot,
            background: day.wrote ? 'var(--strong)' : 'transparent',
            border: day.wrote ? '1.5px solid var(--strong)' : '1.5px solid var(--border)',
          }}
          title={`${day.date}${day.title ? ' — ' + day.title : ''}`}
        />
      ))}
    </div>
  );
}

function getGreeting(name, greetings, lang) {
  const h = new Date().getHours();
  let pool;
  if (h >= 5 && h < 12) pool = greetings.morning;
  else if (h >= 12 && h < 14) pool = greetings.midday || greetings.afternoon;
  else if (h >= 14 && h < 17) pool = greetings.afternoon;
  else if (h >= 17 && h < 21) pool = greetings.evening;
  else pool = greetings.night;

  const storageKey = `liminal_greeting_${lang}`;
  const stored = sessionStorage.getItem(storageKey);
  if (stored) return stored.replace('{name}', name);

  const greeting = pool[Math.floor(Math.random() * pool.length)];
  sessionStorage.setItem(storageKey, greeting);
  return greeting.replace('{name}', name);
}

function formatRelativeDate(dateStr, t) {
  if (!dateStr) return '—';
  try {
    const normalised = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
    const d = new Date(normalised.length === 10 ? normalised + 'T00:00:00' : normalised);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return t('common.today');
    if (diffDays === 1) return t('common.yesterday');
    if (diffDays < 7) return t('common.daysAgo').replace('{count}', diffDays);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

// Pick n random items from arr, stable per session via seed
function pickRandom(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export default function HomePage({ username, avatarUrl, layoutPreference, onNavigateToEntry, onNavigateToNote, onNavigateToOracle, onNavigateToSky, onNavigateToCards, onNavigateToPortrait, onNavigateToThreads, onNewEntry, onNewNote, onNewConversation, onLogout, onLock, onNavigateToSettings }) {
  useFirstTourTrigger('home');
  const { t, lang } = useLanguage();
  const isMobile = useIsMobile();
  const layout = useLayout(isMobile, layoutPreference);
  const { theme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Weather
  const [weather, setWeather] = useState(null);

  // Moon & sky
  const [moon, setMoon] = useState(null);
  const [conditions, setConditions] = useState(null);

  // Portrait calculated data
  const [portrait, setPortrait] = useState(null);
  const [portraitSnippet, setPortraitSnippet] = useState(null);
  // display_name from Settings, falls back to username
  const [settingsDisplayName, setSettingsDisplayName] = useState('');
  const displayName = settingsDisplayName || username || '';

  // Live-update display name when Settings save fires
  useEffect(() => {
    function onChange(e) {
      const s = e.detail || {};
      if (typeof s.display_name === 'string') setSettingsDisplayName(s.display_name);
    }
    window.addEventListener('liminal:settings-changed', onChange);
    return () => window.removeEventListener('liminal:settings-changed', onChange);
  }, []);

  // Daily card
  const [dailyCard, setDailyCard] = useState(null);
  const [cardFlipped, setCardFlipped] = useState(false);

  // Stats
  const [entryCount, setEntryCount] = useState(null);
  const [lastEntryDate, setLastEntryDate] = useState(null);
  const [latestEntryTitle, setLatestEntryTitle] = useState(null);
  const [latestEntryId, setLatestEntryId] = useState(null);
  const [noteCount, setNoteCount] = useState(null);
  const [userQuotes, setUserQuotes] = useState([]);
  const [lastNoteDate, setLastNoteDate] = useState(null);
  const [latestNoteTitle, setLatestNoteTitle] = useState(null);
  const [latestNoteId, setLatestNoteId] = useState(null);
  const [oracleCount, setOracleCount] = useState(null);
  const [lastOracleDate, setLastOracleDate] = useState(null);
  const [latestOraclePreview, setLatestOraclePreview] = useState(null);
  const [latestOracleSessionId, setLatestOracleSessionId] = useState(null);

  // Quick Ask state
  const [question, setQuestion] = useState('');
  // Quick Action mode: the textarea on the home page is a 3-way input.
  // 'entry' / 'note' create a new journal entry / note seeded with the typed
  // text; 'ask' kicks off an inline ask-the-oracle response in place.
  const [quickMode, setQuickMode] = useState('entry');
  const [archetype, setArchetype] = useState('Auto');
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const [customArchetypesList, setCustomArchetypesList] = useState([]);
  const archetypeRef = useRef(null);

  // Response state
  const [answer, setAnswer] = useState(null);
  const [answeredArchetype, setAnsweredArchetype] = useState('');
  const [answeredQuestion, setAnsweredQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  // TTS
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const cancelRef = useRef(false);
  const [cardPlaying, setCardPlaying] = useState(false);
  const cardAudioRef = useRef(null);
  const cardCancelRef = useRef(false);
  const [cardSaved, setCardSaved] = useState(false);

  const [snippetPlaying, setSnippetPlaying] = useState(false);
  const snippetAudioRef = useRef(null);
  const snippetCancelRef = useRef(false);
  const [snippetSaved, setSnippetSaved] = useState(false);

  // Pulse, Insight, Themes, Rhythm
  const [pulse, setPulse] = useState(null);
  const [pulseDays, setPulseDays] = useState('');
  const [insight, setInsight] = useState(null);
  const [themes, setThemes] = useState([]);
  const [rhythm, setRhythm] = useState([]);
  const [goals, setGoals] = useState([]);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => { setAvatarFailed(false); }, [avatarUrl]);
  const [avatarPopoutOpen, setAvatarPopoutOpen] = useState(false);
  const avatarPopoutRef = useRef(null);
  useEffect(() => {
    if (!avatarPopoutOpen) return;
    function handle(e) {
      if (avatarPopoutRef.current && !avatarPopoutRef.current.contains(e.target)) {
        setAvatarPopoutOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [avatarPopoutOpen]);
  const avatarPopout = avatarPopoutOpen ? (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50,
      minWidth: '180px', background: 'var(--white)', border: 'var(--border-style)',
      borderRadius: '10px', boxShadow: '0 6px 20px rgba(0,0,0,0.10)', padding: '6px 0',
      fontFamily: 'var(--font)',
    }}>
      <button
        style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', fontSize: '13px', color: 'var(--body)', cursor: 'pointer', fontFamily: 'var(--font)' }}
        onClick={() => { setAvatarPopoutOpen(false); onNavigateToSettings?.(); }}
      >
        {t('nav.settings')}
      </button>
      <button
        style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', fontSize: '13px', color: 'var(--body)', cursor: 'pointer', fontFamily: 'var(--font)' }}
        onClick={() => { setAvatarPopoutOpen(false); onLock?.(); }}
      >
        Lock
      </button>
      <div style={{ borderTop: 'var(--border-style)', margin: '4px 0' }} />
      <button
        style={{ width: '100%', textAlign: 'left', padding: '8px 16px', background: 'none', border: 'none', fontSize: '13px', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)' }}
        onClick={() => { setAvatarPopoutOpen(false); onLogout?.(); }}
      >
        {t('nav.logout')}
      </button>
    </div>
  ) : null;
  const [sky, setSky] = useState(null);
  const [tagged, setTagged] = useState({});
  const [lookbackEntries, setLookbackEntries] = useState([]);
  const [lookbackShuffleKey, setLookbackShuffleKey] = useState(0);
  const [threadsList, setThreadsList] = useState([]);
  const [insightPlaying, setInsightPlaying] = useState(false);
  const insightAudioRef = useRef(null);
  const insightCancelRef = useRef(false);
  const [pulsePlaying, setPulsePlaying] = useState(false);
  const pulseAudioRef = useRef(null);
  const pulseCancelRef = useRef(false);
  const [quotePlaying, setQuotePlaying] = useState(false);
  const quoteAudioRef = useRef(null);
  const quoteCancelRef = useRef(false);
  const [quoteSaved, setQuoteSaved] = useState(false);
  // Quote pool is now dynamic-imported per language to keep the main bundle
  // small. We render nothing in the quote widget until the pool resolves.
  const [quotePoolReady, setQuotePoolReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setQuotePoolReady(false);
    loadPool(lang).then(() => { if (!cancelled) setQuotePoolReady(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [lang]);
  const [pulseSaved, setPulseSaved] = useState(false);
  const [insightSaved, setInsightSaved] = useState(false);

  const homeStrings = useMemo(() => getHomeStrings(lang), [lang]);

  // Daily Quick Action placeholder, scoped to the current mode. Each mode has
  // its own prompt pool in homeStrings; we pick today's index out of the
  // active list so the textarea hint matches what pressing Enter will do.
  const dailyPrompt = useMemo(() => {
    const pool = quickMode === 'entry'
      ? homeStrings.quickEntryPrompts
      : quickMode === 'note'
        ? homeStrings.quickNotePrompts
        : homeStrings.quickAskPrompts;
    return getDailyPrompt(pool || homeStrings.quickAskPrompts);
  }, [homeStrings, quickMode]);

  const textareaRef = useRef(null);
  const greetingRowRef = useRef(null);
  const [rowHeight, setRowHeight] = useState(null);
  const { isRecording: isDictating, isProcessing: isDictatingProcessing, toggle: toggleDictation } = useDictation((text) => {
    setQuestion((prev) => prev + (prev.trim() ? ' ' : '') + text);
  });

  // Load entry stats + portrait archetypes + TTS status
  useEffect(() => {
    apiFetch('/api/entries').then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) {
        setEntryCount(data.length);
        if (data.length > 0) {
          const first = data[0];
          setLastEntryDate(first.date || first.created_at);
          setLatestEntryTitle(first.title || null);
          setLatestEntryId(first.id);
        }
      }
    }).catch(() => {});

    apiFetch('/api/notes').then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) {
        setNoteCount(data.length);
        if (data.length > 0) {
          const note = data[0];
          setLastNoteDate(note.created_at);
          setLatestNoteId(note.id);
          const preview = (note.title || '').trim() || (note.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const typePrefix = note.type ? note.type.charAt(0).toUpperCase() + note.type.slice(1) + ' — ' : '';
          setLatestNoteTitle(preview ? `${typePrefix}${preview.slice(0, 40)}` : (note.type ? typePrefix + 'Untitled' : 'Untitled'));
        }
        // Pull user-authored quotes (notes of type "quote") into the daily
        // quote pool — strip HTML, drop empties, use attribution as author.
        const quotes = data
          .filter((n) => n.type === 'quote')
          .map((n) => ({
            text: (n.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            author: (n.attribution || '').trim(),
          }))
          .filter((q) => q.text);
        setUserQuotes(quotes);
      }
    }).catch(() => {});

    apiFetch('/api/oracle/sessions').then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) {
        setOracleCount(data.length);
        if (data.length > 0) {
          setLastOracleDate(data[0].created_at);
          setLatestOracleSessionId(data[0].id);
          const preview = data[0].first_message || data[0].title || null;
          setLatestOraclePreview(preview ? `${data[0].archetype} — ${preview.slice(0, 30)}` : null);
        }
      }
    }).catch(() => {});

    apiFetch('/api/settings').then((r) => r.json()).then((s) => {
      if (s && typeof s.display_name === 'string') setSettingsDisplayName(s.display_name);
    }).catch(() => {});

    apiFetch('/api/portrait').then((r) => r.json()).then((p) => {
      if (p) {
        setPortrait(p);
        try {
          const active = JSON.parse(p.active_archetypes || '[]');
          if (active.length) setArchetype(active[0]);
        } catch {}
        try {
          const custom = Array.isArray(p.custom_archetypes) ? p.custom_archetypes : JSON.parse(p.custom_archetypes || '[]');
          if (custom.length) setCustomArchetypesList(custom);
        } catch {}
      }
    }).catch(() => {});


    apiFetch('/api/sky/current').then(r => r.json()).then(data => {
      if (data?.moon) setMoon(data.moon);
      if (data?.conditions) setConditions(data.conditions);
    }).catch(() => {});

    apiFetch('/api/cards/daily').then(r => r.json()).then(card => {
      if (card?.name) {
        // If cached card is missing the reading, refresh it
        if (!card.reading) {
          return apiFetch('/api/cards/daily?refresh=1').then(r => r.json()).then(fresh => {
            if (fresh?.name) {
              setDailyCard(fresh);
              setTimeout(() => setCardFlipped(true), 800);
            }
          });
        }
        setDailyCard(card);
        setTimeout(() => setCardFlipped(true), 800);
      }
    }).catch(() => {});

    // Pulse
    apiFetch('/api/home/pulse').then(r => r.json()).then(data => {
      if (data?.pulse) { setPulse(data.pulse); setPulseDays(data.daysLabel || ''); }
    }).catch(() => {});

    // Themes
    apiFetch('/api/home/themes').then(r => r.json()).then(data => {
      if (data?.themes) setThemes(data.themes);
    }).catch(() => {});

    // Insight
    apiFetch('/api/home/insight').then(r => r.json()).then(data => {
      if (data?.insight) setInsight(data.insight);
    }).catch(() => {});

    // Rhythm
    apiFetch('/api/home/rhythm').then(r => r.json()).then(data => {
      if (data?.rhythm) setRhythm(data.rhythm);
    }).catch(() => {});

    // Goals
    apiFetch('/api/home/goals').then(r => r.json()).then(data => {
      if (data?.goals) setGoals(data.goals);
    }).catch(() => {});

    apiFetch('/api/home/portrait-snippet').then(r => r.json()).then(data => {
      if (data?.snippet) setPortraitSnippet(data.snippet);
    }).catch(() => {});

    apiFetch('/api/home/weather').then(r => r.json()).then(data => {
      if (data?.weather) setWeather(data.weather);
    }).catch(() => {});

    // Today's Sky widget
    apiFetch('/api/home/sky').then(r => r.json()).then(data => {
      if (data) setSky(data);
    }).catch(() => {});
  }, []);

  // Tag widget configs — id → backend source + tag
  const TAG_WIDGET_CONFIG = {
    gratitude:    { source: 'entries', tag: 'gratitude' },
    dreams:       { source: 'entries', tag: 'dream' },
    reading:      { source: 'notes',   tag: 'reading' },
    bucket:       { source: 'notes',   tag: 'bucket' },
    affirmations: { source: 'notes',   tag: 'affirmation' },
    questions:    { source: 'notes',   tag: 'question' },
  };

  // Lazy-load each tag widget's data when it appears in the active layout
  useEffect(() => {
    const visible = layout.currentLayout.map(w => w.id).filter(id => TAG_WIDGET_CONFIG[id]);
    visible.forEach(id => {
      if (tagged[id]) return;
      const { source, tag } = TAG_WIDGET_CONFIG[id];
      apiFetch(`/api/home/tagged?source=${source}&tag=${tag}&limit=5`)
        .then(r => r.json())
        .then(data => setTagged(prev => ({ ...prev, [id]: data.items || [] })))
        .catch(() => {});
    });
  }, [layout.currentLayout]);

  // Lookback widget — random past entries. Refetches when lookbackShuffleKey
  // bumps so the Shuffle action cycles through different selections.
  useEffect(() => {
    const has = layout.currentLayout.some(w => w.id === 'lookback');
    if (!has) return;
    apiFetch('/api/home/lookback?limit=5')
      .then(r => r.json())
      .then(data => setLookbackEntries(data.items || []))
      .catch(() => {});
  }, [layout.currentLayout, lookbackShuffleKey]);

  // Threads widget — top active threads (canonical + novel-with-≥3-beads).
  useEffect(() => {
    const has = layout.currentLayout.some(w => w.id === 'threads');
    if (!has || threadsList.length) return;
    apiFetch('/api/home/threads?limit=5')
      .then(r => r.json())
      .then(data => setThreadsList(data.threads || []))
      .catch(() => {});
  }, [layout.currentLayout]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [question]);

  // Close archetype picker on outside click
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

  // Dispatcher for the Quick Action submit. In 'entry' / 'note' mode the
  // typed text seeds a new journal entry / note via sessionStorage so the
  // destination editor can pick it up; in 'ask' mode it streams an answer
  // inline. This is what the home tour's mode toggle controls.
  function handleQuickSubmit() {
    const q = question.trim();
    if (!q || loading) return;
    if (quickMode === 'entry') {
      try { sessionStorage.setItem('liminal_pending_entry_body', q); } catch {}
      setQuestion('');
      onNewEntry?.();
      return;
    }
    if (quickMode === 'note') {
      try { sessionStorage.setItem('liminal_pending_note_body', q); } catch {}
      setQuestion('');
      onNewNote?.(q);
      return;
    }
    handleAsk();
  }

  async function handleAsk() {
    const q = question.trim();
    if (!q || loading) return;
    const activeArchetype = archetype;

    if (greetingRowRef.current) setRowHeight(greetingRowRef.current.offsetHeight);
    setLoading(true);
    setAnswer(null);
    setSaved(false);
    stopSpeak(audioRef, cancelRef); setPlaying(false);

    try {
      const res = await apiFetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, archetype: activeArchetype }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      setAnswer(data.answer);
      setAnsweredArchetype(data.archetype);
      setAnsweredQuestion(q);
      // Auto-save to Oracle history (fire and forget)
      apiFetch('/api/oracle/sessions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, answer: data.answer, archetype: data.archetype }),
      }).catch(() => {});
    } catch (err) {
      setAnswer(`${t('home.error')}: ${err.message}`);
      setAnsweredArchetype(activeArchetype);
      setAnsweredQuestion(q);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegen() {
    if (!answeredQuestion || loading) return;
    const activeArchetype = archetype;

    setLoading(true);
    setSaved(false);
    stopSpeak(audioRef, cancelRef); setPlaying(false);

    try {
      const res = await apiFetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: answeredQuestion, archetype: activeArchetype }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
      setAnswer(data.answer);
      setAnsweredArchetype(data.archetype);
      // Update Oracle with the regenerated answer
      apiFetch('/api/oracle/sessions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: answeredQuestion, answer: data.answer, archetype: data.archetype }),
      }).catch(() => {});
    } catch {
      // keep existing answer
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToJournal() {
    if (!answeredQuestion || !answer) return;
    const title = answeredQuestion.slice(0, 70);
    const body = `<p><em>Q: ${answeredQuestion}</em></p><p>${answer.split('\n\n').join('</p><p>')}</p>`;
    try {
      await apiFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      setSaved(true);
      window.dispatchEvent(new CustomEvent('liminal:entries-changed'));
    } catch {}
  }

  async function handleSaveCardToJournal(e) {
    e.stopPropagation();
    if (!dailyCard || cardSaved) return;

    const encode = (str) => { try { return btoa(unescape(encodeURIComponent(str || ''))); } catch { return ''; } };

    const cardData = [{
      name: dailyCard.name,
      image: dailyCard.image || null,
      position: 'Daily Card',
      reversed: dailyCard.reversed || false,
      upright: dailyCard.meaning || '',
      meaning: dailyCard.meaning || '',
      reversed_meaning: '',
    }];

    const reading = dailyCard.reading || dailyCard.insight || '';
    const title = `Daily Card — ${dailyCard.name}${dailyCard.reversed ? ' (Reversed)' : ''}`;
    const cardHtml = `<div data-card-reading data-cards="${encode(JSON.stringify(cardData))}" data-reading="${encode(reading)}" data-deck-type="${dailyCard.deck || 'tarot'}" data-spread-name="Daily Card"></div>`;
    const body = cardHtml;

    try {
      const res = await apiFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCardSaved(true);
      window.dispatchEvent(new CustomEvent('liminal:entries-changed'));
    } catch {}
  }

  async function handleQuoteSpeak(text) {
    if (quotePlaying) { stopSpeak(quoteAudioRef, quoteCancelRef); setQuotePlaying(false); return; }
    if (!text) return;
    quoteCancelRef.current = false;
    setQuotePlaying(true);
    await streamSpeak(text, quoteAudioRef, quoteCancelRef);
    setQuotePlaying(false);
  }
  async function handleSaveQuote(q) {
    if (quoteSaved) return;
    const title = q.author ? `"${q.text.slice(0, 50)}…" — ${q.author}` : `"${q.text.slice(0, 60)}…"`;
    const body = `<p><em>"${q.text}"</em></p>${q.author ? `<p>— ${q.author}</p>` : ''}`;
    try {
      const res = await apiFetch('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) });
      if (!res.ok) throw new Error(await res.text());
      setQuoteSaved(true);
      window.dispatchEvent(new CustomEvent('liminal:entries-changed'));
    } catch {}
  }
  async function handleSavePulse() {
    if (pulseSaved || !pulse) return;
    const title = `Pulse — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    const body = `<p><em>"${pulse}"</em></p><p><small>— from your last entry, ${pulseDays}</small></p>`;
    try {
      const res = await apiFetch('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) });
      if (!res.ok) throw new Error(await res.text());
      setPulseSaved(true);
      window.dispatchEvent(new CustomEvent('liminal:entries-changed'));
    } catch {}
  }
  async function handlePulseSpeak() {
    if (pulsePlaying) { stopSpeak(pulseAudioRef, pulseCancelRef); setPulsePlaying(false); return; }
    if (!pulse) return;
    pulseCancelRef.current = false;
    setPulsePlaying(true);
    await streamSpeak(pulse, pulseAudioRef, pulseCancelRef);
    setPulsePlaying(false);
  }
  async function handleInsightSpeak() {
    if (insightPlaying) { stopSpeak(insightAudioRef, insightCancelRef); setInsightPlaying(false); return; }
    if (!insight) return;
    insightCancelRef.current = false;
    setInsightPlaying(true);
    await streamSpeak(insight, insightAudioRef, insightCancelRef);
    setInsightPlaying(false);
  }
  async function handleSaveInsight() {
    if (insightSaved || !insight) return;
    const title = `Insight — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    const body = `<p><em>"${insight}"</em></p>`;
    try {
      const res = await apiFetch('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) });
      if (!res.ok) throw new Error(await res.text());
      setInsightSaved(true);
      window.dispatchEvent(new CustomEvent('liminal:entries-changed'));
    } catch {}
  }


  async function handleCardSpeak(e) {
    e.stopPropagation();
    if (cardPlaying) { stopSpeak(cardAudioRef, cardCancelRef); setCardPlaying(false); return; }
    const text = dailyCard?.reading || dailyCard?.insight;
    if (!text) return;
    cardCancelRef.current = false;
    setCardPlaying(true);
    await streamSpeak(text, cardAudioRef, cardCancelRef);
    setCardPlaying(false);
  }

  async function handleSnippetSpeak(e) {
    e.stopPropagation();
    if (snippetPlaying) { stopSpeak(snippetAudioRef, snippetCancelRef); setSnippetPlaying(false); return; }
    if (!portraitSnippet) return;
    snippetCancelRef.current = false;
    setSnippetPlaying(true);
    await streamSpeak(portraitSnippet, snippetAudioRef, snippetCancelRef);
    setSnippetPlaying(false);
  }

  async function handleSaveSnippetToJournal(e) {
    e.stopPropagation();
    if (!portraitSnippet || snippetSaved) return;
    const title = 'Portrait Sketch';
    const body = `<p>${portraitSnippet}</p>`;
    try {
      const res = await apiFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, tags: ['portrait'] }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSnippetSaved(true);
      window.dispatchEvent(new CustomEvent('liminal:entries-changed'));
    } catch {}
  }

  async function handleSpeak() {
    if (playing) { stopSpeak(audioRef, cancelRef); setPlaying(false); return; }
    if (!answer) return;
    cancelRef.current = false;
    setPlaying(true);
    await streamSpeak(answer, audioRef, cancelRef);
    setPlaying(false);
  }

  function handleReset() {
    setQuestion('');
    setAnswer(null);
    setAnsweredQuestion('');
    setAnsweredArchetype('');
    setSaved(false);
    setRowHeight(null);
    stopSpeak(audioRef, cancelRef); setPlaying(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // Switching to entry / note mode while the Quick Ask answer panel is open
  // collapses it — the split-pane layout only makes sense for ask. Doing the
  // reset here keeps the toggle behaviour predictable: clicking Journal or
  // Note instantly returns the home to a single pill.
  function handleQuickModeChange(nextMode) {
    if (quickMode === 'ask' && nextMode !== 'ask' && (loading || answer)) {
      setAnswer(null);
      setAnsweredQuestion('');
      setAnsweredArchetype('');
      setRowHeight(null);
      stopSpeak(audioRef, cancelRef); setPlaying(false);
    }
    setQuickMode(nextMode);
  }

  // ── Custom collision: pointer-first, then rect intersection fallback ──────
  function customCollision(args) {
    const pointer = pointerWithin(args);
    if (pointer.length > 0) return pointer;
    return rectIntersection(args);
  }

  // ── Layout drag-and-drop handler ──────────────────────────────────────────
  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.currentLayout.findIndex(w => w.id === active.id);
    const newIndex = layout.currentLayout.findIndex(w => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    layout.reorderWidgets(arrayMove(layout.currentLayout, oldIndex, newIndex));
  }

  // ── Widget renderer ──────────────────────────────────────────────────────
  function renderWidget(widgetId, size) {
    switch (widgetId) {
      case 'quote': {
        const q = quotePoolReady ? getDailyQuote(lang, userQuotes) : null;
        if (!q) {
          return (
            <div style={{ ...s.quoteBlock, ...(isMobile ? { marginBottom: '16px', paddingLeft: '10px' } : {}) }} />
          );
        }
        return (
          <div style={{ ...s.quoteBlock, ...(isMobile ? { marginBottom: '16px', paddingLeft: '10px' } : {}) }}>
            <span style={s.quoteText}>"{q.text}"</span>
            <span style={s.pulseAttribution}>
              {q.author && <span>— {q.author}</span>}
              <button data-tour-id="home-quote-speak" style={s.pulseSpeaker} onClick={() => handleQuoteSpeak(q.text)} title="Read aloud">
                <WaveformIcon playing={quotePlaying} />
              </button>
              <button style={s.cardActionBtn} onClick={() => handleSaveQuote(q)}>{quoteSaved ? '✓ Saved' : '+ Save to journal'}</button>
            </span>
          </div>
        );
      }
      case 'moon': {
        if (!moon) return null;
        return (
          <div style={{ ...s.moonCard, ...(isMobile ? { padding: '12px 14px', borderRadius: '12px', gap: '12px' } : {}) }}>
            <MoonPhaseSVGSmall illumination={moon.illumination ?? 50} phase={moon.phase ?? ''} />
            <div style={s.moonInfo}>
              <div style={s.moonPhase}>{t(`moon.phase.${(moon.phase || '').replace(/ /g, '')}`)}</div>
              <div style={s.moonDetail}>
                {moon.illumination != null && <span>{t('moon.illuminated', { percent: Math.round(moon.illumination) })}</span>}
                {moon.moonSign && <span> &middot; {t('moon.moonIn', { sign: moon.moonSign })}</span>}
              </div>
              {moon.phase && <div style={s.moonMeaning}>{t(`moon.meaning.${moon.phase.replace(/ /g, '')}`)}</div>}
            </div>
            <span style={s.moonArrowLink} onClick={() => onNavigateToSky?.()} title="View Sky">&rsaquo;</span>
          </div>
        );
      }
      case 'tarot': {
        if (!dailyCard) return null;
        return (
          <div style={{ ...s.dailyCardPanel, ...(isMobile ? { padding: '12px 14px', borderRadius: '12px', gap: '12px', flexDirection: 'column', alignItems: 'center' } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px', ...(isMobile ? { width: '100%' } : {}) }}>
              <div style={s.dailyFlipContainer}>
                <div style={{ ...s.dailyFlipInner, transform: cardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                  <div style={s.dailyFlipFace}>
                    <img
                      src={
                        dailyCard.deck === 'oracle'
                          ? '/cards/Oracle_Deck/card-back_oracle.png'
                          : '/cards/Tarot_Deck/card-back_tarot.png'
                      }
                      alt="Card back"
                      style={s.dailyCardImg}
                    />
                  </div>
                  <div style={{ ...s.dailyFlipFace, transform: 'rotateY(180deg)' }}>
                    {dailyCard.image ? (
                      <img src={dailyCard.image} alt={dailyCard.name} style={{ ...s.dailyCardImg, transform: dailyCard.reversed ? 'rotate(180deg)' : 'none' }} />
                    ) : (
                      <div style={s.dailyOracleCard}>
                        <div style={s.dailyOracleDiamond} />
                        <div style={s.dailyOracleName}>{dailyCard.name}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div style={s.dailyCardInfo}>
                <div style={s.dailyCardLabel}>{t('home.dailyCard')}</div>
                <div style={s.dailyCardName}>{dailyCard.name}{dailyCard.reversed ? ` (${t('home.reversed')})` : ''}</div>
              </div>
              <span style={s.moonArrowLink} onClick={() => onNavigateToCards?.()} title="View Cards">&rsaquo;</span>
            </div>
            {(dailyCard.reading || dailyCard.insight) && (
              <>
                <div style={{ ...s.dailyCardDivider, ...(isMobile ? { width: '100%', height: '1px', marginLeft: 0 } : {}) }} />
                <div style={{ display: 'flex', flexDirection: 'column', flex: 4, minWidth: 0, ...(isMobile ? { width: '100%' } : {}) }}>
                  <div style={s.dailyCardReading}>{dailyCard.reading || dailyCard.insight}</div>
                  <div style={s.cardActions}>
                    <button style={{ ...s.cardActionBtn, color: cardPlaying ? 'var(--strong)' : 'var(--muted)' }} onClick={handleCardSpeak} title="Read aloud">
                      <WaveformIcon playing={cardPlaying} />
                    </button>
                    <button style={s.cardActionBtn} onClick={handleSaveCardToJournal} title="Save to journal">{cardSaved ? '✓ Saved' : '+ Save to journal'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      }
      case 'pulse': {
        if (!pulse) return null;
        return (
          <div style={s.pulseBlock}>
            <div style={s.pulseText}>"{pulse}"</div>
            <div style={s.pulseAttribution}>
              <span>— from your last entry, {pulseDays}</span>
              <button style={s.pulseSpeaker} onClick={handlePulseSpeak} title="Read aloud">
                <WaveformIcon playing={pulsePlaying} />
              </button>
              <button style={s.cardActionBtn} onClick={handleSavePulse}>{pulseSaved ? '✓ Saved' : '+ Save to journal'}</button>
            </div>
          </div>
        );
      }
      case 'stats': {
        if (isMobile) {
          const mStatRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' };
          const mStatLeft = { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 };
          return (
            <div style={{ ...s.beveledSquare, padding: '10px 14px', borderRadius: '12px' }}>
              {/* Journal */}
              <div style={mStatRow}>
                <div style={mStatLeft}>
                  <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{t('nav.journal')}</span>
                  <span style={{ fontSize: '13px', color: 'var(--strong)', fontWeight: '600' }}>{entryCount ?? '—'} {t('home.entriesWritten')}</span>
                  {lastEntryDate && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatRelativeDate(lastEntryDate, t)}</span>}
                </div>
                <button style={{ ...s.statsArrow, border: 'none', padding: '0 4px' }} onClick={() => onNavigateToEntry?.()}>&rsaquo;</button>
              </div>
              {/* Notes */}
              <div style={mStatRow}>
                <div style={mStatLeft}>
                  <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{t('nav.notes')}</span>
                  <span style={{ fontSize: '13px', color: 'var(--strong)', fontWeight: '600' }}>{noteCount ?? '—'} {t('home.notesWritten')}</span>
                  {lastNoteDate && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatRelativeDate(lastNoteDate, t)}</span>}
                </div>
                <button style={{ ...s.statsArrow, border: 'none', padding: '0 4px' }} onClick={() => onNavigateToNote?.()}>&rsaquo;</button>
              </div>
              {/* Oracle */}
              <div style={{ ...mStatRow, borderBottom: 'none' }}>
                <div style={mStatLeft}>
                  <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{t('nav.oracle')}</span>
                  <span style={{ fontSize: '13px', color: 'var(--strong)', fontWeight: '600' }}>{oracleCount ?? '—'} {t('home.conversations')}</span>
                  {lastOracleDate && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatRelativeDate(lastOracleDate, t)}</span>}
                </div>
                <button style={{ ...s.statsArrow, border: 'none', padding: '0 4px' }} onClick={() => onNavigateToOracle?.()}>&rsaquo;</button>
              </div>
            </div>
          );
        }
        return (
          <div style={s.beveledSquare}>
            <div style={s.statsTable}>
              {/* Journal row */}
              <div style={s.statsCellLabel}>
                <span style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{t('nav.journal')}</span>
              </div>
              <div style={s.statsCell}>
                <span style={s.insightValue}>{entryCount ?? '—'}</span>
                <span style={s.insightLabel}>{t('home.entriesWritten')}</span>
              </div>
              <div style={s.statsCellDate}>
                <span style={s.insightValue}>{lastEntryDate ? formatRelativeDate(lastEntryDate, t) : '—'}</span>
                <span style={s.insightLabel}>{t('home.lastWritten')}</span>
              </div>
              {latestEntryTitle ? (
                <div style={{ ...s.statsCellLatest, cursor: 'pointer' }} onClick={() => onNavigateToEntry?.(latestEntryId)} title={t('home.openInJournal')}>
                  <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestEntryTitle}</span>
                  <span style={s.insightLabel}>{t('home.latestEntry')}</span>
                </div>
              ) : (<div style={s.statsCellLatest} />)}
              <button style={s.newLinkInline} onClick={(e) => { e.stopPropagation(); onNewEntry?.(); }}>
                <span style={s.newLinkValue}>+</span><span style={s.newLinkLabel}>{t('home.new')}</span>
              </button>
              <button style={s.statsArrow} onClick={() => onNavigateToEntry?.()} title={t('nav.journal')}>&rsaquo;</button>

              {/* Divider */}
              <div style={s.statsRowBorder} />

              {/* Notes row */}
              <div style={s.statsCellLabel}>
                <span style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{t('nav.notes')}</span>
              </div>
              <div style={s.statsCell}>
                <span style={s.insightValue}>{noteCount ?? '—'}</span>
                <span style={s.insightLabel}>{t('home.notesWritten')}</span>
              </div>
              <div style={s.statsCellDate}>
                <span style={s.insightValue}>{lastNoteDate ? formatRelativeDate(lastNoteDate, t) : '—'}</span>
                <span style={s.insightLabel}>{t('home.lastWritten')}</span>
              </div>
              {latestNoteTitle ? (
                <div style={{ ...s.statsCellLatest, cursor: 'pointer' }} onClick={() => onNavigateToNote?.(latestNoteId)} title={t('home.openInNotes')}>
                  <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestNoteTitle}</span>
                  <span style={s.insightLabel}>{t('home.latestNote')}</span>
                </div>
              ) : (<div style={s.statsCellLatest} />)}
              <button style={s.newLinkInline} onClick={(e) => { e.stopPropagation(); onNewNote?.(); }}>
                <span style={s.newLinkValue}>+</span><span style={s.newLinkLabel}>{t('home.new')}</span>
              </button>
              <button style={s.statsArrow} onClick={() => onNavigateToNote?.()} title={t('nav.notes')}>&rsaquo;</button>

              {/* Divider */}
              <div style={s.statsRowBorder} />

              {/* Oracle row */}
              <div style={s.statsCellLabel}>
                <span style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{t('nav.oracle')}</span>
              </div>
              <div style={s.statsCell}>
                <span style={s.insightValue}>{oracleCount ?? '—'}</span>
                <span style={s.insightLabel}>{t('home.conversations')}</span>
              </div>
              <div style={s.statsCellDate}>
                <span style={s.insightValue}>{lastOracleDate ? formatRelativeDate(lastOracleDate, t) : '—'}</span>
                <span style={s.insightLabel}>{t('home.lastConversation')}</span>
              </div>
              {latestOraclePreview ? (
                <div style={{ ...s.statsCellLatest, cursor: 'pointer' }} onClick={() => onNavigateToOracle?.(latestOracleSessionId)} title={t('home.openInOracle')}>
                  <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestOraclePreview}</span>
                  <span style={s.insightLabel}>{t('home.latestConversation')}</span>
                </div>
              ) : (<div style={s.statsCellLatest} />)}
              <button style={s.newLinkInline} onClick={(e) => { e.stopPropagation(); onNewConversation?.(); }}>
                <span style={s.newLinkValue}>+</span><span style={s.newLinkLabel}>{t('home.new')}</span>
              </button>
              <button style={s.statsArrow} onClick={() => onNavigateToOracle?.()} title={t('nav.oracle')}>&rsaquo;</button>
            </div>
          </div>
        );
      }
      case 'portrait': {
        if (!portrait?.birth_date) {
          return (
            <div style={s.portraitPill} onClick={() => onNavigateToPortrait?.()}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px 0', width: '100%', textAlign: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>{t('home.portraitEmpty')}</span>
                <span style={{ fontSize: '12px', color: 'var(--strong)', fontWeight: '500', cursor: 'pointer' }}>{t('home.portraitSetup')} ›</span>
              </div>
            </div>
          );
        }
        const isCompact = isMobile || size === 'compact';
        return (
          <div style={{ ...s.portraitPill, ...(isMobile ? { padding: '12px 14px', borderRadius: '12px' } : {}) }} onClick={() => onNavigateToPortrait?.()}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
              <div style={s.portraitHeader}>
                <span style={s.portraitLabel}>{t('portrait.title')}</span>
                <span style={s.moonArrowLink} onClick={(e) => { e.stopPropagation(); onNavigateToPortrait?.(); }}>›</span>
              </div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '14px' : '20px', flex: 1 }}>
                <div style={{ display: 'flex', gap: isMobile ? '14px' : '20px', flex: isMobile ? 'none' : '0 0 auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: isMobile ? 1 : 'none' }}>
                    {portrait.sun_sign && <div style={s.portraitItem}><span style={s.portraitItemValue}>☉ {portrait.sun_sign}</span><span style={s.portraitItemLabel}>{t('portrait.sunSign')}</span></div>}
                    {portrait.moon_sign && <div style={s.portraitItem}><span style={s.portraitItemValue}>☽ {portrait.moon_sign}</span><span style={s.portraitItemLabel}>{t('portrait.moonSign')}</span></div>}
                    {portrait.rising_sign && <div style={s.portraitItem}><span style={s.portraitItemValue}>↑ {portrait.rising_sign}</span><span style={s.portraitItemLabel}>{t('portrait.risingSign')}</span></div>}
                    {portrait.chinese_zodiac && <div style={s.portraitItem}><span style={s.portraitItemValue}>{portrait.chinese_element ? `${portrait.chinese_element} ` : ''}{portrait.chinese_zodiac}</span><span style={s.portraitItemLabel}>{t('portrait.chineseZodiac')}</span></div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: isMobile ? 1 : 'none' }}>
                    {portrait.mbti && <div style={s.portraitItem}><span style={s.portraitItemValue}>{portrait.mbti}</span><span style={s.portraitItemLabel}>{t('portrait.mbti')}</span></div>}
                    {portrait.life_path_number != null && <div style={s.portraitItem}><span style={s.portraitItemValue}>{portrait.life_path_number}</span><span style={s.portraitItemLabel}>{t('portrait.lifePathNumber')}</span></div>}
                    {portrait.soul_card && <div style={s.portraitItem}><span style={s.portraitItemValue}>{portrait.soul_card}</span><span style={s.portraitItemLabel}>{t('portrait.soulCard')}</span></div>}
                    {portrait.life_path_card && <div style={s.portraitItem}><span style={s.portraitItemValue}>{portrait.life_path_card}</span><span style={s.portraitItemLabel}>{t('portrait.lifePathCard')}</span></div>}
                  </div>
                </div>
                {(isMobile || !isCompact) && portraitSnippet && (
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    ...(isMobile
                      ? { borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }
                      : { borderLeft: '1px solid var(--border)', paddingLeft: '20px' }),
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  }}>
                    <p style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--body)', margin: 0, fontStyle: 'italic', opacity: 0.85 }}>{portraitSnippet}</p>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <button style={{ ...s.cardActionBtn, color: snippetPlaying ? 'var(--strong)' : 'var(--muted)' }} onClick={handleSnippetSpeak} title="Read aloud">
                        <WaveformIcon playing={snippetPlaying} />
                      </button>
                      <button style={s.cardActionBtn} onClick={handleSaveSnippetToJournal} title="Save to journal">{snippetSaved ? '✓ Saved' : '+ Save to journal'}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }
      case 'insight': {
        if (!insight) return null;
        return (
          <div style={s.insightBlock}>
            <div style={s.insightText}>"{insight}"</div>
            <div style={s.pulseAttribution}>
              <span>— insight</span>
              <button style={s.pulseSpeaker} onClick={handleInsightSpeak} title="Read aloud">
                <WaveformIcon playing={insightPlaying} />
              </button>
              <button style={s.cardActionBtn} onClick={handleSaveInsight}>{insightSaved ? '✓ Saved' : '+ Save to journal'}</button>
            </div>
          </div>
        );
      }
      case 'themes': {
        return (
          <div style={{ ...s.themesRhythmPill, ...(isMobile ? { padding: '14px 16px', borderRadius: '12px' } : {}) }}>
            <div style={s.themesHeader}>
              <span style={s.themesLabel}>{t('home.themesTitle')}</span>
              <span style={s.themesPeriod}> ·  {t('home.themesPeriod')}</span>
            </div>
            {themes.length >= 1 ? (
              <div style={s.themesRow}>
                {themes.map(({ tag, count }) => {
                  const maxCount = themes[0]?.count || 1;
                  const scale = 0.85 + 0.15 * (count / maxCount);
                  return <span key={tag} style={{ ...s.themePill, fontSize: `${11 * scale}px` }} title={`${count} entries`}>{tag}</span>;
                })}
              </div>
            ) : (
              <div style={{ ...s.themesRow, opacity: 0.55, fontSize: '12px', fontStyle: 'italic' }}>
                No recurring themes yet — keep writing and patterns will surface here.
              </div>
            )}
          </div>
        );
      }
      case 'goals': {
        return (
          <div style={{ ...s.themesRhythmPill, ...(isMobile ? { padding: '14px 16px', borderRadius: '12px' } : {}) }}>
            <div style={s.themesHeader}>
              <span style={s.themesLabel}>{t('home.goalsTitle')}</span>
              <span style={s.themesPeriod}> ·  {t('home.goalsPeriod')}</span>
            </div>
            {goals.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {goals.map((g, i) => (
                  <div
                    key={g.id}
                    onClick={() => onNavigateToNote?.(g.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--near-white)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    title={g.preview || g.title}
                  >
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, minWidth: '14px', marginTop: '1px' }}>{i + 1}.</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: 'var(--strong)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.title || 'Untitled goal'}
                      </div>
                      {g.target_date && (
                        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                          {new Date(g.target_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ ...s.themesRow, opacity: 0.55, fontSize: '12px', fontStyle: 'italic' }}>
                No goals yet — create a note with type "goal" and they'll show up here.
              </div>
            )}
          </div>
        );
      }
      case 'rhythm': {
        if (rhythm.length === 0) return null;
        return (
          <div style={{ ...s.themesRhythmPill, ...(isMobile ? { padding: '14px 16px', borderRadius: '12px' } : {}) }}>
            <div style={s.rhythmHeader}>
              <span style={s.rhythmLabel}>{t('home.rhythmTitle')}</span>
            </div>
            <RhythmGrid rhythm={rhythm} />
          </div>
        );
      }
      case 'lookback': {
        return (
          <div style={{ ...s.themesRhythmPill, ...(isMobile ? { padding: '14px 16px', borderRadius: '12px' } : {}) }}>
            <div style={s.themesHeader}>
              <span style={s.themesLabel}>{t('home.lookbackTitle')}</span>
              <span style={s.themesPeriod}> ·  {t('home.lookbackPeriod')}</span>
              <button
                onClick={() => setLookbackShuffleKey(k => k + 1)}
                style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontFamily: 'var(--font)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
                title="Shuffle"
              >
                ↻ Shuffle
              </button>
            </div>
            {lookbackEntries.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {lookbackEntries.map((e) => (
                  <div
                    key={e.id}
                    onClick={() => onNavigateToEntry?.(e.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--near-white)'; }}
                    onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
                    title={e.excerpt || e.title}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--strong)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                        {e.title || 'Untitled'}
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>
                        {formatRelativeDate(e.date || e.created_at, t)}
                      </span>
                    </div>
                    {e.excerpt && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                        {e.excerpt}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ ...s.themesRow, opacity: 0.55, fontSize: '12px', fontStyle: 'italic' }}>
                No past entries yet — write a few and they'll start surfacing here.
              </div>
            )}
          </div>
        );
      }
      case 'threads': {
        return (
          <div style={{ ...s.themesRhythmPill, ...(isMobile ? { padding: '14px 16px', borderRadius: '12px' } : {}) }}>
            <div style={s.themesHeader}>
              <span style={s.themesLabel}>{t('home.threadsTitle')}</span>
              <span style={s.themesPeriod}> ·  {t('home.threadsPeriod')}</span>
            </div>
            {threadsList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {threadsList.map((th) => {
                  const beads = th.node_count || 0;
                  const last = th.last_node_at ? formatRelativeDate(th.last_node_at, t) : null;
                  const meta = [
                    th.kind || 'thread',
                    `${beads} bead${beads === 1 ? '' : 's'}`,
                    last ? `last ${last}` : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <div
                      key={th.id}
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        gap: '8px',
                        opacity: th.status === 'dormant' ? 0.6 : 1,
                      }}
                    >
                      <div
                        onClick={() => onNavigateToThreads?.(th.id)}
                        title={th.description || th.name}
                        style={{
                          flex: '0 0 28%',
                          minWidth: 0,
                          padding: '8px 12px',
                          borderRadius: '19px',
                          background: 'var(--near-white)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.12s',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--panel-bg)'; }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.background = 'var(--near-white)'; }}
                      >
                        <div style={{ fontSize: '12px', color: 'var(--strong)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {th.name}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {meta}
                        </div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
                        {(th.beads || []).slice(0, 4).map((b, i) => (
                          <Fragment key={`${b.type}-${b.id}`}>
                            {i > 0 && (
                              <span style={{
                                flex: '0 0 8px',
                                height: '1px',
                                background: 'var(--border)',
                                alignSelf: 'center',
                              }} />
                            )}
                            <div
                              onClick={() => {
                                if (b.type === 'entry') onNavigateToEntry?.(b.id);
                                else if (b.type === 'note') onNavigateToNote?.(b.id);
                              }}
                              title={b.title}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                padding: '8px 10px',
                                borderRadius: '19px',
                                background: 'var(--near-white)',
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                fontSize: '10px',
                                color: 'var(--strong)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'background 0.12s',
                              }}
                              onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--panel-bg)'; }}
                              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'var(--near-white)'; }}
                            >
                              {b.title}
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ ...s.themesRow, opacity: 0.55, fontSize: '12px', fontStyle: 'italic' }}>
                No threads yet — open Threads and run Re-thread the Needle, or keep journalling and they'll appear.
              </div>
            )}
          </div>
        );
      }
      case 'weather': {
        return (
          <div style={{ ...s.themesRhythmPill, ...(isMobile ? { padding: '14px 16px', borderRadius: '12px' } : {}) }}>
            <div style={s.themesHeader}>
              <span style={s.themesLabel}>{t('home.weatherTitle')}</span>
              {weather?.city && <span style={s.themesPeriod}> ·  {weather.city}</span>}
            </div>
            {weather ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '10px' }}>
                <span style={{ fontSize: '28px' }}>{weather.icon}</span>
                <span style={{ fontSize: '22px', fontWeight: 500, color: 'var(--strong)' }}>{weather.temp}°</span>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{weather.condition}</span>
              </div>
            ) : (
              <div style={{ ...s.themesRow, opacity: 0.55, fontSize: '12px', fontStyle: 'italic' }}>
                Set your location in Portrait to see today's weather.
              </div>
            )}
          </div>
        );
      }
      case 'sky': {
        const hasData = (moon && moon.moonSign) || (conditions && conditions.length > 0);
        return (
          <div style={{ ...s.themesRhythmPill, ...(isMobile ? { padding: '14px 16px', borderRadius: '12px' } : {}) }}>
            <div style={s.themesHeader}>
              <span style={s.themesLabel}>{t('home.skyTitle')}</span>
            </div>
            {hasData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {moon?.moonSign && (
                  <div style={{ fontSize: '13px', color: 'var(--strong)' }}>
                    Moon in {moon.moonSign} <span style={{ color: 'var(--muted)' }}>· {moon.phase}</span>
                  </div>
                )}
                {conditions && conditions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                    {conditions.map((c) => (
                      <div key={c.planet} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: 'var(--strong)' }}>{c.planet}</span>
                        <span style={{ color: 'var(--muted)' }}>{c.sign}{c.retrograde ? ' ℞' : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
                {sky?.nextEvent && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                    Next: {sky.nextEvent.type}
                    {sky.nextEvent.sign ? ` in ${sky.nextEvent.sign}` : ''}
                    {' · '}
                    {new Date(sky.nextEvent.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...s.themesRow, opacity: 0.55, fontSize: '12px', fontStyle: 'italic' }}>
                Loading sky…
              </div>
            )}
          </div>
        );
      }
      case 'gratitude':
      case 'dreams':
      case 'reading':
      case 'bucket':
      case 'affirmations':
      case 'questions': {
        const cfg = TAG_WIDGET_CONFIG[widgetId];
        const items = tagged[widgetId] || [];
        const label = t(WIDGET_LABELS[widgetId] || widgetId);
        const onClick = cfg.source === 'entries' ? onNavigateToEntry : onNavigateToNote;
        const sourceLabel = cfg.source === 'entries' ? t('home.sourceJournal') : t('home.sourceNotes');
        return (
          <div style={{ ...s.themesRhythmPill, ...(isMobile ? { padding: '14px 16px', borderRadius: '12px' } : {}) }}>
            <div style={s.themesHeader}>
              <span style={s.themesLabel}>{label}</span>
              <span style={s.themesPeriod}> ·  {t('home.taggedFromSource', { source: sourceLabel })}</span>
            </div>
            {items.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {items.map((it, i) => (
                  <div
                    key={it.id}
                    onClick={() => onClick?.(it.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--near-white)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    title={it.preview || it.title}
                  >
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, minWidth: '14px', marginTop: '1px' }}>{i + 1}.</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: 'var(--strong)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.title || `Untitled ${label.toLowerCase()}`}
                      </div>
                      {it.date && (
                        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                          {new Date(it.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ ...s.themesRow, opacity: 0.55, fontSize: '12px', fontStyle: 'italic' }}>
                Nothing here yet — tag a {cfg.source === 'entries' ? 'journal entry' : 'note'} with "{cfg.tag}".
              </div>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────────
  const searchPopup = (
    <SearchPopup
      open={searchOpen}
      onClose={() => setSearchOpen(false)}
      onNavigateEntry={onNavigateToEntry}
      onNavigateNote={onNavigateToNote}
      onNavigateOracle={onNavigateToOracle}
    />
  );

  if (isMobile) {
    return (
      <>
      <div style={{ ...s.root, padding: '16px 14px 90px' }}>
        <div style={s.inner}>
          {/* ── Greeting (compact) ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div ref={avatarPopoutRef} style={{ position: 'relative', flexShrink: 0 }}>
              {avatarUrl && !avatarFailed ? (
                <img src={avatarUrl} alt="" onError={() => setAvatarFailed(true)} onClick={() => setAvatarPopoutOpen(v => !v)} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }} />
              ) : (
                <div onClick={() => setAvatarPopoutOpen(v => !v)} style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--panel-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '600', color: 'var(--muted)', cursor: 'pointer' }}>
                  {(displayName || '?')[0].toUpperCase()}
                </div>
              )}
              {avatarPopout}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--strong)' }}>
                {getGreeting(displayName || '', homeStrings.greetings, lang)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {today}{weather && <span>{'  '}{weather.icon} {weather.temp}° · {weather.city}</span>}
              </div>
            </div>
            {!layout.editMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <span data-tour-id="home-theme-toggle" style={{ display: 'inline-flex' }}><ThemeToggle size="sm" /></span>
                <button
                  data-tour-id="home-edit-layout"
                  onClick={() => layout.setEditMode(true)}
                  style={{ background: 'none', border: 'var(--border-style)', borderRadius: '19px', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px' }}
                  title="Edit layout"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 11.5V14h2.5l7.37-7.37-2.5-2.5L2 11.5zm11.81-6.81a.664.664 0 0 0 0-.94l-1.56-1.56a.664.664 0 0 0-.94 0l-1.22 1.22 2.5 2.5 1.22-1.22z" fill="currentColor"/></svg>
                  Edit
                </button>
                <button
                  data-tour-id="home-search"
                  onClick={() => setSearchOpen(true)}
                  title="Search"
                  style={{ background: 'none', border: 'var(--border-style)', borderRadius: '19px', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 9px' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  Search
                </button>
              </div>
            )}
          </div>

          {/* ── Quick Ask (compact) ── */}
          <div data-tour-id="home-quick-action" style={{ ...s.askCard, marginBottom: '16px' }}>
            <textarea
              ref={textareaRef}
              style={{ ...s.textarea, padding: '14px 14px 8px', minHeight: '48px', fontSize: '14px' }}
              placeholder={dailyPrompt}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuickSubmit(); }
              }}
              rows={2}
            />
            <div style={{ ...s.askCardFooter, padding: '6px 10px 10px' }}>
              <div style={{ flex: 1 }} />
              {/* Archetype picker is only relevant when asking the oracle —
                  journal entries and notes don't run through an archetype
                  voice, so the icon is hidden in those modes. */}
              {quickMode === 'ask' && (
                <div style={{ position: 'relative' }} ref={archetypeRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setArchetypeOpen(!archetypeOpen); }}
                    title={archetype}
                    type="button"
                    style={{
                      ...s.charBtn,
                      width: '30px', height: '30px',
                      background: archetypeOpen ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
                      color: archetype !== 'Auto' ? 'var(--strong)' : 'var(--muted)',
                      boxShadow: archetypeOpen
                        ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                        : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
                    }}
                  >
                    {(() => {
                      const builtIn = BUILT_IN_ARCHETYPES.find(a => a.value === archetype);
                      const custom = customArchetypesList.find(a => a.name === archetype);
                      if (builtIn) return <ArchetypeAvatar archetype={builtIn} size={18} color={archetype !== 'Auto' ? 'var(--strong)' : 'var(--muted)'} />;
                      if (custom) return <ArchetypeAvatar archetype={{ value: custom.name, image: custom.image }} size={18} color={custom.color || 'var(--strong)'} />;
                      return <ArchetypeIcon />;
                    })()}
                  </button>
                  {archetypeOpen && (
                    <div style={{ ...s.archetypePopup, top: '38px' }}>
                      {BUILT_IN_ARCHETYPES.map((a) => (
                        <button
                          key={a.value}
                          style={{
                            ...s.archetypeOption,
                            fontWeight: archetype === a.value ? '600' : '400',
                            color: archetype === a.value ? 'var(--strong)' : 'var(--body)',
                          }}
                          onClick={() => { setArchetype(a.value); setArchetypeOpen(false); }}
                        >
                          <ArchetypeAvatar archetype={a} size={18} color={archetype === a.value ? 'var(--strong)' : 'var(--muted)'} />
                          <span style={{ marginLeft: '8px' }}>{t(a.key)}</span>
                        </button>
                      ))}
                      {customArchetypesList.length > 0 && (
                        <div style={{ height: '1px', background: 'var(--border)', margin: '4px 8px' }} />
                      )}
                      {customArchetypesList.map((c) => (
                        <button
                          key={c.name}
                          style={{
                            ...s.archetypeOption,
                            fontWeight: archetype === c.name ? '600' : '400',
                            color: archetype === c.name ? 'var(--strong)' : 'var(--body)',
                          }}
                          onClick={() => { setArchetype(c.name); setArchetypeOpen(false); }}
                        >
                          <ArchetypeAvatar archetype={{ value: c.name, image: c.image }} size={18} color={c.color || 'var(--muted)'} />
                          <span style={{ marginLeft: '8px' }}>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <MicButton
                isRecording={isDictating}
                isProcessing={isDictatingProcessing}
                onClick={toggleDictation}
                style={{ width: '30px', height: '30px', flexShrink: 0 }}
              />
              <button
                style={{ ...s.askBtn, opacity: loading || !question.trim() ? 0.4 : 1, padding: '6px 14px', fontSize: '12px' }}
                onClick={handleQuickSubmit}
                disabled={loading || !question.trim()}
              >
                {quickMode === 'entry'
                  ? `+ ${t('nav.journal')}`
                  : quickMode === 'note'
                    ? `+ ${t('nav.notes')}`
                    : t('home.ask')}
              </button>
              <QuickModeToggle mode={quickMode} onChange={handleQuickModeChange} />
            </div>
          </div>

          {/* ── Answer panel (full-width below ask) ── */}
          {(loading || answer) && (
            <div style={{ border: 'var(--border-style)', borderRadius: '19px', background: 'var(--white)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '14px 14px', marginBottom: '16px', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px 0' }}>
                  <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0s infinite' }} />
                  <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0.2s infinite' }} />
                  <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0.4s infinite' }} />
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{answeredQuestion}"</span>
                    <span style={{ ...s.responseArchPill, fontSize: '9px', padding: '1px 6px' }}>{answeredArchetype}</span>
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--body)', maxHeight: '200px', overflowY: 'auto' }}>{answer}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                    <button
                      style={{ ...s.actionBtn, ...(playing ? s.actionBtnActive : {}) }}
                      onClick={handleSpeak}
                      title={playing ? t('mirror.stop') : t('mirror.listen')}
                    >
                      <WaveformIcon playing={playing} />
                    </button>
                    <button style={s.actionLink} onClick={handleReset}>{t('home.askAnother')}</button>
                    {saved ? (
                      <span style={s.savedMsg}>{t('home.savedToJournal')}</span>
                    ) : (
                      <button style={s.actionLink} onClick={handleSaveToJournal}>{t('home.saveToJournal')}</button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Mobile edit controls ── */}
          {layout.editMode && (
            <div style={{ border: 'var(--border-style)', borderRadius: '12px', padding: '10px 12px', marginBottom: '14px', background: 'var(--near-white)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select
                value=""
                onChange={(e) => { if (e.target.value) { layout.addWidget(e.target.value); e.target.value = ''; } }}
                style={{ flex: 1, fontSize: '12px', padding: '6px 8px', border: 'var(--border-style)', borderRadius: '8px', background: 'var(--white)', fontFamily: 'var(--font)' }}
              >
                <option value="">+ Add widget…</option>
                {layout.availableWidgets.map(id => (
                  <option key={id} value={id}>{t(layout.WIDGET_LABELS[id] || id)}</option>
                ))}
              </select>
              <button
                onClick={() => layout.setEditMode(false)}
                style={{ fontSize: '12px', padding: '6px 14px', border: 'var(--border-style)', borderRadius: '8px', background: 'var(--strong)', color: 'var(--white)', cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                Done
              </button>
            </div>
          )}

          {/* ── Widgets (single-column, compact) ── */}
          <DndContext sensors={sensors} collisionDetection={customCollision} onDragEnd={handleDragEnd}>
            <SortableContext items={layout.currentLayout.map(w => w.id)} strategy={() => []}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {layout.currentLayout.map((widget) => {
                  const content = renderWidget(widget.id, widget.width);
                  if (!content && !layout.editMode) return null;
                  if (layout.editMode) {
                    return (
                      <WidgetWrapper
                        key={widget.id}
                        id={widget.id}
                        editMode={true}
                        isLiminalDefault={false}
                        width={100}
                        onRemove={layout.removeWidget}
                        onShrink={layout.shrinkWidget}
                        onGrow={layout.growWidget}
                      >
                        {content || <div style={{ padding: '12px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>No data yet</div>}
                      </WidgetWrapper>
                    );
                  }
                  return <div key={widget.id}>{content}</div>;
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
      {searchPopup}
      </>
    );
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────────────
  return (
    <>
    <div style={s.root}>
      <div style={s.inner}>
        {/* Greeting + Quick Ask row */}
        <div ref={greetingRowRef} style={{ display: 'flex', alignItems: 'stretch', gap: '18px', marginBottom: '48px', minHeight: '160px', ...(rowHeight ? { height: rowHeight, maxHeight: rowHeight } : {}) }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'center', flexShrink: 0, marginRight: '8px', gap: '6px' }}>
            <video src="/Liminal_B_v003_animated_1.webm" autoPlay loop muted playsInline style={{ width: '100px', objectFit: 'contain', opacity: 0.85, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
            <img src="/liminal-wordmark.png" alt="Liminal." style={{ width: '90px', objectFit: 'contain', opacity: 0.75, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
          </div>
          <div style={{ marginLeft: '12px', border: 'var(--border-style)', borderRadius: '16px', background: 'var(--white)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '32px 28px 16px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div ref={avatarPopoutRef} style={{ position: 'relative', flexShrink: 0 }}>
                {avatarUrl && !avatarFailed ? (
                  <img src={avatarUrl} alt="" onError={() => setAvatarFailed(true)} onClick={() => setAvatarPopoutOpen(v => !v)} style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }} />
                ) : (
                  <div onClick={() => setAvatarPopoutOpen(v => !v)} style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--panel-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: '600', color: 'var(--muted)', cursor: 'pointer' }}>
                    {(displayName || '?')[0].toUpperCase()}
                  </div>
                )}
                {avatarPopout}
              </div>
              <div>
                <div style={s.greeting}>
                  {getGreeting(displayName || '', homeStrings.greetings, lang)}
                </div>
                <div style={s.greetingDate}>
                  {today}{weather && <span>{'  '}  {weather.icon} {weather.temp}°  ·  {weather.city}</span>}
                </div>
              </div>
            </div>
            {!layout.editMode && (
              <div style={{ alignSelf: 'flex-end', marginTop: 'auto', marginRight: '-14px', marginBottom: '-4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span data-tour-id="home-theme-toggle" style={{ display: 'inline-flex' }}><ThemeToggle size="sm" /></span>
                <button
                  data-tour-id="home-edit-layout"
                  onClick={() => layout.setEditMode(true)}
                  style={{ background: 'none', border: 'var(--border-style)', borderRadius: '19px', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', transition: 'background 0.12s, color 0.12s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--near-white)'; e.currentTarget.style.color = 'var(--strong)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 11.5V14h2.5l7.37-7.37-2.5-2.5L2 11.5zm11.81-6.81a.664.664 0 0 0 0-.94l-1.56-1.56a.664.664 0 0 0-.94 0l-1.22 1.22 2.5 2.5 1.22-1.22z" fill="currentColor"/></svg>
                  Edit layout
                </button>
                <button
                  data-tour-id="home-search"
                  onClick={() => setSearchOpen(true)}
                  title="Search"
                  style={{ background: 'none', border: 'var(--border-style)', borderRadius: '19px', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', transition: 'background 0.12s, color 0.12s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--near-white)'; e.currentTarget.style.color = 'var(--strong)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  Search
                </button>
              </div>
            )}
          </div>
          {/* Quick Ask inline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'row', gap: '14px', minWidth: 0 }}>
            <div data-tour-id="home-quick-action" style={{ ...s.askCard, marginBottom: 0, flex: (loading || answer) ? 1 : 1, display: 'flex', flexDirection: 'column', transition: 'flex 0.3s ease' }}>
              <textarea
                ref={textareaRef}
                style={s.textarea}
                placeholder={dailyPrompt}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuickSubmit(); }
                }}
                rows={2}
              />
              <div style={{ ...s.askCardFooter, marginTop: 'auto' }}>
                <div style={{ flex: 1 }} />
                {/* Hidden in entry / note modes — only Quick Ask uses an archetype voice. */}
                {quickMode === 'ask' && (
                  <div style={{ position: 'relative' }} ref={archetypeRef}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setArchetypeOpen(!archetypeOpen); }}
                      title={archetype}
                      type="button"
                      style={{
                        ...s.charBtn,
                        background: archetypeOpen ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
                        color: archetype !== 'Auto' ? 'var(--strong)' : 'var(--muted)',
                        boxShadow: archetypeOpen
                          ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                          : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
                      }}
                    >
                      {(() => {
                        const builtIn = BUILT_IN_ARCHETYPES.find(a => a.value === archetype);
                        const custom = customArchetypesList.find(a => a.name === archetype);
                        if (builtIn) return <ArchetypeAvatar archetype={builtIn} size={20} color={archetype !== 'Auto' ? 'var(--strong)' : 'var(--muted)'} />;
                        if (custom) return <ArchetypeAvatar archetype={{ value: custom.name, image: custom.image }} size={20} color={custom.color || 'var(--strong)'} />;
                        return <ArchetypeIcon />;
                      })()}
                    </button>
                    {archetypeOpen && (
                      <div style={s.archetypePopup}>
                        {BUILT_IN_ARCHETYPES.map((a) => (
                          <button
                            key={a.value}
                            style={{
                              ...s.archetypeOption,
                              fontWeight: archetype === a.value ? '600' : '400',
                              color: archetype === a.value ? 'var(--strong)' : 'var(--body)',
                            }}
                            onClick={() => { setArchetype(a.value); setArchetypeOpen(false); }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <ArchetypeAvatar archetype={a} size={18} color={archetype === a.value ? 'var(--strong)' : 'var(--muted)'} />
                            <span style={{ marginLeft: '8px' }}>{t(a.key)}</span>
                          </button>
                        ))}
                        {customArchetypesList.length > 0 && (
                          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 8px' }} />
                        )}
                        {customArchetypesList.map((c) => (
                          <button
                            key={c.name}
                            style={{
                              ...s.archetypeOption,
                              fontWeight: archetype === c.name ? '600' : '400',
                              color: archetype === c.name ? 'var(--strong)' : 'var(--body)',
                            }}
                            onClick={() => { setArchetype(c.name); setArchetypeOpen(false); }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <ArchetypeAvatar archetype={{ value: c.name, image: c.image }} size={18} color={c.color || 'var(--muted)'} />
                            <span style={{ marginLeft: '8px' }}>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <MicButton
                  isRecording={isDictating}
                  isProcessing={isDictatingProcessing}
                  onClick={toggleDictation}
                  style={{ width: '32px', height: '32px', flexShrink: 0 }}
                />
                <button
                  style={{ ...s.askBtn, opacity: loading || !question.trim() ? 0.4 : 1 }}
                  onClick={handleQuickSubmit}
                  disabled={loading || !question.trim()}
                >
                  {quickMode === 'entry'
                    ? `+ ${t('nav.journal')}`
                    : quickMode === 'note'
                      ? `+ ${t('nav.notes')}`
                      : t('home.ask')}
                </button>
                <QuickModeToggle mode={quickMode} onChange={handleQuickModeChange} />
              </div>
            </div>
            {/* Inline answer panel */}
            {(loading || answer) && (
              <div style={{ flex: 4, border: 'var(--border-style)', borderRadius: '16px', background: 'var(--white)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '16px 20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {loading ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0s infinite' }} />
                    <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0.2s infinite' }} />
                    <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0.4s infinite' }} />
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{answeredQuestion}"</span>
                      <span style={s.responseArchPill}>{answeredArchetype}</span>
                      <button style={s.regenBtn} onClick={handleRegen} title={t('home.regenerate')}><RegenIcon /></button>
                    </div>
                    <div style={{ flex: 1, fontSize: '13px', lineHeight: '1.6', color: 'var(--body)', overflowY: 'auto', minHeight: 0 }}>{answer}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', flexShrink: 0 }}>
                      <button
                        style={{ ...s.actionBtn, ...(playing ? s.actionBtnActive : {}) }}
                        onClick={handleSpeak}
                        title={playing ? t('mirror.stop') : t('mirror.listen')}
                      >
                        <WaveformIcon playing={playing} />
                      </button>
                      <button style={s.actionLink} onClick={handleReset}>{t('home.askAnother')}</button>
                      {saved ? (
                        <span style={s.savedMsg}>{t('home.savedToJournal')}</span>
                      ) : (
                        <button style={s.actionLink} onClick={handleSaveToJournal}>{t('home.saveToJournal')}</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>



        {/* Layout editor panel */}
        {layout.editMode && (
          <LayoutEditor
            savedLayouts={layout.savedLayouts}
            activeLayoutId={layout.activeLayoutId}
            activePresetKey={layout.activePresetKey}
            isLiminalDefault={layout.isLiminalDefault}
            dirty={layout.dirty}
            availableWidgets={layout.availableWidgets}
            onSelectLayout={layout.selectLayout}
            onAddWidget={layout.addWidget}
            onSaveLayout={layout.saveLayout}
            onDeleteLayout={layout.deleteLayout}
            onDiscard={layout.discardChanges}
            onDone={() => layout.setEditMode(false)}
          />
        )}

        {/* Widget zone */}
        <DndContext sensors={sensors} collisionDetection={customCollision} onDragEnd={handleDragEnd}>
          <SortableContext items={layout.currentLayout.map(w => w.id)} strategy={() => []}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '16px', alignItems: 'stretch' }}>
              {layout.currentLayout.map((widget) => {
                const content = renderWidget(widget.id, widget.width);
                if (!content && !layout.editMode) return null;
                return (
                  <WidgetWrapper
                    key={widget.id}
                    id={widget.id}
                    editMode={layout.editMode}
                    isLiminalDefault={layout.isLiminalDefault}
                    width={widget.width}
                    onRemove={layout.removeWidget}
                    onShrink={layout.shrinkWidget}
                    onGrow={layout.growWidget}
                  >
                    {content || <div style={{ padding: '12px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>No data yet</div>}
                  </WidgetWrapper>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

      </div>
    </div>
    {searchPopup}
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

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

function ArchetypeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// Quick Action mode-toggle icons. Open book = journal entry, page = note,
// chat-bubble = ask. Stroke-only so they pick up `currentColor` from the
// active/inactive button styling.
// Match the left-nav icons exactly so the Quick Action toggles read as the
// same actions you'd take from the sidebar.
function QuickEntryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4c2-1 4-1.5 6-1.5S12 3.5 12 4.5c0-1 3.5-2 6-1.5s4 .5 4 1.5v14c0-.5-2-1-4-1s-4.5.5-6 1.5c-1.5-1-3.5-1.5-6-1.5s-3.5.5-4 1V4z" />
      <line x1="12" y1="4.5" x2="12" y2="19.5" />
    </svg>
  );
}
function QuickNoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="16 2 16 8 22 8" />
      <line x1="10" y1="13" x2="18" y2="13" />
      <line x1="10" y1="17" x2="15" y2="17" />
    </svg>
  );
}
function QuickAskIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="13" height="7" rx="3" />
      <rect x="8" y="13.5" width="13" height="7" rx="3" fill="currentColor" />
    </svg>
  );
}

// 3-mode toggle row used by the Quick Action card. Renders three icon buttons
// with `data-tour-id="home-quick-mode-${id}"` so the home tour can spotlight
// each mode in turn.
function QuickModeToggle({ mode, onChange }) {
  const items = [
    { id: 'entry', label: 'Journal entry', Icon: QuickEntryIcon },
    { id: 'note',  label: 'Note',          Icon: QuickNoteIcon  },
    { id: 'ask',   label: 'Ask',           Icon: QuickAskIcon   },
  ];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {items.map((it) => {
        const active = mode === it.id;
        return (
          <button
            key={it.id}
            type="button"
            data-tour-id={`home-quick-mode-${it.id}`}
            onClick={() => onChange(it.id)}
            title={it.label}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: active ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
              color: active ? 'var(--strong)' : 'var(--muted)',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              boxShadow: active
                ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            <it.Icon />
          </button>
        );
      })}
    </div>
  );
}

function MoonPhaseSVGSmall({ illumination = 50, phase = '' }) {
  const size = 80;
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const fill = 'var(--strong)';

  const isWaning = phase.toLowerCase().includes('waning') || phase === 'Last Quarter';
  const isNew = phase === 'New Moon';
  const isFull = phase === 'Full Moon';
  const frac = illumination / 100;

  if (isNew) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={fill} strokeWidth="0.5" />
      </svg>
    );
  }

  if (isFull) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={fill} strokeWidth="0.5" opacity="0.15" />
      <path d={d} fill={fill} />
    </svg>
  );
}

function RegenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M21 2v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 22v-6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
