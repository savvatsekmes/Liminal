import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';
import { useResizable } from '../hooks/useResizable';
import ResizeDivider from '../components/ResizeDivider';
import { useLanguage } from '../i18n/LanguageContext';
import SkyPage from './SkyPage';

const s = {
  root: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  formCol: {
    flex: 1,
    overflowY: 'auto',
    padding: '40px 48px 80px',
    minWidth: 0,
  },
  pageTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--strong)',
    marginBottom: '6px',
  },
  pageSubtitle: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginBottom: '36px',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: '36px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '16px',
    paddingBottom: '6px',
    borderBottom: 'var(--border-style)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--body)',
  },
  input: {
    fontSize: '13px',
    padding: '8px 10px',
  },
  textarea: {
    fontSize: '13px',
    padding: '10px',
    minHeight: '90px',
    resize: 'vertical',
    lineHeight: '1.6',
  },
  saveBtn: {
    marginTop: '8px',
    padding: '10px 24px',
    fontSize: '13px',
    fontWeight: '500',
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
  savedMsg: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginLeft: '12px',
    fontStyle: 'italic',
  },
  link: {
    fontSize: '11px',
    color: 'var(--muted)',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
};

// ── Tarot mappings ────────────────────────────────────────────────────────────

const SUN_SIGN_TO_TAROT = {
  'Aries':       { card: 'The Emperor',      number: 'IV'    },
  'Taurus':      { card: 'The Hierophant',   number: 'V'     },
  'Gemini':      { card: 'The Lovers',       number: 'VI'    },
  'Cancer':      { card: 'The Chariot',      number: 'VII'   },
  'Leo':         { card: 'Strength',         number: 'VIII'  },
  'Virgo':       { card: 'The Hermit',       number: 'IX'    },
  'Libra':       { card: 'Justice',          number: 'XI'    },
  'Scorpio':     { card: 'Death',            number: 'XIII'  },
  'Sagittarius': { card: 'Temperance',       number: 'XIV'   },
  'Capricorn':   { card: 'The Devil',        number: 'XV'    },
  'Aquarius':    { card: 'The Star',         number: 'XVII'  },
  'Pisces':      { card: 'The Moon',         number: 'XVIII' },
};

const LIFE_PATH_TO_TAROT = {
  1:  { card: 'The Magician',       number: 'I'    },
  2:  { card: 'The High Priestess', number: 'II'   },
  3:  { card: 'The Empress',        number: 'III'  },
  4:  { card: 'The Emperor',        number: 'IV'   },
  5:  { card: 'The Hierophant',     number: 'V'    },
  6:  { card: 'The Lovers',         number: 'VI'   },
  7:  { card: 'The Chariot',        number: 'VII'  },
  8:  { card: 'Strength',           number: 'VIII' },
  9:  { card: 'The Hermit',         number: 'IX'   },
  11: { card: 'Justice',            number: 'XI'   },
  22: { card: 'The Fool',           number: '0'    },
  33: { card: 'The World',          number: 'XXI'  },
};

const MAJOR_ARCANA = [
  { number: '0',     name: 'The Fool' },
  { number: 'I',     name: 'The Magician' },
  { number: 'II',    name: 'The High Priestess' },
  { number: 'III',   name: 'The Empress' },
  { number: 'IV',    name: 'The Emperor' },
  { number: 'V',     name: 'The Hierophant' },
  { number: 'VI',    name: 'The Lovers' },
  { number: 'VII',   name: 'The Chariot' },
  { number: 'VIII',  name: 'Strength' },
  { number: 'IX',    name: 'The Hermit' },
  { number: 'X',     name: 'Wheel of Fortune' },
  { number: 'XI',    name: 'Justice' },
  { number: 'XII',   name: 'The Hanged Man' },
  { number: 'XIII',  name: 'Death' },
  { number: 'XIV',   name: 'Temperance' },
  { number: 'XV',    name: 'The Devil' },
  { number: 'XVI',   name: 'The Tower' },
  { number: 'XVII',  name: 'The Star' },
  { number: 'XVIII', name: 'The Moon' },
  { number: 'XIX',   name: 'The Sun' },
  { number: 'XX',    name: 'Judgement' },
  { number: 'XXI',   name: 'The World' },
];

const TAROT_DESCRIPTIONS = {
  'The Fool':           'New beginnings, leaping into the unknown, pure potential',
  'The Magician':       'Will, skill, manifestation, turning intention into action',
  'The High Priestess': 'Intuition, mystery, inner knowing, what lies beneath',
  'The Empress':        'Abundance, nurturing, creativity, connection to nature',
  'The Emperor':        'Structure, authority, stability, building foundations',
  'The Hierophant':     'Tradition, guidance, seeking a teacher or system',
  'The Lovers':         'Choice, values, alignment, deep connection',
  'The Chariot':        'Willpower, direction, moving forward through opposition',
  'Strength':           'Inner courage, patience, taming what is wild within',
  'The Hermit':         'Solitude, inner light, withdrawal to find truth',
  'Wheel of Fortune':   'Change, cycles, turning points, what rises and falls',
  'Justice':            'Truth, cause and effect, accountability, balance',
  'The Hanged Man':     'Surrender, new perspective, pause before the next move',
  'Death':              'Transformation, endings that make way, release',
  'Temperance':         'Integration, patience, the middle path, alchemy',
  'The Devil':          'Chains of your own making, shadow, what binds you',
  'The Tower':          'Sudden upheaval, what must fall, breakthrough through collapse',
  'The Star':           'Hope, healing, trust after darkness, restoration',
  'The Moon':           'Illusion, anxiety, what hides in the subconscious',
  'The Sun':            'Clarity, joy, vitality, things coming into the light',
  'Judgement':          'Awakening, hearing the call, rising to a new version',
  'The World':          'Completion, integration, the end of a cycle, wholeness',
};

function calculateLifePath(birthDate) {
  if (!birthDate) return null;
  const digits = birthDate.replace(/-/g, '').split('').map(Number);
  let sum = digits.reduce((a, b) => a + b, 0);
  while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
    sum = sum.toString().split('').map(Number).reduce((a, b) => a + b, 0);
  }
  return sum;
}

function AstroField({ label, value, missing }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '2px', textTransform: 'capitalize' }}>{label}</div>
      <div style={{ fontSize: '13px', color: value ? 'var(--strong)' : 'var(--muted)', fontStyle: value ? 'normal' : 'italic' }}>
        {value || missing || '—'}
      </div>
    </div>
  );
}


const tabBarStyle = {
  display: 'flex',
  gap: '4px',
  marginBottom: '28px',
  borderBottom: 'var(--border-style)',
  paddingBottom: '0',
};
const tabStyle = {
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: '600',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  fontFamily: 'var(--font)',
  transition: 'color 0.12s, border-color 0.12s',
  marginBottom: '-1px',
};
const tabActiveStyle = {
  color: 'var(--strong)',
  borderBottomColor: 'var(--strong)',
};

export default function PortraitPage({ onNavigateEntry, initialTab, onTabLoaded }) {
  const { t } = useLanguage();
  const [pageTab, setPageTab] = useState(initialTab || 'portrait');

  useEffect(() => {
    if (initialTab) {
      setPageTab(initialTab);
      onTabLoaded?.();
    }
  }, [initialTab]);
  const [portrait, setPortrait] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [astroCalcing, setAstroCalcing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingPortrait, setEditingPortrait] = useState(false);
  const astroTimer = useRef(null);
  const [portraitPanelWidth, startPortraitPanelDrag] = useResizable(
    Math.floor((window.innerWidth - 48) / 2),
    { min: 280, max: window.innerWidth - 48 - 280 }
  );

  useEffect(() => {
    apiFetch('/api/portrait')
      .then((r) => r.json())
      .then((p) => {
        // Derive tarot from existing data if not already stored
        if (p.birth_date && !p.life_path_number) {
          p.life_path_number = calculateLifePath(p.birth_date);
        }
        if (p.sun_sign && !p.soul_card) {
          const tarot = SUN_SIGN_TO_TAROT[p.sun_sign];
          if (tarot) p.soul_card = `${tarot.card} ${tarot.number}`;
        }
        if (p.life_path_number && !p.life_path_card) {
          const tarot = LIFE_PATH_TO_TAROT[p.life_path_number];
          if (tarot) p.life_path_card = `${tarot.card} ${tarot.number}`;
        }
        setPortrait(p);
      })
      .catch(() => {});
  }, []);

  function set(key, value) {
    setPortrait((p) => {
      const next = { ...p, [key]: value };
      // Auto-calculate astrology when birth data changes
      if (['birth_date', 'birth_time', 'birth_location'].includes(key)) {
        clearTimeout(astroTimer.current);
        if (next.birth_date) {
          astroTimer.current = setTimeout(() => calcAstrology(next), 800);
        }
      }
      return next;
    });
    setSaved(false);
  }

  async function calcAstrology(p) {
    setAstroCalcing(true);
    try {
      const res = await apiFetch('/api/portrait/astrology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birth_date: p.birth_date,
          birth_time: p.birth_time || null,
          birth_location: p.birth_location || null,
        }),
      });
      const data = await res.json();
      const sunSign = data.sun_sign || p.sun_sign;
      const lifePath = calculateLifePath(p.birth_date);
      const soulTarot = sunSign ? SUN_SIGN_TO_TAROT[sunSign] : null;
      const lifePathTarot = lifePath ? LIFE_PATH_TO_TAROT[lifePath] : null;

      setPortrait((prev) => ({
        ...prev,
        ...(data.sun_sign     ? { sun_sign: data.sun_sign }     : {}),
        ...(data.moon_sign    ? { moon_sign: data.moon_sign }   : {}),
        ...(data.rising_sign  ? { rising_sign: data.rising_sign } : {}),
        ...(data.chinese_zodiac   ? { chinese_zodiac: data.chinese_zodiac }   : {}),
        ...(data.chinese_element  ? { chinese_element: data.chinese_element } : {}),
        life_path_number: lifePath,
        soul_card: soulTarot ? `${soulTarot.card} ${soulTarot.number}` : prev.soul_card,
        life_path_card: lifePathTarot ? `${lifePathTarot.card} ${lifePathTarot.number}` : prev.life_path_card,
      }));
    } catch {}
    finally { setAstroCalcing(false); }
  }

  async function save() {
    if (!portrait) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(portrait),
      });
      const updated = await res.json();
      // Re-derive tarot fields that may not come back from server
      if (updated.birth_date && !updated.life_path_number) {
        updated.life_path_number = calculateLifePath(updated.birth_date);
      }
      if (updated.sun_sign && !updated.soul_card) {
        const tarot = SUN_SIGN_TO_TAROT[updated.sun_sign];
        if (tarot) updated.soul_card = `${tarot.card} ${tarot.number}`;
      }
      if (updated.life_path_number && !updated.life_path_card) {
        const tarot = LIFE_PATH_TO_TAROT[updated.life_path_number];
        if (tarot) updated.life_path_card = `${tarot.card} ${tarot.number}`;
      }
      setPortrait(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    finally { setSaving(false); }
  }

  async function generateCharacterPortrait() {
    setGenerating(true);
    // Save first so the LLM sees the latest data
    await save();
    try {
      const res = await apiFetch('/api/portrait/generate', { method: 'POST' });
      const data = await res.json();
      if (data.character_description) {
        setPortrait(p => ({ ...p, character_description: data.character_description }));
      }
    } catch {}
    finally { setGenerating(false); }
  }

  if (!portrait && pageTab === 'portrait') return <div style={{ padding: '40px', color: 'var(--muted)', fontSize: '13px' }}>{t('common.loading')}</div>;

  const oracleHeader = (
    <div style={{ padding: '40px 48px 0' }}>
      <div style={s.pageTitle}>The Oracle</div>
      <div style={s.pageSubtitle}>Do not try and bend the spoon — that's impossible. Instead, only try to realise the truth: there is no spoon.</div>
      <div style={tabBarStyle}>
        {['portrait', 'sky', 'cards'].map(tb => (
          <button key={tb} style={{ ...tabStyle, ...(pageTab === tb ? tabActiveStyle : {}) }} onClick={() => setPageTab(tb)}>
            {tb === 'portrait' ? 'Portrait' : tb === 'sky' ? 'Sky' : 'Cards'}
          </button>
        ))}
      </div>
    </div>
  );

  // Sky or Cards tab — render SkyPage with its own internal tabs pre-selected
  if (pageTab === 'sky' || pageTab === 'cards') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {oracleHeader}
        <SkyPage onNavigateEntry={onNavigateEntry} initialTab={pageTab === 'cards' ? 'cards' : 'sky'} hideTabBar />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {oracleHeader}
    <div style={s.root}>
      {/* ── Left: form column ── */}
      <div style={{ ...s.formCol, paddingTop: '0' }}>

      <>
      {/* Personality */}
      <div style={s.section}>
        <div style={s.sectionTitle}>{t('portrait.personality')}</div>
        <div style={s.grid}>
          <div style={s.field}>
            <label style={s.label}>{t('portrait.sex')}</label>
            <select style={s.input} value={portrait.sex || ''} onChange={(e) => set('sex', e.target.value)}>
              <option value="">{t('portrait.selectDefault')}</option>
              <option value="Male">{t('portrait.male')}</option>
              <option value="Female">{t('portrait.female')}</option>
              <option value="Intersex">{t('portrait.intersex')}</option>
              <option value="Prefer not to say">{t('portrait.preferNotToSay')}</option>
            </select>
          </div>
          <div style={s.field}>
            <label style={s.label}>{t('portrait.pronouns')}</label>
            <input style={s.input} value={portrait.pronouns || ''} onChange={(e) => set('pronouns', e.target.value)} placeholder={t('portrait.pronounsPlaceholder')} />
          </div>
          <div style={s.field}>
            <label style={s.label}>
              {t('portrait.mbti')}{' '}
              <a style={s.link} href="https://www.16personalities.com" target="_blank" rel="noreferrer">
                {t('portrait.takeTest')}
              </a>
            </label>
            <input style={s.input} value={portrait.mbti || ''} onChange={(e) => set('mbti', e.target.value)} placeholder={t('portrait.mbtiPlaceholder')} />
          </div>
          <div style={s.field}>
            <label style={s.label}>{t('portrait.enneagram')}</label>
            <input style={s.input} value={portrait.enneagram || ''} onChange={(e) => set('enneagram', e.target.value)} placeholder={t('portrait.enneagramPlaceholder')} />
          </div>
          <div style={s.field}>
            <label style={s.label}>{t('portrait.humanDesign')}</label>
            <input style={s.input} value={portrait.human_design || ''} onChange={(e) => set('human_design', e.target.value)} placeholder={t('portrait.humanDesignPlaceholder')} />
          </div>
        </div>
      </div>

      {/* Astrology */}
      <div style={s.section}>
        <div style={s.sectionTitle}>
          {t('portrait.astrology')}
          {astroCalcing && <span style={{ fontWeight: '400', marginLeft: '8px', fontStyle: 'italic' }}>{t('portrait.calculating')}</span>}
        </div>

        {/* Birth data inputs */}
        <div style={s.grid}>
          <div style={s.field}>
            <label style={s.label}>{t('portrait.birthDate')}</label>
            <input style={s.input} type="date" value={portrait.birth_date || ''} onChange={(e) => set('birth_date', e.target.value)} />
          </div>
          <div style={s.field}>
            <label style={s.label}>{t('portrait.birthTime')}</label>
            <input style={s.input} type="time" value={portrait.birth_time || ''} onChange={(e) => set('birth_time', e.target.value)} />
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('portrait.birthTimeHint')}</span>
          </div>
          <div style={{ ...s.field, gridColumn: '1 / -1' }}>
            <label style={s.label}>{t('portrait.birthLocation')}</label>
            <input style={s.input} value={portrait.birth_location || ''} onChange={(e) => set('birth_location', e.target.value)} placeholder={t('portrait.birthLocationPlaceholder')} />
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('portrait.birthLocationHint')}</span>
          </div>
        </div>

        {/* Calculated results */}
        {portrait.birth_date && (
          <div style={{ marginTop: '20px', padding: '16px 20px', border: 'none', borderRadius: '16px', background: 'var(--near-white)' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '12px' }}>
              {t('portrait.calculated')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              <AstroField label={t('portrait.sunSign')} value={portrait.sun_sign} />
              <AstroField label={t('portrait.moonSign')} value={portrait.moon_sign} missing={!portrait.birth_time ? t('portrait.enterBirthTime') : null} />
              <AstroField label={t('portrait.risingSign')} value={portrait.rising_sign} missing={!portrait.birth_time ? t('portrait.enterBirthTime') : !portrait.birth_location ? t('portrait.enterBirthLocation') : null} />
              <AstroField label={t('portrait.chineseZodiac')} value={portrait.chinese_zodiac && portrait.chinese_element ? `${portrait.chinese_element} ${portrait.chinese_zodiac}` : portrait.chinese_zodiac} />
              <AstroField label={t('portrait.lifePathNumber')} value={portrait.life_path_number != null ? String(portrait.life_path_number) : null} />
              <AstroField label={t('portrait.soulCard')} value={portrait.soul_card} missing={!portrait.sun_sign ? t('portrait.needsSunSign') : null} />
              <AstroField label={t('portrait.lifePathCard')} value={portrait.life_path_card ? `${portrait.life_path_card}  (Life Path ${portrait.life_path_number})` : null} />
            </div>
          </div>
        )}

        {/* Manual overrides */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>
            {t('portrait.override')}
          </div>
          <div style={s.grid}>
            <div style={s.field}>
              <label style={s.label}>{t('portrait.sunSignOverride')}</label>
              <input style={s.input} value={portrait.sun_sign || ''} onChange={(e) => set('sun_sign', e.target.value)} placeholder="e.g. Scorpio" />
            </div>
            <div style={s.field}>
              <label style={s.label}>{t('portrait.moonSignOverride')}</label>
              <input style={s.input} value={portrait.moon_sign || ''} onChange={(e) => set('moon_sign', e.target.value)} placeholder="e.g. Pisces" />
            </div>
            <div style={s.field}>
              <label style={s.label}>{t('portrait.risingSignOverride')}</label>
              <input style={s.input} value={portrait.rising_sign || ''} onChange={(e) => set('rising_sign', e.target.value)} placeholder="e.g. Capricorn" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
          <button
            style={{ ...s.saveBtn, opacity: astroCalcing ? 0.5 : 1 }}
            onClick={() => portrait.birth_date && calcAstrology(portrait)}
            disabled={astroCalcing || !portrait.birth_date}
            title={!portrait.birth_date ? t('portrait.enterBirthDateFirst') : t('portrait.calculateAstrology')}
          >
            {astroCalcing ? t('portrait.calculating') : t('portrait.calculateAstrology')}
          </button>
          <button style={{ ...s.saveBtn, opacity: saving ? 0.5 : 1 }} onClick={save} disabled={saving}>
            {saving ? t('common.saving') : t('portrait.savePortrait')}
          </button>
          {saved && <span style={s.savedMsg}>{t('common.saved')}</span>}
        </div>
      </div>
      </>

      </div>{/* end formCol */}

      <ResizeDivider onMouseDown={startPortraitPanelDrag} inverted />
      {/* ── Right: character portrait panel ── */}
      <CharacterPortraitPanel
        width={portraitPanelWidth}
        description={portrait.character_description || ''}
        generating={generating}
        editing={editingPortrait}
        onGenerate={generateCharacterPortrait}
        onEdit={() => setEditingPortrait(true)}
        onEditDone={(text) => {
          setPortrait(p => ({ ...p, character_description: text }));
          setEditingPortrait(false);
        }}
        onEditCancel={() => setEditingPortrait(false)}
      />
    </div>
    </div>
  );
}

// ── Character Portrait Panel ──────────────────────────────────────────────────

function CharacterPortraitPanel({ description, generating, editing, onGenerate, onEdit, onEditDone, onEditCancel, width = 320 }) {
  const { t } = useLanguage();
  const [editText, setEditText] = useState(description);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const cancelRef = useRef(false);

  // Keep editText in sync when description changes externally
  useEffect(() => {
    if (!editing) setEditText(description);
  }, [description, editing]);


  async function handleListen() {
    if (playing) { stopSpeak(audioRef, cancelRef); setPlaying(false); return; }
    if (!description) return;
    cancelRef.current = false;
    setPlaying(true);
    await streamSpeak(description, audioRef, cancelRef);
    setPlaying(false);
  }

  return (
    <div style={{
      width: width + 'px',
      flexShrink: 0,
      background: 'var(--near-white)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 20px 14px',
        borderBottom: 'var(--border-style)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            {t('portrait.characterPortrait')}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
          {t('portrait.aiSynthesis')}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {generating && (
          <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: '1.8' }}>
            <GeneratingDots />
          </div>
        )}

        {!generating && editing && (
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              minHeight: '260px',
              fontSize: '13px',
              lineHeight: '1.8',
              resize: 'vertical',
              padding: '0',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              color: 'var(--strong)',
              fontFamily: 'var(--font)',
            }}
          />
        )}

        {!generating && !editing && description && (
          <p style={{ fontSize: '13px', lineHeight: '1.85', color: 'var(--strong)', whiteSpace: 'pre-wrap' }}>
            {description}
          </p>
        )}

        {!generating && !editing && !description && (
          <div style={{ fontSize: '13px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: '1.7' }}>
            {t('portrait.noPortrait')}
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{
        padding: '14px 20px',
        borderTop: 'var(--border-style)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {editing ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-primary"
              style={{ flex: 1, fontSize: '12px', padding: '8px 0' }}
              onClick={() => onEditDone(editText)}
            >
              {t('common.save')}
            </button>
            <button
              className="btn-ghost"
              style={{ flex: 1, fontSize: '12px' }}
              onClick={onEditCancel}
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                className="btn-primary"
                style={{ flex: 1, fontSize: '12px', padding: '9px 0', opacity: generating ? 0.5 : 1 }}
                onClick={onGenerate}
                disabled={generating}
              >
                {generating ? t('portrait.generating') : description ? t('portrait.regenerate') : t('portrait.generate')}
              </button>
              <button
                onClick={handleListen}
                title={playing ? t('common.stop') : t('common.readAloud')}
                type="button"
                disabled={!description || generating}
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
                  cursor: (!description || generating) ? 'default' : 'pointer',
                  transition: 'color 0.15s, background 0.15s',
                  flexShrink: 0,
                  opacity: (!description || generating) ? 0.35 : 1,
                  boxShadow: playing
                    ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                    : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
                }}
              >
                <WaveformIcon playing={playing} />
              </button>
            </div>
            {description && !generating && (
              <button
                className="btn-ghost"
                style={{ width: '100%', fontSize: '12px' }}
                onClick={onEdit}
              >
                {t('portrait.editManually')}
              </button>
            )}
          </>
        )}
        <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5', marginTop: '2px' }}>
          {t('portrait.characterInfluenceHint')}
        </div>
      </div>
    </div>
  );
}

function TarotCardSelect({ value, onChange }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = MAJOR_ARCANA.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.number.toLowerCase().includes(search.toLowerCase())
  );

  const selected = MAJOR_ARCANA.find(c => c.name === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          ...s.input,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: value ? 'var(--strong)' : 'var(--muted)',
          background: 'var(--white)',
          border: 'var(--border-style)',
          borderRadius: '2px',
        }}
      >
        <span>{selected ? `${selected.number} — ${selected.name}` : t('portrait.selectCard')}</span>
        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>▾</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--white)',
          border: 'var(--border-style)',
          borderRadius: '2px',
          maxHeight: '240px',
          overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          <input
            autoFocus
            placeholder={t('portrait.searchCard')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...s.input, width: '100%', borderBottom: 'var(--border-style)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0, fontSize: '12px' }}
          />
          {filtered.map(c => (
            <div
              key={c.name}
              onClick={() => { onChange(c.name); setOpen(false); setSearch(''); }}
              style={{
                padding: '7px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                background: c.name === value ? 'var(--panel-bg)' : 'transparent',
                color: 'var(--body)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--panel-bg)'}
              onMouseLeave={(e) => e.currentTarget.style.background = c.name === value ? 'var(--panel-bg)' : 'transparent'}
            >
              <span style={{ color: 'var(--muted)', marginRight: '8px', fontSize: '11px', display: 'inline-block', width: '32px' }}>{c.number}</span>
              {c.name}
            </div>
          ))}
        </div>
      )}
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

function GeneratingDots() {
  const { t } = useLanguage();
  const [dots, setDots] = useState('');
  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(iv);
  }, []);
  return <span>{t('portrait.generatingLabel')}{dots}</span>;
}
