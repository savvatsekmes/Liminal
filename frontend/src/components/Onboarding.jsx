import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';

const SUN_SIGN_TO_TAROT = {
  'Aries':       'The Emperor',
  'Taurus':      'The Hierophant',
  'Gemini':      'The Lovers',
  'Cancer':      'The Chariot',
  'Leo':         'Strength',
  'Virgo':       'The Hermit',
  'Libra':       'Justice',
  'Scorpio':     'Death',
  'Sagittarius': 'Temperance',
  'Capricorn':   'The Devil',
  'Aquarius':    'The Star',
  'Pisces':      'The Moon',
};

const LIFE_PATH_TO_TAROT = {
  1: 'The Magician', 2: 'The High Priestess', 3: 'The Empress',
  4: 'The Emperor', 5: 'The Hierophant', 6: 'The Lovers',
  7: 'The Chariot', 8: 'Strength', 9: 'The Hermit',
  11: 'Justice', 22: 'The Fool', 33: 'The World',
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

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--white)',
    zIndex: 1000,
  },
  card: {
    width: '440px',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '52px 48px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: 'var(--strong)',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--muted)',
    lineHeight: '1.7',
    marginBottom: '36px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '8px',
  },
  hint: {
    fontSize: '11px',
    color: 'var(--muted)',
    marginTop: '-10px',
    marginBottom: '16px',
    fontStyle: 'italic',
  },
  input: {
    width: '100%',
    marginBottom: '16px',
    fontSize: '14px',
    padding: '10px 12px',
    border: 'var(--border-style)',
    borderRadius: '2px',
    outline: 'none',
    fontFamily: 'var(--font)',
    color: 'var(--strong)',
    background: 'var(--white)',
    boxSizing: 'border-box',
  },
  btn: {
    width: '100%',
    padding: '12px',
    fontSize: '13px',
    fontWeight: '600',
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    letterSpacing: '0.02em',
    marginBottom: '12px',
    transition: 'opacity 0.15s',
  },
  skip: {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    fontSize: '11px',
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    padding: '4px',
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '32px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--border)',
    transition: 'background 0.2s',
  },
  dotActive: {
    background: 'var(--strong)',
  },
  astroResult: {
    fontSize: '12px',
    color: 'var(--muted)',
    lineHeight: '1.7',
    padding: '12px 14px',
    border: 'var(--border-style)',
    borderRadius: '2px',
    background: 'var(--panel-bg)',
    marginBottom: '16px',
  },
  astroValue: {
    color: 'var(--strong)',
    fontWeight: '500',
  },
};

const TOTAL_STEPS = 6;

export default function Onboarding({ username, onComplete }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState({
    display_name: username || '',
    pronouns: '',
    sex: '',
    birth_date: '',
    birth_time: '',
    birth_location: '',
    sun_sign: '',
    moon_sign: '',
    rising_sign: '',
    chinese_zodiac: '',
    chinese_element: '',
    life_path_number: null,
    soul_card: '',
    life_path_card: '',
    mbti: '',
    enneagram: '',
    human_design: '',
  });

  function set(key, val) {
    setData((prev) => ({ ...prev, [key]: val }));
  }

  function goTo(nextStep) {
    setVisible(false);
    setTimeout(() => {
      setStep(nextStep);
      setVisible(true);
    }, 250);
  }

  async function saveAndComplete() {
    setSaving(true);
    try {
      // display_name lives in settings, not portrait
      if (data.display_name) {
        await apiFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: data.display_name }),
        }).catch(() => {});
      }

      // Save portrait data (everything except display_name)
      const full = { ...data };
      delete full.display_name;
      await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(full),
      });

      // Mark onboarding complete
      await apiFetch('/api/auth/complete-onboarding', { method: 'POST' });

      onComplete();
    } catch {
      // Still mark complete even if portrait save fails
      await apiFetch('/api/auth/complete-onboarding', { method: 'POST' }).catch(() => {});
      onComplete();
    } finally {
      setSaving(false);
    }
  }

  // Dismiss for this session only — will show again next login
  function handleSkipForNow() {
    onComplete();
  }

  // Permanently skip — marks onboarding complete, saves any partial data
  async function handleSkipCompletely() {
    setSaving(true);
    const hasData = Object.entries(data).some(([k, v]) => v && k !== 'display_name');
    if (data.display_name && data.display_name !== username) {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: data.display_name }),
      }).catch(() => {});
    }
    if (hasData) {
      const portraitData = { ...data };
      delete portraitData.display_name;
      await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(portraitData),
      }).catch(() => {});
    }
    await apiFetch('/api/auth/complete-onboarding', { method: 'POST' }).catch(() => {});
    onComplete();
  }

  const fadeStyle = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(8px)',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
  };

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={fadeStyle}>
          <ProgressDots current={step} total={TOTAL_STEPS} />

          {step === 0 && (
            <WelcomeStep
              onContinue={() => goTo(1)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 1 && (
            <WhoYouAreStep
              data={data}
              set={set}
              onContinue={() => goTo(2)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 2 && (
            <BirthDetailsStep
              data={data}
              set={set}
              onContinue={() => goTo(3)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 3 && (
            <PersonalityStep
              data={data}
              set={set}
              onContinue={() => goTo(4)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 4 && (
            <OllamaStep
              onContinue={() => goTo(5)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 5 && (
            <DoneStep
              data={data}
              onFinish={saveAndComplete}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressDots({ current, total }) {
  return (
    <div style={s.dots}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{ ...s.dot, ...(i <= current ? s.dotActive : {}) }}
        />
      ))}
    </div>
  );
}

// ── Step 0: Welcome ──────────────────────────────────────────────────────────

function SkipButtons({ onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
      <button style={s.skip} onClick={onSkipForNow}>{t('onboarding.skip')}</button>
      <button style={{ ...s.skip, color: 'var(--border)' }} onClick={onSkipCompletely} disabled={saving}>
        {t('onboarding.skipCompletely')}
      </button>
    </div>
  );
}

function WelcomeStep({ onContinue, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  return (
    <>
      <div style={s.title}>{t('onboarding.welcome')}</div>
      <div style={{ ...s.subtitle, whiteSpace: 'pre-line' }}>
        {t('onboarding.welcomeSubtitle')}
      </div>
      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 1: Who You Are ──────────────────────────────────────────────────────

function WhoYouAreStep({ data, set, onContinue, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  return (
    <>
      <div style={s.title}>{t('onboarding.whoYouAre')}</div>
      <div style={s.subtitle}>
        {t('onboarding.whoYouAreSubtitle')}
      </div>

      <label style={s.label}>{t('onboarding.preferredName')}</label>
      <input
        style={s.input}
        value={data.display_name}
        onChange={(e) => set('display_name', e.target.value)}
        placeholder={t('onboarding.preferredNamePlaceholder')}
        autoFocus
      />

      <label style={s.label}>{t('onboarding.pronouns')}</label>
      <input
        style={s.input}
        value={data.pronouns}
        onChange={(e) => set('pronouns', e.target.value)}
        placeholder={t('onboarding.pronounsPlaceholder')}
      />
      <div style={s.hint}>{t('common.optional')}</div>

      <label style={s.label}>{t('onboarding.sex') || 'Sex'}</label>
      <select
        style={s.input}
        value={data.sex}
        onChange={(e) => set('sex', e.target.value)}
      >
        <option value="">—</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="intersex">Intersex</option>
        <option value="prefer_not_to_say">Prefer not to say</option>
      </select>
      <div style={s.hint}>{t('common.optional')}</div>

      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 2: Birth Details ────────────────────────────────────────────────────

function BirthDetailsStep({ data, set, onContinue, onSkipForNow, onSkipCompletely, saving }) {
  const [calculating, setCalculating] = useState(false);
  const [astroResults, setAstroResults] = useState(null);
  const timerRef = useRef(null);

  // Auto-calculate when birth_date changes
  useEffect(() => {
    if (!data.birth_date) { setAstroResults(null); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => calcAstro(), 800);
    return () => clearTimeout(timerRef.current);
  }, [data.birth_date, data.birth_time, data.birth_location]);

  async function calcAstro() {
    if (!data.birth_date) return;
    setCalculating(true);
    try {
      const res = await apiFetch('/api/portrait/astrology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birth_date: data.birth_date,
          birth_time: data.birth_time,
          birth_location: data.birth_location,
        }),
      });
      const result = await res.json();
      setAstroResults(result);

      // Store calculated values
      if (result.sun_sign) set('sun_sign', result.sun_sign);
      if (result.moon_sign) set('moon_sign', result.moon_sign);
      if (result.rising_sign) set('rising_sign', result.rising_sign);
      if (result.chinese_zodiac) set('chinese_zodiac', result.chinese_zodiac);
      if (result.chinese_element) set('chinese_element', result.chinese_element);

      // Calculate life path + tarot
      const lp = calculateLifePath(data.birth_date);
      if (lp) {
        set('life_path_number', lp);
        set('life_path_card', LIFE_PATH_TO_TAROT[lp] || '');
      }
      if (result.sun_sign) {
        set('soul_card', SUN_SIGN_TO_TAROT[result.sun_sign] || '');
      }
    } catch {}
    finally { setCalculating(false); }
  }

  function handleContinue() {
    // If birth data entered but no astro results yet, calculate first
    if (data.birth_date && !astroResults && !calculating) {
      calcAstro().then(() => onContinue());
    } else {
      onContinue();
    }
  }

  const { t } = useLanguage();

  return (
    <>
      <div style={s.title}>{t('onboarding.birthDetails')}</div>
      <div style={{ ...s.subtitle, whiteSpace: 'pre-line' }}>
        {t('onboarding.birthDetailsSubtitle')}
      </div>

      <label style={s.label}>{t('onboarding.dateOfBirth')}</label>
      <input
        style={s.input}
        type="date"
        value={data.birth_date}
        onChange={(e) => set('birth_date', e.target.value)}
        autoFocus
      />

      <label style={s.label}>{t('onboarding.timeOfBirth')}</label>
      <input
        style={s.input}
        type="time"
        value={data.birth_time}
        onChange={(e) => set('birth_time', e.target.value)}
      />
      <div style={s.hint}>{t('onboarding.timeHint')}</div>

      <label style={s.label}>{t('onboarding.placeOfBirth')}</label>
      <input
        style={s.input}
        value={data.birth_location}
        onChange={(e) => set('birth_location', e.target.value)}
        placeholder={t('onboarding.placePlaceholder')}
      />
      <div style={s.hint}>{t('onboarding.placeHint')}</div>

      {calculating && (
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', marginBottom: '16px' }}>
          {t('onboarding.calculating')}
        </div>
      )}

      {astroResults && !calculating && (
        <div style={s.astroResult}>
          {astroResults.sun_sign && <div>{t('astro.sun')}: <span style={s.astroValue}>{astroResults.sun_sign}</span></div>}
          {astroResults.moon_sign && <div>{t('astro.moon')}: <span style={s.astroValue}>{astroResults.moon_sign}</span></div>}
          {astroResults.rising_sign && <div>{t('astro.rising')}: <span style={s.astroValue}>{astroResults.rising_sign}</span></div>}
          {astroResults.chinese_zodiac && (
            <div>{t('astro.chineseZodiac')}: <span style={s.astroValue}>
              {astroResults.chinese_element ? `${astroResults.chinese_element} ` : ''}{astroResults.chinese_zodiac}
            </span></div>
          )}
          {data.life_path_number && <div>{t('astro.lifePath')}: <span style={s.astroValue}>{data.life_path_number}</span></div>}
          {data.soul_card && <div>{t('astro.soulCard')}: <span style={s.astroValue}>{data.soul_card}</span></div>}
        </div>
      )}

      <button
        style={{ ...s.btn, opacity: calculating ? 0.5 : 1 }}
        onClick={handleContinue}
        disabled={calculating}
      >
        {calculating ? t('onboarding.calculating') : data.birth_date ? t('onboarding.calculateContinue') : t('common.continue')}
      </button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 3: Personality ──────────────────────────────────────────────────────

function PersonalityStep({ data, set, onContinue, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  return (
    <>
      <div style={s.title}>{t('onboarding.personality')}</div>
      <div style={{ ...s.subtitle, whiteSpace: 'pre-line' }}>
        {t('onboarding.personalitySubtitle')}
      </div>

      <label style={s.label}>MBTI Type</label>
      <input
        style={s.input}
        value={data.mbti}
        onChange={(e) => set('mbti', e.target.value.toUpperCase())}
        placeholder={t('onboarding.mbtiPlaceholder')}
        maxLength={4}
        autoFocus
      />
      <div style={s.hint}>
        Not sure? <a href="https://www.16personalities.com/free-personality-test" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--muted)' }}>{t('onboarding.takeTest')}</a>
      </div>

      <label style={s.label}>Enneagram</label>
      <input
        style={s.input}
        value={data.enneagram}
        onChange={(e) => set('enneagram', e.target.value)}
        placeholder={t('onboarding.enneagramPlaceholder')}
      />

      <label style={s.label}>Human Design</label>
      <input
        style={s.input}
        value={data.human_design}
        onChange={(e) => set('human_design', e.target.value)}
        placeholder={t('onboarding.humanDesignPlaceholder')}
      />

      <button style={s.btn} onClick={onContinue}>{t('onboarding.finishSetup')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 4: Ollama Setup ────────────────────────────────────────────────────

function OllamaStep({ onContinue, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  const [ollamaStatus, setOllamaStatus] = useState(null); // null = checking, true = online, false = offline

  useEffect(() => {
    apiFetch('/api/ollama/models')
      .then(r => r.json())
      .then(data => setOllamaStatus(data.online === true))
      .catch(() => setOllamaStatus(false));
  }, []);

  function recheckOllama() {
    setOllamaStatus(null);
    apiFetch('/api/ollama/models')
      .then(r => r.json())
      .then(data => setOllamaStatus(data.online === true))
      .catch(() => setOllamaStatus(false));
  }

  return (
    <>
      <div style={s.title}>{t('onboarding.ollamaTitle')}</div>
      <div style={{ ...s.subtitle, whiteSpace: 'pre-line' }}>
        {t('onboarding.ollamaSubtitle')}
      </div>

      <div style={{
        padding: '16px 18px',
        border: 'var(--border-style)',
        borderRadius: '2px',
        background: 'var(--near-white)',
        marginBottom: '16px',
        fontSize: '12px',
        color: 'var(--body)',
        lineHeight: '1.8',
      }}>
        <div style={{ fontWeight: '600', color: 'var(--strong)', marginBottom: '8px' }}>
          {t('onboarding.ollamaSteps')}
        </div>
        <div>1. {t('onboarding.ollamaStep1')}</div>
        <div style={{ marginLeft: '16px', marginBottom: '4px' }}>
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--strong)', textDecoration: 'underline' }}
          >
            ollama.com/download
          </a>
        </div>
        <div>2. {t('onboarding.ollamaStep2')}</div>
        <div>3. {t('onboarding.ollamaStep3')}</div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '20px',
        fontSize: '12px',
      }}>
        <div style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: ollamaStatus === null ? 'var(--border)' : ollamaStatus ? '#2ecc71' : '#e74c3c',
          flexShrink: 0,
        }} />
        <span style={{ color: ollamaStatus ? 'var(--body)' : 'var(--muted)' }}>
          {ollamaStatus === null
            ? t('onboarding.ollamaChecking')
            : ollamaStatus
              ? t('onboarding.ollamaDetected')
              : t('onboarding.ollamaNotDetected')}
        </span>
        {ollamaStatus !== null && (
          <button
            onClick={recheckOllama}
            style={{
              fontSize: '11px',
              color: 'var(--muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              textDecoration: 'underline',
            }}
          >
            {t('onboarding.ollamaRecheck')}
          </button>
        )}
      </div>

      <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', marginBottom: '20px' }}>
        {t('onboarding.ollamaSettingsHint')}
      </div>

      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 5: Done ─────────────────────────────────────────────────────────────

function DoneStep({ data, onFinish, saving }) {
  const { t } = useLanguage();
  return (
    <>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '16px' }}>✦</div>
        <div style={{ ...s.title, textAlign: 'center' }}>{t('onboarding.done')}</div>
        <div style={{ ...s.subtitle, textAlign: 'center', whiteSpace: 'pre-line' }}>
          {t('onboarding.doneSubtitle')}
        </div>
      </div>
      <button
        style={{ ...s.btn, opacity: saving ? 0.5 : 1 }}
        onClick={onFinish}
        disabled={saving}
      >
        {saving ? t('common.saving') : t('onboarding.startJournaling')}
      </button>
    </>
  );
}
