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


// ── Daily quote pool ────────────────────────────────────────────────────────
const QUOTE_POOL = [
  { text: 'The present moment always will have been.', author: 'Eckhart Tolle' },
  { text: 'Out beyond ideas of wrongdoing and rightdoing, there is a field. I\'ll meet you there.', author: 'Rumi' },
  { text: 'You are not a drop in the ocean. You are the entire ocean in a drop.', author: 'Rumi' },
  { text: 'Sell your cleverness and buy bewilderment.', author: 'Rumi' },
  { text: 'The wound is the place where the light enters you.', author: 'Rumi' },
  { text: 'Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.', author: 'Rumi' },
  { text: 'Do not be satisfied with the stories that come before you. Unfold your own myth.', author: 'Rumi' },
  { text: 'The bird of the soul sits alone on the branch of love, singing.', author: 'Farid ud-Din Attar' },
  { text: 'The secret is not far — it is closer than your own breath.', author: 'Farid ud-Din Attar' },
  { text: 'Even after all this time the sun never says to the earth, "You owe me." Look what happens with a love like that — it lights the whole sky.', author: 'Hafiz' },
  { text: 'I wish I could show you, when you are lonely or in darkness, the astonishing light of your own being.', author: 'Hafiz' },
  { text: 'The heart is the thousand-stringed instrument that can only be tuned with love.', author: 'Hafiz' },
  { text: 'Not Christian or Jew or Muslim, not Hindu, Buddhist, sufi, or zen. Not any religion or cultural system... I belong to the beloved.', author: 'Rumi' },
  { text: 'What you are looking for is already in you.', author: 'Thich Nhat Hanh' },
  { text: 'The most precious gift we can offer anyone is our attention.', author: 'Thich Nhat Hanh' },
  { text: 'Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.', author: 'Thich Nhat Hanh' },
  { text: 'The present moment is the only moment available to us, and it is the door to all moments.', author: 'Thich Nhat Hanh' },
  { text: 'Nothing is so strong as gentleness, nothing so gentle as real strength.', author: 'Francis de Sales' },
  { text: 'When you realize there is nothing lacking, the whole world belongs to you.', author: 'Lao Tzu' },
  { text: 'To the mind that is still, the whole universe surrenders.', author: 'Lao Tzu' },
  { text: 'Knowing others is intelligence; knowing yourself is true wisdom. Mastering others is strength; mastering yourself is true power.', author: 'Lao Tzu' },
  { text: 'Nature does not hurry, yet everything is accomplished.', author: 'Lao Tzu' },
  { text: 'A journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  { text: 'The usefulness of a cup is in its emptiness.', author: 'Lao Tzu' },
  { text: 'To the sage, now is enough. Always.', author: 'Zhuangzi' },
  { text: 'Flow with whatever may happen, and let your mind be free. Stay centered by accepting whatever you are doing. This is the ultimate.', author: 'Zhuangzi' },
  { text: 'The true man breathes with his heels; the vulgar man breathes with his throat.', author: 'Zhuangzi' },
  { text: 'Before enlightenment, chop wood, carry water. After enlightenment, chop wood, carry water.', author: 'Zen Proverb' },
  { text: 'The obstacle is the path.', author: 'Zen Proverb' },
  { text: 'If you understand, things are just as they are. If you do not understand, things are just as they are.', author: 'Zen Proverb' },
  { text: 'Sit, walk, or run — but don\'t wobble.', author: 'Zen Proverb' },
  { text: 'No snowflake ever falls in the wrong place.', author: 'Zen Proverb' },
  { text: 'To study the self is to forget the self.', author: 'Dogen' },
  { text: 'Being is not empty. Emptiness is not being. This is the absolute ground of all reality.', author: 'Dogen' },
  { text: 'Think not-thinking.', author: 'Dogen' },
  { text: 'The most important thing is to find out what is the most important thing.', author: 'Shunryu Suzuki' },
  { text: 'In the beginner\'s mind there are many possibilities, but in the expert\'s mind there are few.', author: 'Shunryu Suzuki' },
  { text: 'Each of you is perfect the way you are... and you can use a little improvement.', author: 'Shunryu Suzuki' },
  { text: 'The nature of mind is like water. If you do not disturb it, it will become clear.', author: 'Chögyam Trungpa' },
  { text: 'The bad news is you\'re falling through the air, nothing to hang on to, no parachute. The good news is there\'s no ground.', author: 'Chögyam Trungpa' },
  { text: 'Chaos should be regarded as extremely good news.', author: 'Chögyam Trungpa' },
  { text: 'You are the sky. Everything else is just the weather.', author: 'Pema Chödrön' },
  { text: 'Nothing ever goes away until it has taught us what we need to know.', author: 'Pema Chödrön' },
  { text: 'Feelings like disappointment, embarrassment, irritation, resentment, anger, jealousy, and fear... are moments that tell us where it is that we\'re holding back.', author: 'Pema Chödrön' },
  { text: 'When we protect ourselves so we won\'t feel pain, that protection becomes like armor, like armor that imprisons the softness of the heart.', author: 'Pema Chödrön' },
  { text: 'Rest in natural great peace this exhausted mind, beaten helpless by karma and neurotic thought.', author: 'Nyoshul Khen Rinpoche' },
  { text: 'The nature of mind is the nature of Buddha. There is no Buddha other than one\'s own mind.', author: 'Milarepa' },
  { text: 'Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment.', author: 'Attributed to the Buddha' },
  { text: 'Everything arises and passes away. When you see this, you are above sorrow.', author: 'Attributed to the Buddha' },
  { text: 'Peace comes from within. Do not seek it without.', author: 'Attributed to the Buddha' },
  { text: 'Awakening is not a future event. It is the recognition of what is already and always the case.', author: 'Adyashanti' },
  { text: 'The truth is that you already are what you are seeking.', author: 'Adyashanti' },
  { text: 'Enlightenment is a destructive process. It has nothing to do with becoming better or being happier. Enlightenment is the crumbling away of untruth.', author: 'Adyashanti' },
  { text: 'The willingness to question what we think we know is the beginning of wisdom.', author: 'Adyashanti' },
  { text: 'Let go of all ideas and images in your mind. They come and go and aren\'t even generated by you. So why pay so much attention to them?', author: 'Mooji' },
  { text: 'Don\'t try to steer the river.', author: 'Deepak Chopra' },
  { text: 'Silence is the language of God; all else is poor translation.', author: 'Rumi' },
  { text: 'What is it you plan to do with your one wild and precious life?', author: 'Mary Oliver' },
  { text: 'Tell me, what is it you plan to do with your one wild and precious life?', author: 'Mary Oliver' },
  { text: 'You do not have to be good. You do not have to walk on your knees for a hundred miles through the desert, repenting.', author: 'Mary Oliver' },
  { text: 'The cure for pain is in the pain.', author: 'Rumi' },
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
    maxWidth: '800px',
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
    marginBottom: '36px',
    paddingLeft: '14px',
    borderLeft: '2px solid var(--border)',
  },
  quoteText: {
    fontSize: '13px',
    fontStyle: 'italic',
    color: 'var(--body)',
    lineHeight: '1.7',
    display: 'block',
    marginBottom: '5px',
  },
  quoteAuthor: {
    fontSize: '11px',
    color: 'var(--muted)',
    letterSpacing: '0.03em',
  },
  // Insights card
  insightsCard: {
    border: 'var(--border-style)',
    borderRadius: '16px',
    padding: '14px 20px',
    marginBottom: '28px',
    display: 'flex',
    gap: '24px',
    background: 'var(--near-white)',
  },
  insightStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  insightValue: {
    fontSize: '16px',
    fontWeight: '700',
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
  },
  // Moon card
  moonCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    border: 'var(--border-style)',
    borderRadius: '16px',
    padding: '16px 20px',
    marginBottom: '28px',
    background: 'var(--near-white)',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  moonInfo: {
    flex: 1,
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
  moonArrow: {
    fontSize: '22px',
    color: 'var(--muted)',
    flexShrink: 0,
    lineHeight: 1,
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

export default function HomePage({ username, avatarUrl, onNavigateToEntry, onNavigateToNote, onNavigateToOracle, onNavigateToSky }) {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState(username || '');

  // Fetch preferred name from portrait
  useEffect(() => {
    apiFetch('/api/portrait').then(r => r.json()).then(p => {
      if (p.preferred_name) setDisplayName(p.preferred_name);
    }).catch(() => {});
  }, []);

  // Moon
  const [moon, setMoon] = useState(null);

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

  // Suggested questions — pick 4 once per session
  const suggested = useMemo(() => pickRandom(QUESTION_POOL, 4), []);

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

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setPlaying(false);
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
            <span style={s.quoteAuthor}>— {q.author}</span>
          </div>
        ); })()}

        {/* Moon phase widget */}
        {moon && (
          <div
            style={s.moonCard}
            onClick={() => onNavigateToSky?.()}
            title="View Sky"
          >
            <MoonPhaseSVGSmall illumination={moon.illumination ?? 50} phase={moon.phase ?? ''} />
            <div style={s.moonInfo}>
              <div style={s.moonPhase}>{moon.phase}</div>
              <div style={s.moonDetail}>
                {moon.illumination != null && <span>{Math.round(moon.illumination)}% illuminated</span>}
                {moon.moonSign && <span> &middot; Moon in {moon.moonSign}</span>}
              </div>
              {moon.meaning && <div style={s.moonMeaning}>{moon.meaning}</div>}
            </div>
            <span style={s.moonArrow}>&rsaquo;</span>
          </div>
        )}

        {/* Insights card */}
        <div style={s.sectionTitle}>{t('nav.journal')}</div>
        <div style={s.insightsCard}>
          <div style={s.insightStat}>
            <span style={s.insightValue}>{entryCount ?? '—'}</span>
            <span style={s.insightLabel}>{t('home.entriesWritten')}</span>
          </div>
          <div style={s.insightDivider} />
          <div style={s.insightStat}>
            <span style={s.insightValue}>{lastEntryDate ? formatRelativeDate(lastEntryDate, t) : '—'}</span>
            <span style={s.insightLabel}>{t('home.lastWritten')}</span>
          </div>
          {latestEntryTitle && (
            <>
              <div style={s.insightDivider} />
              <div
                style={{ ...s.insightStat, cursor: 'pointer' }}
                onClick={() => onNavigateToEntry?.(latestEntryId)}
                title={t('home.openInJournal')}
              >
                <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>
                  {latestEntryTitle.slice(0, 36)}{latestEntryTitle.length > 36 ? '…' : ''}
                </span>
                <span style={s.insightLabel}>{t('home.latestEntry')}</span>
              </div>
            </>
          )}
        </div>

        {/* Notes card */}
        <div style={s.sectionTitle}>{t('nav.notes')}</div>
        <div style={s.insightsCard}>
          <div style={s.insightStat}>
            <span style={s.insightValue}>{noteCount ?? '—'}</span>
            <span style={s.insightLabel}>{t('home.notesWritten')}</span>
          </div>
          <div style={s.insightDivider} />
          <div style={s.insightStat}>
            <span style={s.insightValue}>{lastNoteDate ? formatRelativeDate(lastNoteDate, t) : '—'}</span>
            <span style={s.insightLabel}>{t('home.lastWritten')}</span>
          </div>
          {latestNoteTitle && (
            <>
              <div style={s.insightDivider} />
              <div
                style={{ ...s.insightStat, cursor: 'pointer' }}
                onClick={() => onNavigateToNote?.(latestNoteId)}
                title={t('home.openInNotes')}
              >
                <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>
                  {latestNoteTitle.slice(0, 36)}{latestNoteTitle.length > 36 ? '…' : ''}
                </span>
                <span style={s.insightLabel}>{t('home.latestNote')}</span>
              </div>
            </>
          )}
        </div>

        {/* Oracle card */}
        <div style={s.sectionTitle}>{t('nav.oracle')}</div>
        <div style={s.insightsCard}>
          <div style={s.insightStat}>
            <span style={s.insightValue}>{oracleCount ?? '—'}</span>
            <span style={s.insightLabel}>{t('home.conversations')}</span>
          </div>
          <div style={s.insightDivider} />
          <div style={s.insightStat}>
            <span style={s.insightValue}>{lastOracleDate ? formatRelativeDate(lastOracleDate, t) : '—'}</span>
            <span style={s.insightLabel}>{t('home.lastConversation')}</span>
          </div>
          {latestOraclePreview && (
            <>
              <div style={s.insightDivider} />
              <div
                style={{ ...s.insightStat, cursor: 'pointer' }}
                onClick={() => onNavigateToOracle?.(latestOracleSessionId)}
                title={t('home.openInOracle')}
              >
                <span style={{ ...s.insightValue, textDecoration: 'underline', textDecorationColor: 'var(--border)' }}>
                  {latestOraclePreview.slice(0, 36)}{latestOraclePreview.length > 36 ? '…' : ''}
                </span>
                <span style={s.insightLabel}>{t('home.latestConversation')}</span>
              </div>
            </>
          )}
        </div>

        {/* Quick Ask */}
        <div style={s.sectionTitle}>{t('home.quickAsk')}</div>

        {/* Input card */}
        <div style={s.askCard}>
          <textarea
            ref={textareaRef}
            style={s.textarea}
            placeholder={t('home.askPlaceholder')}
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
  const size = 44;
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
