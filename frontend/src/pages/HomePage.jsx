import { useState, useMemo, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import MicButton from '../components/MicButton';
import { useDictation } from '../hooks/useDictation';
import { useLanguage } from '../i18n/LanguageContext';
import { BUILT_IN_ARCHETYPES } from '../constants/archetypes';
import ArchetypeAvatar from '../components/ArchetypeAvatar';

// ── Suggested question pool ────────────────────────────────────────────────
const QUESTION_POOL = [
  'What am I avoiding right now?',
  "What's the recurring pattern in my entries this month?",
  'What would I tell myself six months ago?',
  'Where am I being hardest on myself?',
  'What does my body need right now?',
  "What am I not saying out loud?",
  'What would the wisest version of me do?',
  'What pattern keeps showing up?',
  'What would I regret not doing?',
  'What do I actually want?',
  "What's the thing I keep circling around?",
  "What am I grateful for but not acknowledging?",
  'What needs to end?',
  'What am I ready for?',
  "What story am I telling myself that isn't true?",
  'Where am I playing small?',
  'What would courage look like right now?',
  'What needs my attention most?',
  'What am I outgrowing?',
  'What does my gut say?',
];


// ── Quick Ask rotating prompts ──────────────────────────────────────────────
const QUICK_ASK_PROMPTS = [
  "What's sitting with you today?",
  "What do you need to say out loud?",
  "What are you not telling yourself?",
  "What's the thing you keep circling around?",
  "What would the wisest version of you say right now?",
  "What does your body need today?",
  "What are you avoiding?",
  "What's asking for your attention?",
  "What would you tell a close friend in your position?",
  "Where are you being hardest on yourself?",
  "What's ready to be released?",
  "What are you pretending not to know?",
  "What feels unfinished?",
  "What small thing would make today feel more like yours?",
  "What pattern keeps showing up?",
  "What is fear telling you right now?",
  "What would courage look like today?",
  "What's the question beneath the question?",
  "What do you need more of right now?",
  "What are you grateful for that you haven't said out loud?",
];

function getDailyPrompt() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  return QUICK_ASK_PROMPTS[dayOfYear % QUICK_ASK_PROMPTS.length];
}

// ── Daily quote pool ────────────────────────────────────────────────────────
const QUOTE_POOL = [
  // Personal & Family
  { text: 'This is not a melomacarouna. This is a dry biscuit.', author: 'Elisabet' },
  { text: "It's been years, and just one day he appears at your doorstep, you let him in, and he tells a story about where he's been all those years he's been gone, then the wind will blow him away again....", author: '' },
  { text: 'BUT YOU WERE NOT HERE, I ALONE OCCUPY THE DARKNESS', author: '' },
  // Wisdom & Philosophy
  { text: 'You must take your opponent into a deep dark forest where 2+2=5, and the path leading out is only wide enough for one.', author: 'Mikhail Tal' },
  { text: "Love says I'm everything. Wisdom says I'm nothing. Between the 2 my life flows.", author: '' },
  { text: 'The perfect man employs his mind as a mirror — grasping nothing, refusing nothing, receiving but not keeping.', author: 'Jiddu Krishnamurti' },
  { text: 'The more I learn, the less I know.', author: 'Socrates' },
  { text: 'Truth is not what you want it to be; it is what it is, and you must bend to its power or live a lie.', author: 'Miyamoto Musashi' },
  { text: 'The mind and what is are not two separate processes.', author: 'J. Krishnamurti' },
  { text: 'The meaning of life is just to be alive. It is so plain and so obvious and so simple. And yet, everybody rushes around in a great panic as if it were necessary to achieve something beyond themselves.', author: 'Alan Watts' },
  { text: 'At the edge of expectation. Assumptions become belief.', author: 'Andrei Jikh' },
  { text: 'You Will Know Them by Their Fruits.', author: 'Matthew' },
  { text: 'Beware that, when fighting monsters, you yourself do not become a monster. For when you gaze long into the abyss, the abyss gazes also into you.', author: 'Friedrich Nietzsche' },
  { text: 'The thing we tell of can never be found by seeking, yet only seekers find it.', author: 'Bayazid Bastami' },
  { text: 'Om is the bow.', author: '' },
  { text: 'Wake up, grow up, clean up, show up.', author: 'Ken Wilber' },
  { text: 'We must master the art of peace in addition to the art of war.', author: 'Master Roshi' },
  { text: "However necessary it may be to say 'I' and 'mine' for the practical purposes of everyday life, our Ego in fact is nothing but a name for what is really only a sequence of observed behaviours.", author: 'Ananda Coomaraswamy' },
  { text: 'Each wave is born and is going to die, but the water is free from birth and death.', author: 'Thich Nhat Hanh' },
  { text: 'The intuitive mind is a sacred gift and the rational mind is a faithful servant. We have created a society that honors the servant and has forgotten the gift.', author: 'Albert Einstein' },
  { text: "When the opponent expands, I contract. When he contracts, I expand. And when there is an opportunity, I do not hit — it hits all by itself.", author: 'Bruce Lee' },
  { text: "Here is my secret: I don't mind what happens.", author: 'J. Krishnamurti' },
  { text: 'If you can only be tall because someone else is on their knees, then you have a serious problem.', author: 'Toni Morrison' },
  { text: 'Be careful not to wear spiritualism as a badge to decorate your ego.', author: '' },
  { text: 'Thou canst not stir a flower without troubling of a star.', author: 'Francis Thompson' },
  { text: 'Trust in God, but tie your camel.', author: 'Prophet Muhammad' },
  { text: 'Awakened One, listen without distraction. Do not let your thoughts wander.', author: '' },
  { text: 'Meaning is a jumper that you have to knit yourself.', author: '' },
  { text: 'We spin cocoons around ourselves and get possessed by our possessions.', author: '' },
  { text: 'The forest was shrinking but the trees kept voting for the axe. For the axe was clever and convinced the trees that because his handle was wood he was one of them.', author: '' },
  { text: 'Hard times create strong men. Strong men create good times. Good times create weak men. And weak men create hard times.', author: 'G. Michael Hopf' },
  { text: 'Be like a tree. Let the dead leaves drop.', author: 'Rumi' },
  { text: 'Never make a permanent decision from a temporary emotion.', author: '' },
  { text: 'The places where you have the biggest challenges in your life become the places where you have the most to give.', author: 'Tracy McMillan' },
  { text: 'Wake up. To see the farm is to leave it.', author: '' },
  { text: 'All we ever want is the clues. Let people fill in the gaps.', author: '' },
  { text: 'What you seek is seeking you.', author: 'Rumi' },
  { text: 'Do not consider painful what is good for you.', author: 'Euripides' },
  { text: 'When the power of love overcomes the love of power, the world will know peace.', author: 'Jimi Hendrix' },
  { text: 'REALITY is coupled PERCEPTION & PERCEPTION can be MEDIATED & MANIPULATED', author: '' },
  { text: 'But war, organised war, is not a human instinct. It is a highly planned and cooperative form of theft.', author: '' },
  { text: 'Do not go where the path may lead. Go instead where there is no path and leave a trail.', author: 'Ralph Waldo Emerson' },
  // From the curated pool
  { text: 'No snowflake ever falls in the wrong place.', author: 'Zen proverb' },
  { text: 'The only way out is through.', author: 'Robert Frost' },
  { text: 'You are not a drop in the ocean. You are the entire ocean in a drop.', author: 'Rumi' },
  { text: 'The privilege of a lifetime is to become who you truly are.', author: 'Carl Jung' },
  { text: 'The wound is the place where the light enters you.', author: 'Rumi' },
  { text: 'Between stimulus and response there is a space.', author: 'Viktor Frankl' },
  { text: 'Be patient toward all that is unsolved in your heart.', author: 'Rainer Maria Rilke' },
  { text: 'The cave you fear to enter holds the treasure you seek.', author: 'Joseph Campbell' },
  { text: 'What we are looking for is what is looking.', author: 'Francis of Assisi' },
  { text: 'The only journey is the one within.', author: 'Rainer Maria Rilke' },
  { text: 'Sit. Feast on your life.', author: 'Derek Walcott' },
  { text: 'What is essential is invisible to the eye.', author: 'Antoine de Saint-Exupéry' },
];

function getDailyQuote() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  return QUOTE_POOL[dayOfYear % QUOTE_POOL.length];
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
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--strong)',
    marginBottom: '6px',
  },
  greetingDate: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginBottom: '24px',
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
    flex: '0 0 70%',
    background: 'var(--near-white)',
    border: 'none',
    borderRadius: '16px',
    padding: '20px 28px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-evenly',
    gap: '0',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  beveledRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '12px 0',
  },
  beveledRowBorder: {
    borderTop: 'var(--border-style)',
  },
  beveledRowLabel: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    width: '160px',
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    paddingRight: '20px',
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
  },
  // Insights card (used inside beveled)
  insightStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '12%',
    flexShrink: 0,
  },
  insightStatDays: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    width: '15%',
    flexShrink: 0,
  },
  insightDividerDays: {
    width: '1px',
    background: 'var(--border)',
    alignSelf: 'stretch',
    minHeight: '28px',
    marginLeft: '20px',
    flexShrink: 0,
  },
  insightStatRight: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '2px',
    marginLeft: 'auto',
    width: '40%',
    flexShrink: 0,
    borderLeft: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    paddingLeft: '20px',
    paddingRight: '20px',
    alignSelf: 'stretch',
  },
  insightValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--strong)',
    lineHeight: 1,
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
    padding: '0 4px',
    flexShrink: 0,
    textAlign: 'left',
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
    flex: 1,
    minWidth: 0,
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
    flex: 1,
    minWidth: 0,
  },
  dailyFlipContainer: {
    width: 80,
    height: 137,
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
    flex: 1,
    minWidth: 0,
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
    background: 'var(--border)',
    alignSelf: 'stretch',
  },
  dailyCardReading: {
    flex: 2,
    fontSize: '11px',
    color: 'var(--body)',
    fontStyle: 'italic',
    lineHeight: '1.6',
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
    flex: 1,
    background: 'var(--near-white)',
    border: 'none',
    borderRadius: '16px',
    padding: '20px 28px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    minWidth: 0,
    boxSizing: 'border-box',
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
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
    bottom: '42px',
    right: 0,
    background: 'var(--white)',
    borderRadius: '12px',
    padding: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
    zIndex: 50,
    minWidth: '160px',
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
  rhythmRow: {
    display: 'flex',
    gap: '5px',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  rhythmRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  rhythmDot: {
    width: '7px',
    height: '7px',
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

function getGreeting(t) {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return t('home.greeting.morning');
  if (h >= 12 && h < 17) return t('home.greeting.afternoon');
  return t('home.greeting.evening');
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

export default function HomePage({ username, avatarUrl, onNavigateToEntry, onNavigateToNote, onNavigateToOracle, onNavigateToSky, onNavigateToCards, onNavigateToPortrait, onNewEntry, onNewNote, onNewConversation }) {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState(username || '');

  // Fetch preferred name from portrait
  useEffect(() => {
    apiFetch('/api/portrait').then(r => r.json()).then(p => {
      if (p.preferred_name) setDisplayName(p.preferred_name);
    }).catch(() => {});
  }, []);

  // Moon & sky
  const [moon, setMoon] = useState(null);
  const [conditions, setConditions] = useState(null);

  // Portrait calculated data
  const [portrait, setPortrait] = useState(null);

  // Daily card
  const [dailyCard, setDailyCard] = useState(null);
  const [cardFlipped, setCardFlipped] = useState(false);

  // Stats
  const [entryCount, setEntryCount] = useState(null);
  const [lastEntryDate, setLastEntryDate] = useState(null);
  const [latestEntryTitle, setLatestEntryTitle] = useState(null);
  const [latestEntryId, setLatestEntryId] = useState(null);
  const [noteCount, setNoteCount] = useState(null);
  const [lastNoteDate, setLastNoteDate] = useState(null);
  const [latestNoteTitle, setLatestNoteTitle] = useState(null);
  const [latestNoteId, setLatestNoteId] = useState(null);
  const [oracleCount, setOracleCount] = useState(null);
  const [lastOracleDate, setLastOracleDate] = useState(null);
  const [latestOraclePreview, setLatestOraclePreview] = useState(null);
  const [latestOracleSessionId, setLatestOracleSessionId] = useState(null);

  // Quick Ask state
  const [question, setQuestion] = useState('');
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
  const [ttsOnline, setTtsOnline] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const [cardPlaying, setCardPlaying] = useState(false);
  const cardAudioRef = useRef(null);
  const [cardSaved, setCardSaved] = useState(false);

  // Pulse, Insight, Themes, Rhythm
  const [pulse, setPulse] = useState(null);
  const [pulseDays, setPulseDays] = useState('');
  const [insight, setInsight] = useState(null);
  const [themes, setThemes] = useState([]);
  const [rhythm, setRhythm] = useState([]);
  const [insightPlaying, setInsightPlaying] = useState(false);
  const insightAudioRef = useRef(null);
  const [pulsePlaying, setPulsePlaying] = useState(false);
  const pulseAudioRef = useRef(null);
  const [quotePlaying, setQuotePlaying] = useState(false);
  const quoteAudioRef = useRef(null);
  const [quoteSaved, setQuoteSaved] = useState(false);
  const [pulseSaved, setPulseSaved] = useState(false);
  const [insightSaved, setInsightSaved] = useState(false);

  // Suggested questions — pick 4 once per session
  const suggested = useMemo(() => pickRandom(QUESTION_POOL, 4), []);
  const dailyPrompt = useMemo(() => getDailyPrompt(), []);

  const textareaRef = useRef(null);
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
          const preview = (note.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          setLatestNoteTitle(preview ? `${note.type ? note.type.charAt(0).toUpperCase() + note.type.slice(1) + ' — ' : ''}${preview.slice(0, 30)}` : null);
        }
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

    fetch('/api/tts/status').then((r) => r.json()).then((d) => {
      setTtsOnline(d.online);
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
      if (data?.themes?.length >= 3) setThemes(data.themes);
    }).catch(() => {});

    // Insight
    apiFetch('/api/home/insight').then(r => r.json()).then(data => {
      if (data?.insight) setInsight(data.insight);
    }).catch(() => {});

    // Rhythm
    apiFetch('/api/home/rhythm').then(r => r.json()).then(data => {
      if (data?.rhythm) setRhythm(data.rhythm);
    }).catch(() => {});
  }, []);

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

  async function handleAsk() {
    const q = question.trim();
    if (!q || loading) return;
    const activeArchetype = archetype;

    setLoading(true);
    setAnswer(null);
    setSaved(false);
    stopAudio();

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
    stopAudio();

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
      await apiFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      setCardSaved(true);
    } catch {}
  }

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setPlaying(false);
  }

  async function speakText(text, audioRef, setPlayingState) {
    if (!text) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setPlayingState(prev => {
      if (prev) return false; // was playing, just stop
      // Start playing
      (async () => {
        if (ttsOnline) {
          try {
            setPlayingState(true);
            const res = await fetch('/api/tts/speak', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text }),
            });
            if (res.ok) {
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              audioRef.current = audio;
              audio.onended = () => { setPlayingState(false); URL.revokeObjectURL(url); };
              audio.onerror = () => setPlayingState(false);
              await audio.play();
              return;
            }
          } catch {}
        }
        if (window.speechSynthesis) {
          const utt = new SpeechSynthesisUtterance(text);
          utt.onend = () => setPlayingState(false);
          utt.onerror = () => setPlayingState(false);
          window.speechSynthesis.speak(utt);
          setPlayingState(true);
        }
      })();
      return true;
    });
  }

  function handleQuoteSpeak(text) { speakText(text, quoteAudioRef, setQuotePlaying); }
  async function handleSaveQuote(q) {
    if (quoteSaved) return;
    const title = q.author ? `"${q.text.slice(0, 50)}…" — ${q.author}` : `"${q.text.slice(0, 60)}…"`;
    const body = `<p><em>"${q.text}"</em></p>${q.author ? `<p>— ${q.author}</p>` : ''}`;
    try {
      await apiFetch('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) });
      setQuoteSaved(true);
    } catch {}
  }
  async function handleSavePulse() {
    if (pulseSaved || !pulse) return;
    const title = `Pulse — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    const body = `<p><em>"${pulse}"</em></p><p><small>— from your last entry, ${pulseDays}</small></p>`;
    try {
      await apiFetch('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) });
      setPulseSaved(true);
    } catch {}
  }
  function handlePulseSpeak() { speakText(pulse, pulseAudioRef, setPulsePlaying); }
  function handleInsightSpeak() { speakText(insight, insightAudioRef, setInsightPlaying); }
  async function handleSaveInsight() {
    if (insightSaved || !insight) return;
    const title = `Insight — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    const body = `<p><em>"${insight}"</em></p>`;
    try {
      await apiFetch('/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body }) });
      setInsightSaved(true);
    } catch {}
  }


  async function handleCardSpeak(e) {
    e.stopPropagation(); // don't navigate to cards page
    if (cardPlaying) {
      if (cardAudioRef.current) { cardAudioRef.current.pause(); cardAudioRef.current = null; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setCardPlaying(false);
      return;
    }
    const text = dailyCard?.reading || dailyCard?.insight;
    if (!text) return;

    if (ttsOnline) {
      try {
        setCardPlaying(true);
        const res = await fetch('/api/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          cardAudioRef.current = audio;
          audio.onended = () => { setCardPlaying(false); URL.revokeObjectURL(url); };
          audio.onerror = () => setCardPlaying(false);
          await audio.play();
          return;
        }
      } catch {}
    }
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.onend = () => setCardPlaying(false);
      utt.onerror = () => setCardPlaying(false);
      window.speechSynthesis.speak(utt);
      setCardPlaying(true);
    }
  }

  async function handleSpeak() {
    if (playing) { stopAudio(); return; }
    if (!answer) return;

    if (ttsOnline) {
      try {
        setPlaying(true);
        const res = await fetch('/api/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: answer }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
          audio.onerror = () => { setPlaying(false); };
          await audio.play();
          return;
        }
      } catch {}
    }
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(answer);
      utt.onend = () => setPlaying(false);
      utt.onerror = () => setPlaying(false);
      window.speechSynthesis.speak(utt);
      setPlaying(true);
    }
  }

  function handleReset() {
    setQuestion('');
    setAnswer(null);
    setAnsweredQuestion('');
    setAnsweredArchetype('');
    setSaved(false);
    stopAudio();
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div style={s.root}>
      <div style={s.inner}>
        {/* Greeting */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--panel-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '600', color: 'var(--muted)', flexShrink: 0 }}>
              {(displayName || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={s.greeting}>
            {getGreeting(t)}{displayName ? `, ${displayName}` : ''}.
          </div>
        </div>
        <div style={s.greetingDate}>{today}</div>

        {/* Daily quote */}
        {(() => { const q = getDailyQuote(); return (
          <div style={s.quoteBlock}>
            <span style={s.quoteText}>"{q.text}"</span>
            <span style={s.pulseAttribution}>
              {q.author && <span>— {q.author}</span>}
              <button style={s.pulseSpeaker} onClick={() => handleQuoteSpeak(q.text)} title="Read aloud">
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: 'middle' }}>
                  <rect x="1" y={quotePlaying ? 2 : 4} width="2" height={quotePlaying ? 10 : 6} rx="1" fill="currentColor">
                    {quotePlaying && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="4.5" y={quotePlaying ? 0 : 2} width="2" height={quotePlaying ? 14 : 10} rx="1" fill="currentColor">
                    {quotePlaying && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="8" y={quotePlaying ? 3 : 4} width="2" height={quotePlaying ? 8 : 6} rx="1" fill="currentColor">
                    {quotePlaying && <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="11.5" y={quotePlaying ? 1 : 3} width="2" height={quotePlaying ? 12 : 8} rx="1" fill="currentColor">
                    {quotePlaying && <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />}
                  </rect>
                </svg>
              </button>
              <button style={s.cardActionBtn} onClick={() => handleSaveQuote(q)}>{quoteSaved ? '✓ Saved' : '+ Save to journal'}</button>
            </span>
          </div>
        ); })()}

        {/* Moon + Daily Card row */}
        <div style={s.moonCardRow}>
          {/* Moon panel → Sky */}
          {moon && (
            <div style={s.moonCard}>
              <MoonPhaseSVGSmall illumination={moon.illumination ?? 50} phase={moon.phase ?? ''} />
              <div style={s.moonInfo}>
                <div style={s.moonPhase}>{moon.phase}</div>
                <div style={s.moonDetail}>
                  {moon.illumination != null && <span>{Math.round(moon.illumination)}% illuminated</span>}
                  {moon.moonSign && <span> &middot; Moon in {moon.moonSign}</span>}
                </div>
                {moon.meaning && <div style={s.moonMeaning}>{moon.meaning}</div>}
              </div>
              {conditions && conditions.length > 0 && (
                <>
                  <div style={s.moonDivider} />
                  <div style={s.conditionsInfo}>
                    {conditions.map((c) => (
                      <div key={c.planet} style={s.conditionRow}>
                        <span style={s.conditionPlanet}>{c.planet}</span>
                        <span style={s.conditionSign}>
                          {c.sign}
                          {c.retrograde ? ' ℞' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <span style={s.moonArrowLink} onClick={() => onNavigateToSky?.()} title="View Sky">&rsaquo;</span>
            </div>
          )}

          {/* Daily Card → Cards */}
          {dailyCard && (
            <div style={s.dailyCardPanel}>
              <div style={s.dailyFlipContainer}>
                <div style={{
                  ...s.dailyFlipInner,
                  transform: cardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}>
                  <div style={s.dailyFlipFace}>
                    <img src="/cards/card-back.png" alt="Card back" style={s.dailyCardImg} />
                  </div>
                  <div style={{ ...s.dailyFlipFace, transform: 'rotateY(180deg)' }}>
                    {dailyCard.image ? (
                      <img
                        src={dailyCard.image}
                        alt={dailyCard.name}
                        style={{
                          ...s.dailyCardImg,
                          transform: dailyCard.reversed ? 'rotate(180deg)' : 'none',
                        }}
                      />
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
                <div style={s.dailyCardLabel}>Daily Card</div>
                <div style={s.dailyCardName}>
                  {dailyCard.name}{dailyCard.reversed ? ' (Reversed)' : ''}
                </div>
              </div>
              {(dailyCard.reading || dailyCard.insight) && (
                <>
                  <div style={s.dailyCardDivider} />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 4, minWidth: 0 }}>
                    <div style={s.dailyCardReading}>
                      {(dailyCard.reading || dailyCard.insight)}
                    </div>
                    <div style={s.cardActions}>
                      <button
                        style={{ ...s.cardActionBtn, color: cardPlaying ? 'var(--strong)' : 'var(--muted)' }}
                        onClick={handleCardSpeak}
                        title="Read aloud"
                      >
                        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: 'middle' }}>
                          <rect x="1" y={cardPlaying ? 2 : 4} width="2" height={cardPlaying ? 10 : 6} rx="1" fill="currentColor">
                            {cardPlaying && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
                          </rect>
                          <rect x="4.5" y={cardPlaying ? 0 : 2} width="2" height={cardPlaying ? 14 : 10} rx="1" fill="currentColor">
                            {cardPlaying && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
                          </rect>
                          <rect x="8" y={cardPlaying ? 3 : 4} width="2" height={cardPlaying ? 8 : 6} rx="1" fill="currentColor">
                            {cardPlaying && <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />}
                          </rect>
                          <rect x="11.5" y={cardPlaying ? 1 : 3} width="2" height={cardPlaying ? 12 : 8} rx="1" fill="currentColor">
                            {cardPlaying && <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />}
                          </rect>
                        </svg>
                      </button>
                      <button
                        style={s.cardActionBtn}
                        onClick={handleSaveCardToJournal}
                        title="Save to journal"
                      >
                        {cardSaved ? '✓ Saved' : '+ Save to journal'}
                      </button>
                    </div>
                  </div>
                </>
              )}
              <span style={s.moonArrowLink} onClick={() => onNavigateToCards?.()} title="View Cards">&rsaquo;</span>
            </div>
          )}
        </div>

        {/* Pulse */}
        {pulse && (
          <div style={s.pulseBlock}>
            <div style={s.pulseText}>"{pulse}"</div>
            <div style={s.pulseAttribution}>
              <span>— from your last entry, {pulseDays}</span>
              <button style={s.pulseSpeaker} onClick={handlePulseSpeak} title="Read aloud">
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: 'middle' }}>
                  <rect x="1" y={pulsePlaying ? 2 : 4} width="2" height={pulsePlaying ? 10 : 6} rx="1" fill="currentColor">
                    {pulsePlaying && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="4.5" y={pulsePlaying ? 0 : 2} width="2" height={pulsePlaying ? 14 : 10} rx="1" fill="currentColor">
                    {pulsePlaying && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="8" y={pulsePlaying ? 3 : 4} width="2" height={pulsePlaying ? 8 : 6} rx="1" fill="currentColor">
                    {pulsePlaying && <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="11.5" y={pulsePlaying ? 1 : 3} width="2" height={pulsePlaying ? 12 : 8} rx="1" fill="currentColor">
                    {pulsePlaying && <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />}
                  </rect>
                </svg>
              </button>
              <button style={s.cardActionBtn} onClick={handleSavePulse}>{pulseSaved ? '✓ Saved' : '+ Save to journal'}</button>
            </div>
          </div>
        )}

        {/* Activity + Portrait row */}
        <div style={s.activityPortraitRow}>
        <div style={s.beveledSquare}>
            {/* Journal row */}
            <div style={s.beveledRow}>
              <span style={s.beveledRowLabel}>{t('nav.journal')}</span>
              <div style={s.insightStat}>
                <span style={s.insightValue}>{entryCount ?? '—'}</span>
                <span style={s.insightLabel}>{t('home.entriesWritten')}</span>
              </div>
              <div style={s.insightDividerDays} />
              <div style={s.insightStatDays}>
                <span style={s.insightValue}>{lastEntryDate ? formatRelativeDate(lastEntryDate, t) : '—'}</span>
                <span style={s.insightLabel}>{t('home.lastWritten')}</span>
              </div>
              {latestEntryTitle ? (
                <div
                  style={{ ...s.insightStatRight, cursor: 'pointer' }}
                  onClick={() => onNavigateToEntry?.(latestEntryId)}
                  title={t('home.openInJournal')}
                >
                  <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>
                    {latestEntryTitle.slice(0, 30)}{latestEntryTitle.length > 30 ? '…' : ''}
                  </span>
                  <span style={s.insightLabel}>{t('home.latestEntry')}</span>
                </div>
              ) : (
                <div style={s.insightStatRight} />
              )}
              <button style={s.newLinkInline} onClick={(e) => { e.stopPropagation(); onNewEntry?.(); }}>
                <span style={s.newLinkValue}>+</span>
                <span style={s.newLinkLabel}>New</span>
              </button>
            </div>

            {/* Notes row */}
            <div style={{ ...s.beveledRow, ...s.beveledRowBorder }}>
              <span style={s.beveledRowLabel}>{t('nav.notes')}</span>
              <div style={s.insightStat}>
                <span style={s.insightValue}>{noteCount ?? '—'}</span>
                <span style={s.insightLabel}>{t('home.notesWritten')}</span>
              </div>
              <div style={s.insightDividerDays} />
              <div style={s.insightStatDays}>
                <span style={s.insightValue}>{lastNoteDate ? formatRelativeDate(lastNoteDate, t) : '—'}</span>
                <span style={s.insightLabel}>{t('home.lastWritten')}</span>
              </div>
              {latestNoteTitle ? (
                <div
                  style={{ ...s.insightStatRight, cursor: 'pointer' }}
                  onClick={() => onNavigateToNote?.(latestNoteId)}
                  title={t('home.openInNotes')}
                >
                  <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>
                    {latestNoteTitle.slice(0, 30)}{latestNoteTitle.length > 30 ? '…' : ''}
                  </span>
                  <span style={s.insightLabel}>{t('home.latestNote')}</span>
                </div>
              ) : (
                <div style={s.insightStatRight} />
              )}
              <button style={s.newLinkInline} onClick={(e) => { e.stopPropagation(); onNewNote?.(); }}>
                <span style={s.newLinkValue}>+</span>
                <span style={s.newLinkLabel}>New</span>
              </button>
            </div>

            {/* Oracle row */}
            <div style={{ ...s.beveledRow, ...s.beveledRowBorder }}>
              <span style={s.beveledRowLabel}>{t('nav.oracle')}</span>
              <div style={s.insightStat}>
                <span style={s.insightValue}>{oracleCount ?? '—'}</span>
                <span style={s.insightLabel}>{t('home.conversations')}</span>
              </div>
              <div style={s.insightDividerDays} />
              <div style={s.insightStatDays}>
                <span style={s.insightValue}>{lastOracleDate ? formatRelativeDate(lastOracleDate, t) : '—'}</span>
                <span style={s.insightLabel}>{t('home.lastConversation')}</span>
              </div>
              {latestOraclePreview ? (
                <div
                  style={{ ...s.insightStatRight, cursor: 'pointer' }}
                  onClick={() => onNavigateToOracle?.(latestOracleSessionId)}
                  title={t('home.openInOracle')}
                >
                  <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>
                    {latestOraclePreview.slice(0, 30)}{latestOraclePreview.length > 30 ? '…' : ''}
                  </span>
                  <span style={s.insightLabel}>{t('home.latestConversation')}</span>
                </div>
              ) : (
                <div style={s.insightStatRight} />
              )}
              <button style={s.newLinkInline} onClick={(e) => { e.stopPropagation(); onNewConversation?.(); }}>
                <span style={s.newLinkValue}>+</span>
                <span style={s.newLinkLabel}>New</span>
              </button>
            </div>
          </div>

          {/* Portrait pill */}
          {portrait?.birth_date && (
            <div style={s.portraitPill} onClick={() => onNavigateToPortrait?.()}>
              <div style={s.portraitContent}>
                <div style={s.portraitHeader}>
                  <span style={s.portraitLabel}>Your Portrait</span>
                </div>
                <div style={s.portraitGrid}>
                {portrait.sun_sign && (
                  <div style={s.portraitItem}>
                    <span style={s.portraitItemValue}>☉ {portrait.sun_sign}</span>
                    <span style={s.portraitItemLabel}>Sun</span>
                  </div>
                )}
                {portrait.moon_sign && (
                  <div style={s.portraitItem}>
                    <span style={s.portraitItemValue}>☽ {portrait.moon_sign}</span>
                    <span style={s.portraitItemLabel}>Moon</span>
                  </div>
                )}
                {portrait.rising_sign && (
                  <div style={s.portraitItem}>
                    <span style={s.portraitItemValue}>↑ {portrait.rising_sign}</span>
                    <span style={s.portraitItemLabel}>Rising</span>
                  </div>
                )}
                {portrait.chinese_zodiac && (
                  <div style={s.portraitItem}>
                    <span style={s.portraitItemValue}>{portrait.chinese_element ? `${portrait.chinese_element} ` : ''}{portrait.chinese_zodiac}</span>
                    <span style={s.portraitItemLabel}>Chinese Zodiac</span>
                  </div>
                )}
                {portrait.life_path_number != null && (
                  <div style={s.portraitItem}>
                    <span style={s.portraitItemValue}>{portrait.life_path_number}</span>
                    <span style={s.portraitItemLabel}>Life Path</span>
                  </div>
                )}
                {portrait.soul_card && (
                  <div style={s.portraitItem}>
                    <span style={s.portraitItemValue}>{portrait.soul_card}</span>
                    <span style={s.portraitItemLabel}>Soul Card</span>
                  </div>
                )}
                {portrait.life_path_card && (
                  <div style={s.portraitItem}>
                    <span style={s.portraitItemValue}>{portrait.life_path_card}</span>
                    <span style={s.portraitItemLabel}>Life Path Card</span>
                  </div>
                )}
                {portrait.mbti && (
                  <div style={s.portraitItem}>
                    <span style={s.portraitItemValue}>{portrait.mbti}</span>
                    <span style={s.portraitItemLabel}>MBTI</span>
                  </div>
                )}
                </div>
              </div>
              <span style={s.moonArrowLink} onClick={(e) => { e.stopPropagation(); onNavigateToPortrait?.(); }}>›</span>
            </div>
          )}
        </div>

        {/* Insight block */}
        {insight && (
          <div style={s.insightBlock}>
            <div style={s.insightText}>"{insight}"</div>
            <div style={s.pulseAttribution}>
              <span>— insight</span>
              <button style={s.pulseSpeaker} onClick={handleInsightSpeak} title="Read aloud">
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ verticalAlign: 'middle' }}>
                  <rect x="1" y={insightPlaying ? 2 : 4} width="2" height={insightPlaying ? 10 : 6} rx="1" fill="currentColor">
                    {insightPlaying && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="4.5" y={insightPlaying ? 0 : 2} width="2" height={insightPlaying ? 14 : 10} rx="1" fill="currentColor">
                    {insightPlaying && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="8" y={insightPlaying ? 3 : 4} width="2" height={insightPlaying ? 8 : 6} rx="1" fill="currentColor">
                    {insightPlaying && <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />}
                  </rect>
                  <rect x="11.5" y={insightPlaying ? 1 : 3} width="2" height={insightPlaying ? 12 : 8} rx="1" fill="currentColor">
                    {insightPlaying && <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />}
                  </rect>
                </svg>
              </button>
              <button style={s.cardActionBtn} onClick={handleSaveInsight}>{insightSaved ? '✓ Saved' : '+ Save to journal'}</button>
            </div>
          </div>
        )}

        {/* Recurring Themes + Your Rhythm — combined pill */}
        {(themes.length >= 3 || rhythm.length > 0) && (
          <div style={s.themesRhythmRow}>
            {/* Recurring Themes pill */}
            <div style={{ ...s.themesRhythmPill, ...s.themesHalf }}>
              <div style={s.themesHeader}>
                <span style={s.themesLabel}>Recurring Themes</span>
                <span style={s.themesPeriod}> ·  this month</span>
              </div>
              {themes.length >= 3 ? (
                <div style={s.themesRow}>
                  {themes.map(({ tag, count }) => {
                    const maxCount = themes[0]?.count || 1;
                    const scale = 0.85 + 0.15 * (count / maxCount);
                    return (
                      <span
                        key={tag}
                        style={{ ...s.themePill, fontSize: `${11 * scale}px` }}
                        title={`${count} entries`}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>Not enough data yet</span>
              )}
            </div>

            {/* Your Rhythm pill */}
            <div style={{ ...s.themesRhythmPill, ...s.rhythmHalf }}>
              <div style={s.rhythmHeader}>
                <span style={s.rhythmLabel}>Your Rhythm</span>
                <span style={s.rhythmPeriod}> ·  last 210 days</span>
              </div>
              {rhythm.length > 0 ? (
                <div style={s.rhythmRows}>
                  {[0, 1, 2].map(row => {
                    const third = Math.ceil(rhythm.length / 3);
                    const slice = rhythm.slice(row * third, (row + 1) * third);
                    return (
                      <div key={row} style={s.rhythmRow}>
                        {slice.map((day) => (
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
                  })}
                </div>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>No entries yet</span>
              )}
            </div>
          </div>
        )}

        {/* Quick Ask */}
        <div style={s.sectionTitle}>{t('home.quickAsk')}</div>

        {/* Input card */}
        <div style={s.askCard}>
          <textarea
            ref={textareaRef}
            style={s.textarea}
            placeholder={dailyPrompt}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
            }}
            rows={2}
          />
          <div style={s.askCardFooter}>
            <div style={{ flex: 1 }} />
            {/* Archetype picker button */}
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
                  if (custom) return <ArchetypeAvatar archetype={{ value: custom.name }} size={20} color={custom.color || 'var(--strong)'} />;
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
                      <ArchetypeAvatar archetype={{ value: c.name }} size={18} color={c.color || 'var(--muted)'} />
                      <span style={{ marginLeft: '8px' }}>{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Mic */}
            <MicButton
              isRecording={isDictating}
              isProcessing={isDictatingProcessing}
              onClick={toggleDictation}
              style={{ width: '32px', height: '32px', flexShrink: 0 }}
            />
            <button
              style={{ ...s.askBtn, opacity: loading || !question.trim() ? 0.4 : 1 }}
              onClick={handleAsk}
              disabled={loading || !question.trim()}
            >
              {t('home.ask')}
            </button>
          </div>
        </div>

        {/* Suggested questions */}
        <div style={s.suggestedRow}>
          {suggested.map((q) => (
            <button
              key={q}
              style={s.suggestedPill}
              onClick={() => setQuestion(q)}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--near-white)'; e.currentTarget.style.borderColor = 'var(--strong)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={s.loadingDots}>
            <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0s infinite' }} />
            <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0.2s infinite' }} />
            <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0.4s infinite' }} />
          </div>
        )}

        {/* Response */}
        {answer && !loading && (
          <div style={s.responseCard}>
            <div style={s.responseHeader}>
              <span style={s.responseQuestion}>"{answeredQuestion}"</span>
              <span style={s.responseArchPill}>{answeredArchetype}</span>
              <button style={s.regenBtn} onClick={handleRegen} title={t('home.regenerate')}>
                <RegenIcon />
              </button>
            </div>

            <div style={s.responseBody}>{answer}</div>

            <div style={s.responseActions}>
              <button
                style={{ ...s.actionBtn, ...(playing ? s.actionBtnActive : {}) }}
                onClick={handleSpeak}
                title={playing ? t('mirror.stop') : t('mirror.listen')}
              >
                <WaveformIcon playing={playing} />
              </button>

              <button style={s.actionLink} onClick={handleReset}>
                {t('home.askAnother')}
              </button>

              {saved ? (
                <span style={s.savedMsg}>{t('home.savedToJournal')}</span>
              ) : (
                <button style={s.actionLink} onClick={handleSaveToJournal}>
                  {t('home.saveToJournal')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
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
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M11 6.5A4.5 4.5 0 1 1 6.5 2M6.5 2L9 4.5M6.5 2L4 4.5"
        stroke="currentColor" strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
