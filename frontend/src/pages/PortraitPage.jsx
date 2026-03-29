import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { useResizable } from '../hooks/useResizable';
import ResizeDivider from '../components/ResizeDivider';

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
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '14px',
  },
  sliderLabel: {
    fontSize: '11px',
    color: 'var(--muted)',
    width: '110px',
    flexShrink: 0,
    textAlign: 'right',
  },
  sliderLabelRight: {
    textAlign: 'left',
  },
  slider: {
    flex: 1,
    accentColor: 'var(--strong)',
    cursor: 'pointer',
  },
  saveBtn: {
    marginTop: '8px',
    padding: '10px 24px',
    fontSize: '13px',
    fontWeight: '500',
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
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

const SLIDER_AXES = [
  { key: 'slider_rational_spiritual',      low: 'Rational',       high: 'Spiritual' },
  { key: 'slider_gentle_direct',           low: 'Gentle',         high: 'Direct' },
  { key: 'slider_reflective_action',       low: 'Reflective',     high: 'Action-oriented' },
  { key: 'slider_light_deep',              low: 'Light touch',    high: 'Deep dive' },
  { key: 'slider_conversational_poetic',   low: 'Conversational', high: 'Poetic' },
  { key: 'slider_encouraging_challenging', low: 'Encouraging',    high: 'Challenging' },
  { key: 'slider_candor',                  low: 'Agreeable',      high: 'Candid', hint: 'High: truth over comfort. The mirror will name what you\'re avoiding, challenge your assumptions, and ask the question you won\'t ask yourself.' },
  { key: 'slider_character_influence',     low: 'Subtle',         high: 'Full character' },
];

export default function PortraitPage() {
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
          const t = SUN_SIGN_TO_TAROT[p.sun_sign];
          if (t) p.soul_card = `${t.card} ${t.number}`;
        }
        if (p.life_path_number && !p.life_path_card) {
          const t = LIFE_PATH_TO_TAROT[p.life_path_number];
          if (t) p.life_path_card = `${t.card} ${t.number}`;
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
        const t = SUN_SIGN_TO_TAROT[updated.sun_sign];
        if (t) updated.soul_card = `${t.card} ${t.number}`;
      }
      if (updated.life_path_number && !updated.life_path_card) {
        const t = LIFE_PATH_TO_TAROT[updated.life_path_number];
        if (t) updated.life_path_card = `${t.card} ${t.number}`;
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

  if (!portrait) return <div style={{ padding: '40px', color: 'var(--muted)', fontSize: '13px' }}>Loading portrait…</div>;

  return (
    <div style={s.root}>
      {/* ── Left: form column ── */}
      <div style={s.formCol}>
      <div style={s.pageTitle}>Your Portrait</div>
      <div style={s.pageSubtitle}>This context shapes every Mirror response. Treat it as living truth, not gospel.</div>

      {/* Personality */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Personality</div>
        <div style={s.grid}>
          <div style={s.field}>
            <label style={s.label}>Preferred Name</label>
            <input style={s.input} value={portrait.preferred_name || ''} onChange={(e) => set('preferred_name', e.target.value)} placeholder="What should the Mirror call you?" />
          </div>
          <div style={s.field}>
            <label style={s.label}>Sex</label>
            <select style={s.input} value={portrait.sex || ''} onChange={(e) => set('sex', e.target.value)}>
              <option value="">— Select —</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Intersex">Intersex</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
          <div style={s.field}>
            <label style={s.label}>Pronouns</label>
            <input style={s.input} value={portrait.pronouns || ''} onChange={(e) => set('pronouns', e.target.value)} placeholder="e.g. he/him, she/her, they/them" />
          </div>
          <div style={s.field}>
            <label style={s.label}>
              MBTI Type{' '}
              <a style={s.link} href="https://www.16personalities.com" target="_blank" rel="noreferrer">
                (take test ↗)
              </a>
            </label>
            <input style={s.input} value={portrait.mbti || ''} onChange={(e) => set('mbti', e.target.value)} placeholder="e.g. INFP" />
          </div>
          <div style={s.field}>
            <label style={s.label}>Enneagram</label>
            <input style={s.input} value={portrait.enneagram || ''} onChange={(e) => set('enneagram', e.target.value)} placeholder="e.g. 4w5" />
          </div>
          <div style={s.field}>
            <label style={s.label}>Human Design (optional)</label>
            <input style={s.input} value={portrait.human_design || ''} onChange={(e) => set('human_design', e.target.value)} placeholder="e.g. Generator" />
          </div>
        </div>
      </div>

      {/* Astrology */}
      <div style={s.section}>
        <div style={s.sectionTitle}>
          Astrology
          {astroCalcing && <span style={{ fontWeight: '400', marginLeft: '8px', fontStyle: 'italic' }}>calculating…</span>}
        </div>

        {/* Birth data inputs */}
        <div style={s.grid}>
          <div style={s.field}>
            <label style={s.label}>Birth Date</label>
            <input style={s.input} type="date" value={portrait.birth_date || ''} onChange={(e) => set('birth_date', e.target.value)} />
          </div>
          <div style={s.field}>
            <label style={s.label}>Birth Time</label>
            <input style={s.input} type="time" value={portrait.birth_time || ''} onChange={(e) => set('birth_time', e.target.value)} />
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Required for Moon & Rising</span>
          </div>
          <div style={{ ...s.field, gridColumn: '1 / -1' }}>
            <label style={s.label}>Birth Location</label>
            <input style={s.input} value={portrait.birth_location || ''} onChange={(e) => set('birth_location', e.target.value)} placeholder="City, Country (e.g. Melbourne, Australia)" />
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Required for Rising sign calculation</span>
          </div>
        </div>

        {/* Calculated results */}
        {portrait.birth_date && (
          <div style={{ marginTop: '20px', padding: '16px 20px', border: 'var(--border-style)', borderRadius: '2px', background: 'var(--near-white)' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '12px' }}>
              Calculated
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              <AstroField label="Sun sign" value={portrait.sun_sign} />
              <AstroField label="Moon sign" value={portrait.moon_sign} missing={!portrait.birth_time ? 'Enter birth time' : null} />
              <AstroField label="Rising" value={portrait.rising_sign} missing={!portrait.birth_time ? 'Enter birth time' : !portrait.birth_location ? 'Enter birth location' : null} />
              <AstroField label="Chinese zodiac" value={portrait.chinese_zodiac && portrait.chinese_element ? `${portrait.chinese_element} ${portrait.chinese_zodiac}` : portrait.chinese_zodiac} />
              <AstroField label="Life Path Number" value={portrait.life_path_number != null ? String(portrait.life_path_number) : null} />
              <AstroField label="Soul Card" value={portrait.soul_card} missing={!portrait.sun_sign ? 'Needs sun sign' : null} />
              <AstroField label="Life Path Card" value={portrait.life_path_card ? `${portrait.life_path_card}  (Life Path ${portrait.life_path_number})` : null} />
            </div>
          </div>
        )}

        {/* Manual overrides */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>
            Override (if auto-calculation is wrong for your cusp date or chart system):
          </div>
          <div style={s.grid}>
            <div style={s.field}>
              <label style={s.label}>Sun Sign</label>
              <input style={s.input} value={portrait.sun_sign || ''} onChange={(e) => set('sun_sign', e.target.value)} placeholder="e.g. Scorpio" />
            </div>
            <div style={s.field}>
              <label style={s.label}>Moon Sign</label>
              <input style={s.input} value={portrait.moon_sign || ''} onChange={(e) => set('moon_sign', e.target.value)} placeholder="e.g. Pisces" />
            </div>
            <div style={s.field}>
              <label style={s.label}>Rising Sign</label>
              <input style={s.input} value={portrait.rising_sign || ''} onChange={(e) => set('rising_sign', e.target.value)} placeholder="e.g. Capricorn" />
            </div>
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <button
            style={{ ...s.saveBtn, opacity: astroCalcing ? 0.5 : 1 }}
            onClick={() => portrait.birth_date && calcAstrology(portrait)}
            disabled={astroCalcing || !portrait.birth_date}
            title={!portrait.birth_date ? 'Enter a birth date first' : 'Calculate astrological signs'}
          >
            {astroCalcing ? 'Calculating…' : '✦ Calculate astrology'}
          </button>
        </div>
      </div>

      {/* Context note */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Current Context</div>
        <div style={s.field}>
          <label style={s.label}>What's happening in your life right now?</label>
          <textarea
            style={{ ...s.input, ...s.textarea }}
            value={portrait.context_note || ''}
            onChange={(e) => set('context_note', e.target.value)}
            placeholder="Current chapter of life, what matters most right now, ongoing situations…"
          />
        </div>
      </div>

      {/* Response sliders */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Default Response Style</div>
        {SLIDER_AXES.map(({ key, low, high, hint }) => (
          <div key={key}>
            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>{low}</span>
              <input
                type="range"
                min="0"
                max="100"
                style={s.slider}
                value={portrait[key] ?? 50}
                onChange={(e) => set(key, Number(e.target.value))}
              />
              <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>{high}</span>
            </div>
            {hint && (portrait[key] ?? 50) > 65 && (
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '-6px', marginBottom: '8px', paddingLeft: '2px', lineHeight: 1.4 }}>
                {hint}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button style={{ ...s.saveBtn, opacity: saving ? 0.5 : 1 }} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save portrait'}
        </button>
        {saved && <span style={s.savedMsg}>Saved.</span>}
      </div>
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
  );
}

// ── Character Portrait Panel ──────────────────────────────────────────────────

function CharacterPortraitPanel({ description, generating, editing, onGenerate, onEdit, onEditDone, onEditCancel, width = 320 }) {
  const [editText, setEditText] = useState(description);
  const [playing, setPlaying] = useState(false);
  const [ttsOnline, setTtsOnline] = useState(false);
  const audioRef = useRef(null);

  // Keep editText in sync when description changes externally
  useEffect(() => {
    if (!editing) setEditText(description);
  }, [description, editing]);

  // Check TTS status on mount
  useEffect(() => {
    fetch('/api/tts/status')
      .then((r) => r.json())
      .then((d) => setTtsOnline(d.online))
      .catch(() => setTtsOnline(false));
  }, []);

  async function handleListen() {
    if (playing) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    if (!description) return;

    if (ttsOnline) {
      try {
        setPlaying(true);
        const res = await fetch('/api/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: description, exaggeration: 0.5 }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
          audio.onerror = () => { setPlaying(false); fallbackTTS(description); };
          await audio.play();
          return;
        }
      } catch {}
    }
    fallbackTTS(description);
  }

  function fallbackTTS(text) {
    if (!window.speechSynthesis) { setPlaying(false); return; }
    const utt = new SpeechSynthesisUtterance(text);
    utt.onend = () => setPlaying(false);
    utt.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utt);
    setPlaying(true);
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
            Character Portrait
          </div>
          {description && !editing && !generating && (
            <button
              onClick={handleListen}
              title={playing ? 'Stop' : ttsOnline ? 'Listen (Chatterbox)' : 'Listen (Web Speech)'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '26px', height: '26px', borderRadius: '3px',
                color: playing ? 'var(--strong)' : 'var(--muted)',
                background: playing ? 'var(--panel-bg)' : 'none',
                cursor: 'pointer', border: 'none', transition: 'color 0.12s',
              }}
            >
              <WaveformIcon playing={playing} />
            </button>
          )}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
          AI synthesis of your portrait data
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
            No portrait generated yet. Fill in your personality and astrology details, then click Generate.
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
              Save
            </button>
            <button
              className="btn-ghost"
              style={{ flex: 1, fontSize: '12px' }}
              onClick={onEditCancel}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              className="btn-primary"
              style={{ width: '100%', fontSize: '12px', padding: '9px 0', opacity: generating ? 0.5 : 1 }}
              onClick={onGenerate}
              disabled={generating}
            >
              {generating ? 'Generating…' : description ? '↺ Regenerate' : '✦ Generate portrait'}
            </button>
            {description && !generating && (
              <button
                className="btn-ghost"
                style={{ width: '100%', fontSize: '12px' }}
                onClick={onEdit}
              >
                Edit manually
              </button>
            )}
          </>
        )}
        <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: '1.5', marginTop: '2px' }}>
          Adjust "Character influence" slider to control how much this shapes your Mirror responses.
        </div>
      </div>
    </div>
  );
}

function TarotCardSelect({ value, onChange }) {
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
        <span>{selected ? `${selected.number} — ${selected.name}` : '— Select a card —'}</span>
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
            placeholder="Search…"
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
  const [dots, setDots] = useState('');
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(t);
  }, []);
  return <span>Generating{dots}</span>;
}
