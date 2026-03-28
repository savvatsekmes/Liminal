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
  const [portraitPanelWidth, startPortraitPanelDrag] = useResizable(320, { min: 220, max: 560 });

  useEffect(() => {
    apiFetch('/api/portrait')
      .then((r) => r.json())
      .then(setPortrait)
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
      setPortrait((prev) => ({
        ...prev,
        ...(data.sun_sign     ? { sun_sign: data.sun_sign }     : {}),
        ...(data.moon_sign    ? { moon_sign: data.moon_sign }   : {}),
        ...(data.rising_sign  ? { rising_sign: data.rising_sign } : {}),
        ...(data.chinese_zodiac   ? { chinese_zodiac: data.chinese_zodiac }   : {}),
        ...(data.chinese_element  ? { chinese_element: data.chinese_element } : {}),
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
        {SLIDER_AXES.map(({ key, low, high }) => (
          <div key={key} style={s.sliderRow}>
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

  // Keep editText in sync when description changes externally
  useEffect(() => {
    if (!editing) setEditText(description);
  }, [description, editing]);

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
        <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '2px' }}>
          Character Portrait
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

function GeneratingDots() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(t);
  }, []);
  return <span>Generating{dots}</span>;
}
