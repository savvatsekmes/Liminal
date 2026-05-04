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
    width: '520px',
    maxHeight: '85vh',
    overflowY: 'auto',
    padding: '52px 56px',
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

const TOTAL_STEPS = 9;

// Personality quiz constants. Each question has 3 typed answers; the type with
// the most picks (witness > seeker > attuned tie-break) determines the layout
// preset and pre-fills the response-style sliders. Copy lives in en.js under
// onboarding.quiz.q1..q7.{question,witness,seeker,attuned} and result labels
// live under onboarding.quiz.result.<type>.{label,description}.
const QUIZ_QUESTIONS = [
  { questionKey: 'onboarding.quiz.q1.question', answers: [
    { textKey: 'onboarding.quiz.q1.witness', type: 'witness' },
    { textKey: 'onboarding.quiz.q1.seeker',  type: 'seeker'  },
    { textKey: 'onboarding.quiz.q1.attuned', type: 'attuned' },
  ] },
  { questionKey: 'onboarding.quiz.q2.question', answers: [
    { textKey: 'onboarding.quiz.q2.witness', type: 'witness' },
    { textKey: 'onboarding.quiz.q2.seeker',  type: 'seeker'  },
    { textKey: 'onboarding.quiz.q2.attuned', type: 'attuned' },
  ] },
  { questionKey: 'onboarding.quiz.q3.question', answers: [
    { textKey: 'onboarding.quiz.q3.witness', type: 'witness' },
    { textKey: 'onboarding.quiz.q3.seeker',  type: 'seeker'  },
    { textKey: 'onboarding.quiz.q3.attuned', type: 'attuned' },
  ] },
  { questionKey: 'onboarding.quiz.q4.question', answers: [
    { textKey: 'onboarding.quiz.q4.witness', type: 'witness' },
    { textKey: 'onboarding.quiz.q4.seeker',  type: 'seeker'  },
    { textKey: 'onboarding.quiz.q4.attuned', type: 'attuned' },
  ] },
  { questionKey: 'onboarding.quiz.q5.question', answers: [
    { textKey: 'onboarding.quiz.q5.witness', type: 'witness' },
    { textKey: 'onboarding.quiz.q5.seeker',  type: 'seeker'  },
    { textKey: 'onboarding.quiz.q5.attuned', type: 'attuned' },
  ] },
  { questionKey: 'onboarding.quiz.q6.question', answers: [
    { textKey: 'onboarding.quiz.q6.witness', type: 'witness' },
    { textKey: 'onboarding.quiz.q6.seeker',  type: 'seeker'  },
    { textKey: 'onboarding.quiz.q6.attuned', type: 'attuned' },
  ] },
  { questionKey: 'onboarding.quiz.q7.question', answers: [
    { textKey: 'onboarding.quiz.q7.witness', type: 'witness' },
    { textKey: 'onboarding.quiz.q7.seeker',  type: 'seeker'  },
    { textKey: 'onboarding.quiz.q7.attuned', type: 'attuned' },
  ] },
];

const QUIZ_RESULT_LABEL_KEYS = {
  witness: 'onboarding.quiz.result.witness.label',
  seeker:  'onboarding.quiz.result.seeker.label',
  attuned: 'onboarding.quiz.result.attuned.label',
};
const QUIZ_RESULT_DESCRIPTION_KEYS = {
  witness: 'onboarding.quiz.result.witness.description',
  seeker:  'onboarding.quiz.result.seeker.description',
  attuned: 'onboarding.quiz.result.attuned.description',
};

// Slider presets per quiz outcome. Pre-fill values for ResponseStyleStep so
// the user lands on something already tuned to their result; they can still
// nudge any slider before continuing. Extracted from the running build so the
// experience matches what users were already getting.
const QUIZ_SLIDER_PRESETS = {
  witness: {
    slider_rational_spiritual: 20, slider_gentle_direct: 55, slider_reflective_action: 35,
    slider_light_deep: 65, slider_conversational_poetic: 28,
    slider_candor: 60, slider_friend_stranger: 28,
    slider_portrait_weight: 10, slider_sky_weight: 0,
  },
  seeker: {
    slider_rational_spiritual: 55, slider_gentle_direct: 42, slider_reflective_action: 28,
    slider_light_deep: 70, slider_conversational_poetic: 55,
    slider_candor: 52, slider_friend_stranger: 42,
    slider_portrait_weight: 42, slider_sky_weight: 20,
  },
  attuned: {
    slider_rational_spiritual: 78, slider_gentle_direct: 38, slider_reflective_action: 25,
    slider_light_deep: 78, slider_conversational_poetic: 68,
    slider_candor: 50, slider_friend_stranger: 55,
    slider_portrait_weight: 82, slider_sky_weight: 80,
  },
};

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

  // Backup settings (separate from `data` because they go to /api/settings,
  // not /api/portrait). Defaults: encourage auto-backup, but disable until a
  // folder is actually chosen (the backend won't run a backup without one).
  const [backup, setBackup] = useState({
    auto_backup_enabled: true,
    backup_location: '',
    max_backups: '10',
  });

  // Avatar URL after upload (the actual file is on the server immediately —
  // this state just tracks what to render in the preview circle).
  const [avatarUrl, setAvatarUrl] = useState(null);

  function set(key, val) {
    setData((prev) => ({ ...prev, [key]: val }));
  }

  function setBackupField(key, val) {
    setBackup((prev) => ({ ...prev, [key]: val }));
  }

  function goTo(nextStep) {
    setVisible(false);
    setTimeout(() => {
      setStep(nextStep);
      setVisible(true);
    }, 250);
  }

  // Build the settings payload from display_name + backup state. Auto-backup
  // can only be on if a folder is set — otherwise the backend would silently
  // do nothing and the user would think they were protected.
  function buildSettingsPayload() {
    const payload = {};
    if (data.display_name) payload.display_name = data.display_name;
    if (backup.backup_location) {
      payload.backup_location = backup.backup_location;
      payload.auto_backup_enabled = backup.auto_backup_enabled ? 'true' : 'false';
      payload.max_backups = String(backup.max_backups);
    }
    return payload;
  }

  async function saveAndComplete() {
    setSaving(true);
    try {
      const settingsPayload = buildSettingsPayload();
      if (Object.keys(settingsPayload).length) {
        await apiFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsPayload),
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

  // Dismiss + mark complete. Originally this only dismissed for the session
  // and onboarding popped back next login, but that read as a bug — users who
  // entered partial data (e.g. date of birth) and hit Skip naturally expect
  // it to stick. Now both Skip buttons save any data and flip the flag; the
  // user can always come back via Settings → Memory to refine portrait values.
  async function handleSkipForNow() {
    setSaving(true);
    try {
      const hasData = Object.entries(data).some(([k, v]) => v && k !== 'display_name');
      const settingsPayload = buildSettingsPayload();
      const hasNewName = data.display_name && data.display_name !== username;
      if (hasNewName || backup.backup_location) {
        await apiFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsPayload),
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
    } finally {
      setSaving(false);
      onComplete();
    }
  }

  // Permanently skip — marks onboarding complete, saves any partial data
  async function handleSkipCompletely() {
    setSaving(true);
    const hasData = Object.entries(data).some(([k, v]) => v && k !== 'display_name');
    const settingsPayload = buildSettingsPayload();
    // Only push settings if display_name actually changed OR backup was set up
    const hasNewName = data.display_name && data.display_name !== username;
    if (hasNewName || backup.backup_location) {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload),
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
            />
          )}
          {step === 1 && (
            <QuizStep
              onResult={(layoutKey) => {
                // Merge the preset's slider defaults into running state so
                // ResponseStyleStep shows them pre-filled. saveAndComplete()
                // at the end flushes via PUT /api/portrait.
                const sliders = QUIZ_SLIDER_PRESETS[layoutKey] || {};
                setData((prev) => ({ ...prev, ...sliders }));
                // Persist the layout choice immediately so it's set on
                // /api/auth/me even if the user closes before finishing.
                apiFetch('/api/auth/quiz-result', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ layout: layoutKey }),
                }).catch(() => {});
                goTo(2);
              }}
            />
          )}
          {step === 2 && (
            // Response Style runs right after the quiz so users can fine-tune
            // the auto-applied slider preset. Skip on this step must NOT mark
            // onboarding complete — the age gate lives on Birth Details (next).
            <ResponseStyleStep
              data={data}
              set={set}
              onContinue={() => goTo(3)}
              onBack={() => goTo(1)}
              onSkipForNow={() => goTo(3)}
              onSkipCompletely={() => goTo(3)}
              saving={saving}
            />
          )}
          {step === 3 && (
            <BirthDetailsStep
              data={data}
              set={set}
              onContinue={() => goTo(4)}
              onBack={() => goTo(2)}
              saving={saving}
            />
          )}
          {step === 4 && (
            <WhoYouAreStep
              data={data}
              set={set}
              avatarUrl={avatarUrl}
              onAvatarChange={setAvatarUrl}
              onContinue={() => goTo(5)}
              onBack={() => goTo(3)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 5 && (
            <PersonalityStep
              data={data}
              set={set}
              onContinue={() => goTo(6)}
              onBack={() => goTo(4)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 6 && (
            <OllamaStep
              onContinue={() => goTo(7)}
              onBack={() => goTo(5)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 7 && (
            <BackupsStep
              backup={backup}
              setBackup={setBackupField}
              onContinue={() => goTo(8)}
              onBack={() => goTo(6)}
              onSkipForNow={handleSkipForNow}
              onSkipCompletely={handleSkipCompletely}
              saving={saving}
            />
          )}
          {step === 8 && (
            <DoneStep
              data={data}
              onFinish={saveAndComplete}
              onBack={() => goTo(7)}
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

function BackButton({ onClick }) {
  const { t } = useLanguage();
  return (
    <button
      style={{ ...s.skip, marginBottom: '8px', fontSize: '12px' }}
      onClick={onClick}
    >
      {t('common.back')}
    </button>
  );
}

function WelcomeStep({ onContinue }) {
  const { t } = useLanguage();
  return (
    <>
      <div style={s.title}>{t('onboarding.welcome')}</div>
      <div style={{ ...s.subtitle, whiteSpace: 'pre-line' }}>
        {t('onboarding.welcomeSubtitle')}
      </div>
      <div style={{
        fontSize: '12px',
        color: 'var(--body)',
        lineHeight: '1.7',
        padding: '16px 18px',
        background: 'var(--panel-bg)',
        border: 'var(--border-style)',
        borderRadius: '2px',
        marginBottom: '28px',
      }}>
        <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          {t('onboarding.disclaimerHeading')}
        </div>
        {t('onboarding.disclaimerBody1')}
        <br /><br />
        {t('onboarding.disclaimerBody2')}
        <br /><br />
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
          {t('onboarding.disclaimerCrisisLabel')} <strong>988</strong> (USA), <strong>116 123</strong> (UK Samaritans),{' '}
          <strong>13 11 14</strong> (AU Lifeline), <strong>988</strong> (Canada),{' '}
          <strong>112</strong> {t('onboarding.disclaimerCrisisSuffix')}
        </span>
        <br /><br />
        <span style={{ fontStyle: 'italic', color: 'var(--muted)' }}>
          {t('onboarding.disclaimerClosing')}
        </span>
      </div>
      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
    </>
  );
}

// ── Step 1: Who You Are ──────────────────────────────────────────────────────

// ── Quiz step ────────────────────────────────────────────────────────────────
// Seven multi-choice questions, three-way scoring (witness / seeker /
// attuned). The winning type sets the response-style slider preset and is
// persisted via /api/auth/quiz-result so it survives a relaunch even if the
// user closes the app before finishing onboarding.
function QuizStep({ onResult }) {
  const { t } = useLanguage();
  // sub: 'questions' while answering, 'result' once we have a winner.
  const [sub, setSub] = useState(0);          // 0..QUIZ_QUESTIONS.length-1 OR 'result'
  const [picks, setPicks] = useState([]);     // accumulated 'witness'|'seeker'|'attuned'
  const [result, setResult] = useState(null);

  function pick(type) {
    const next = [...picks, type];
    if (next.length >= QUIZ_QUESTIONS.length) {
      // Tally — tie-break order matches the quiz's intended fallback chain.
      const scores = { witness: 0, seeker: 0, attuned: 0 };
      for (const k of next) scores[k]++;
      let bestKey = 'witness';
      let bestScore = -1;
      for (const k of ['witness', 'seeker', 'attuned']) {
        if (scores[k] > bestScore) { bestKey = k; bestScore = scores[k]; }
      }
      setPicks(next);
      setResult(bestKey);
      setSub('result');
    } else {
      setPicks(next);
      setSub(next.length);
    }
  }

  function skip() {
    onResult('witness');
  }

  if (sub === 'result' && result) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: '32px', marginBottom: '20px', color: 'var(--muted)' }}>✦</div>
        <div style={{ ...s.title, marginBottom: '12px' }}>{t(QUIZ_RESULT_LABEL_KEYS[result])}</div>
        <div style={{ ...s.subtitle, marginBottom: '8px', maxWidth: '360px', margin: '0 auto 8px' }}>
          {t(QUIZ_RESULT_DESCRIPTION_KEYS[result])}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '32px', fontStyle: 'italic' }}>
          {t('onboarding.quiz.adjustAnytime')}
        </div>
        <button style={{ ...s.btn, maxWidth: '240px', margin: '0 auto' }} onClick={() => onResult(result)}>
          {t('common.continue')}
        </button>
      </div>
    );
  }

  const q = QUIZ_QUESTIONS[sub];
  return (
    <>
      <div style={{ ...s.title, fontSize: '20px', textAlign: 'center', marginBottom: '32px', lineHeight: '1.4' }}>
        {t(q.questionKey)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
        {q.answers.map((a) => (
          <button
            key={a.type}
            type="button"
            onClick={() => pick(a.type)}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--near-white)'; e.currentTarget.style.color = 'var(--strong)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--body)'; }}
            style={{
              padding: '14px 18px',
              fontSize: '13px',
              lineHeight: '1.5',
              textAlign: 'left',
              background: 'var(--white)',
              color: 'var(--body)',
              border: 'var(--border-style)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {t(a.textKey)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
        {QUIZ_QUESTIONS.map((_, i) => (
          <div
            key={i}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: i <= sub ? 'var(--strong)' : 'var(--border)',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <button onClick={skip} style={{ ...s.skip, fontSize: '11px', color: 'var(--muted)' }}>
          {t('onboarding.quiz.skipQuiz')}
        </button>
      </div>
    </>
  );
}

function WhoYouAreStep({ data, set, avatarUrl, onAvatarChange, onContinue, onBack, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef(null);

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await apiFetch('/api/auth/avatar', { method: 'POST', body: form });
      const result = await res.json();
      if (result?.avatar_url) {
        // Cache-bust so the preview updates if the same path is reused.
        onAvatarChange(`${result.avatar_url}?t=${Date.now()}`);
      } else if (result?.error) {
        setAvatarError(result.error);
      }
    } catch (err) {
      setAvatarError(t('onboarding.avatarUploadFailed'));
    } finally {
      setUploadingAvatar(false);
      // Reset input so the same file can be selected again if needed.
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  return (
    <>
      <BackButton onClick={onBack} />
      <div style={s.title}>{t('onboarding.whoYouAre')}</div>
      <div style={s.subtitle}>
        {t('onboarding.whoYouAreSubtitle')}
      </div>

      <label style={s.label}>{t('onboarding.profilePhoto')}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: 'var(--border-style)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--panel-bg)',
            border: 'var(--border-style)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            color: 'var(--muted)',
            flexShrink: 0,
          }}>
            ✦
          </div>
        )}
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={uploadingAvatar}
          style={{
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: '500',
            background: 'transparent',
            color: 'var(--strong)',
            border: 'var(--border-style)',
            borderRadius: '2px',
            cursor: uploadingAvatar ? 'default' : 'pointer',
            fontFamily: 'var(--font)',
            opacity: uploadingAvatar ? 0.6 : 1,
          }}
        >
          {uploadingAvatar ? t('onboarding.avatarUploading') : avatarUrl ? t('onboarding.avatarChange') : t('onboarding.avatarUpload')}
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleAvatarUpload}
        />
      </div>
      {avatarError ? (
        <div style={{ ...s.hint, color: '#c44', fontStyle: 'normal' }}>{avatarError}</div>
      ) : (
        <div style={s.hint}>{t('common.optional')}</div>
      )}

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

      <label style={s.label}>{t('onboarding.sex')}</label>
      <select
        style={s.input}
        value={data.sex}
        onChange={(e) => set('sex', e.target.value)}
      >
        <option value="">—</option>
        <option value="male">{t('onboarding.sexMale')}</option>
        <option value="female">{t('onboarding.sexFemale')}</option>
        <option value="intersex">{t('onboarding.sexIntersex')}</option>
        <option value="prefer_not_to_say">{t('onboarding.sexPreferNotToSay')}</option>
      </select>
      <div style={s.hint}>{t('common.optional')}</div>

      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 2: Birth Details ────────────────────────────────────────────────────

function BirthDetailsStep({ data, set, onContinue, onBack, saving }) {
  const [calculating, setCalculating] = useState(false);
  const [astroResults, setAstroResults] = useState(null);
  const timerRef = useRef(null);

  // Age check — non-skippable gate. Returns 'ok' | 'empty' | 'invalid' | 'under13'.
  const dobStatus = (() => {
    if (!data.birth_date) return 'empty';
    const dob = new Date(data.birth_date);
    if (isNaN(dob.getTime())) return 'invalid';
    const now = new Date();
    if (dob > now) return 'invalid';
    if (dob.getFullYear() < 1900) return 'invalid';
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    if (age < 16) return 'underAge';
    return 'ok';
  })();

  // Auto-calculate when birth_date changes (only once age gate passes)
  useEffect(() => {
    if (dobStatus !== 'ok') { setAstroResults(null); return; }
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

  // Persist birth fields immediately so PortraitPage is pre-populated even if
  // the user later abandons onboarding via "Skip for now".
  async function persistBirth() {
    if (!data.birth_date) return;
    try {
      await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birth_date: data.birth_date,
          birth_time: data.birth_time || '',
          birth_location: data.birth_location || '',
          sun_sign: data.sun_sign || '',
          moon_sign: data.moon_sign || '',
          rising_sign: data.rising_sign || '',
          chinese_zodiac: data.chinese_zodiac || '',
          chinese_element: data.chinese_element || '',
          life_path_number: data.life_path_number,
          soul_card: data.soul_card || '',
          life_path_card: data.life_path_card || '',
        }),
      });
    } catch {}
  }

  function handleContinue() {
    if (dobStatus !== 'ok') return;
    // If birth data entered but no astro results yet, calculate first
    if (data.birth_date && !astroResults && !calculating) {
      calcAstro().then(() => persistBirth()).then(() => onContinue());
    } else {
      persistBirth().then(() => onContinue());
    }
  }

  const { t } = useLanguage();
  const today = new Date().toISOString().slice(0, 10);
  const canContinue = dobStatus === 'ok' && !calculating;

  return (
    <>
      <BackButton onClick={onBack} />
      <div style={s.title}>{t('onboarding.birthDetails')}</div>
      <div style={{ ...s.subtitle, whiteSpace: 'pre-line' }}>
        {t('onboarding.birthDetailsSubtitle')}
      </div>

      <label style={s.label}>{t('onboarding.dateOfBirth')}</label>
      <input
        style={s.input}
        type="date"
        value={data.birth_date}
        max={today}
        min="1900-01-01"
        onChange={(e) => set('birth_date', e.target.value)}
        autoFocus
      />
      {dobStatus === 'empty' && (
        <div style={s.hint}>{t('onboarding.dobRequiredHint')}</div>
      )}
      {dobStatus === 'invalid' && (
        <div style={{ ...s.hint, color: 'var(--danger, #c0392b)' }}>{t('onboarding.dobInvalid')}</div>
      )}
      {dobStatus === 'underAge' && (
        <div style={{ ...s.hint, color: 'var(--danger, #c0392b)' }}>{t('onboarding.dobUnderAge')}</div>
      )}

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

      {/* Calculated values (sun, moon, rising, Chinese zodiac, life path,
          soul card) are computed silently in the background and saved to the
          portrait. Onboarding doesn't display them — the user sees their
          chart later in the Oracle/Portrait tab. */}

      <button
        style={{ ...s.btn, opacity: canContinue ? 1 : 0.5, cursor: canContinue ? 'pointer' : 'not-allowed' }}
        onClick={handleContinue}
        disabled={!canContinue}
      >
        {calculating ? t('onboarding.calculating') : t('common.continue')}
      </button>
    </>
  );
}

// ── Step 3: Personality ──────────────────────────────────────────────────────

function PersonalityStep({ data, set, onContinue, onBack, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  return (
    <>
      <BackButton onClick={onBack} />
      <div style={s.title}>{t('onboarding.personality')}</div>
      <div style={{ ...s.subtitle, whiteSpace: 'pre-line' }}>
        {t('onboarding.personalitySubtitle')}
      </div>

      <label style={s.label}>{t('onboarding.mbtiLabel')}</label>
      <input
        style={s.input}
        value={data.mbti}
        onChange={(e) => set('mbti', e.target.value.toUpperCase())}
        placeholder={t('onboarding.mbtiPlaceholder')}
        maxLength={4}
        autoFocus
      />
      <div style={s.hint}>
        {t('onboarding.notSure')} <a href="https://www.16personalities.com/free-personality-test" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--muted)' }}>{t('onboarding.takeTest')}</a>
      </div>

      <label style={s.label}>{t('onboarding.enneagramLabel')}</label>
      <input
        style={s.input}
        value={data.enneagram}
        onChange={(e) => set('enneagram', e.target.value)}
        placeholder={t('onboarding.enneagramPlaceholder')}
      />

      <label style={s.label}>{t('onboarding.humanDesignLabel')}</label>
      <input
        style={s.input}
        value={data.human_design}
        onChange={(e) => set('human_design', e.target.value)}
        placeholder={t('onboarding.humanDesignPlaceholder')}
      />

      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 4: Response Style ───────────────────────────────────────────────────

const ONBOARDING_SLIDERS = [
  { key: 'slider_rational_spiritual',      lowKey: 'context.sliderRational',     highKey: 'context.sliderSpiritual' },
  { key: 'slider_gentle_direct',           lowKey: 'context.sliderGentle',       highKey: 'context.sliderDirect' },
  { key: 'slider_reflective_action',       lowKey: 'context.sliderReflective',   highKey: 'context.sliderAction' },
  { key: 'slider_light_deep',              lowKey: 'context.sliderLight',        highKey: 'context.sliderDeep' },
  { key: 'slider_conversational_poetic',   lowKey: 'context.sliderConversational', highKey: 'context.sliderPoetic' },
  { key: 'slider_candor',                  lowKey: 'context.sliderAgreeable',    highKey: 'context.sliderCandid' },
  { key: 'slider_friend_stranger',         lowKey: 'context.sliderFriend',       highKey: 'context.sliderStranger' },
];

function ResponseStyleStep({ data, set, onContinue, onBack, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  return (
    <>
      <BackButton onClick={onBack} />
      <div style={s.title}>{t('onboarding.responseStyleTitle')}</div>
      <div style={s.subtitle}>
        {t('onboarding.responseStyleSubtitle')}
      </div>

      {ONBOARDING_SLIDERS.map(({ key, lowKey, highKey }) => (
        <div key={key} style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', width: '90px', textAlign: 'right', flexShrink: 0 }}>{t(lowKey)}</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1, accentColor: 'var(--body)' }}
              value={data[key] ?? (key === 'slider_friend_stranger' ? 30 : 50)}
              onChange={(e) => set(key, Number(e.target.value))}
            />
            <span style={{ fontSize: '11px', color: 'var(--muted)', width: '90px', flexShrink: 0 }}>{t(highKey)}</span>
          </div>
          {key === 'slider_candor' && (data.slider_candor ?? 50) > 65 && (
            <div style={{
              fontSize: '11px',
              color: '#c44',
              marginTop: '4px',
              padding: '8px 12px',
              background: 'rgba(204,68,68,0.06)',
              borderRadius: '2px',
              lineHeight: '1.5',
            }}>
              <strong>{t('onboarding.candorWarningHeading')}</strong> {t('onboarding.candorWarningBody')}
            </div>
          )}
        </div>
      ))}

      <div style={{
        fontSize: '11px',
        color: 'var(--muted)',
        fontStyle: 'italic',
        marginTop: '8px',
        marginBottom: '24px',
        lineHeight: '1.6',
      }}>
        {t('onboarding.responseStyleFooter')}
      </div>

      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 5: Ollama Setup ────────────────────────────────────────────────────

const PERFORMANCE_TIERS = [
  // qwen3.5:2b is intentionally absent — it produces too many comprehension
  // errors and invented aphorisms on /api/reflect to represent the product
  // well. 4b is the practical floor for usable reflection output.
  { id: 'low',  labelKey: 'onboarding.ollamaTier.low.label',  descKey: 'onboarding.ollamaTier.low.desc',  model: 'qwen3.5:4b',  size: '3.4 GB' },
  { id: 'mid',  labelKey: 'onboarding.ollamaTier.mid.label',  descKey: 'onboarding.ollamaTier.mid.desc',  model: 'qwen3.5:9b',  size: '6.6 GB' },
  { id: 'high', labelKey: 'onboarding.ollamaTier.high.label', descKey: 'onboarding.ollamaTier.high.desc', model: 'qwen3.5:27b', size: '17 GB'  },
];

function OllamaStep({ onContinue, onBack, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [installedModels, setInstalledModels] = useState(new Set());
  const [selectedTier, setSelectedTier] = useState('');
  const [pulling, setPulling] = useState(null); // { status, progress, total }
  const [pullDone, setPullDone] = useState(false);

  function checkOllama() {
    setOllamaStatus(null);
    apiFetch('/api/ollama/models')
      .then(r => r.json())
      .then(data => {
        setOllamaStatus(data.online === true);
        if (data.models) setInstalledModels(new Set(data.models.map(m => m.name)));
      })
      .catch(() => setOllamaStatus(false));
  }

  useEffect(() => { checkOllama(); }, []);

  const tier = PERFORMANCE_TIERS.find(pt => pt.id === selectedTier);
  const isInstalled = tier && installedModels.has(tier.model);

  async function downloadModel() {
    if (!tier) return;
    setPulling({ status: 'Starting\u2026', progress: 0, total: 0 });
    setPullDone(false);
    try {
      const res = await apiFetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: tier.model }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.error) {
              setPulling({ status: `Error: ${msg.error}`, progress: 0, total: 0 });
            } else if (msg.status === 'done' || msg.status === 'success') {
              setPulling(null);
              setPullDone(true);
              setInstalledModels(prev => new Set([...prev, tier.model]));
              // Set as the active model for all features
              apiFetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ollama_model: tier.model, llm_provider: 'ollama' }),
              }).catch(() => {});
            } else {
              setPulling({ status: msg.status, progress: msg.completed || 0, total: msg.total || 0 });
            }
          } catch {}
        }
      }
    } catch (err) {
      setPulling({ status: `Failed: ${err.message}`, progress: 0, total: 0 });
    }
  }

  function handleSelectInstalled() {
    if (!tier) return;
    // Set as active model
    apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollama_model: tier.model, llm_provider: 'ollama' }),
    }).catch(() => {});
    setPullDone(true);
  }

  return (
    <>
      <BackButton onClick={onBack} />
      <div style={s.title}>{t('onboarding.ollamaTitle')}</div>
      <div style={{ ...s.subtitle, whiteSpace: 'pre-line' }}>
        {t('onboarding.ollamaSubtitle')}
      </div>

      {/* Install instructions */}
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
          <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--strong)', textDecoration: 'underline' }}>
            ollama.com/download
          </a>
        </div>
        <div>2. {t('onboarding.ollamaStep2')}</div>
        <div>3. {t('onboarding.ollamaStep3Choose')}</div>
      </div>

      {/* Ollama status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '12px' }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: ollamaStatus === null ? 'var(--border)' : ollamaStatus ? '#2ecc71' : '#e74c3c',
        }} />
        <span style={{ color: ollamaStatus ? 'var(--body)' : 'var(--muted)' }}>
          {ollamaStatus === null
            ? t('onboarding.ollamaChecking')
            : ollamaStatus
              ? t('onboarding.ollamaDetected')
              : t('onboarding.ollamaNotDetected')}
        </span>
        {ollamaStatus !== null && (
          <button onClick={checkOllama}
            style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'underline' }}>
            {t('onboarding.ollamaRecheck')}
          </button>
        )}
      </div>

      {/* Performance tier selector */}
      {ollamaStatus && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '10px' }}>
            {t('onboarding.ollamaTierHeading')}
          </div>

          {PERFORMANCE_TIERS.map(pt => {
            const active = selectedTier === pt.id;
            const installed = installedModels.has(pt.model);
            return (
              <button
                key={pt.id}
                onClick={() => { setSelectedTier(pt.id); setPullDone(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  marginBottom: '6px',
                  border: active ? '1.5px solid var(--strong)' : 'var(--border-style)',
                  borderRadius: '2px',
                  background: active ? 'var(--panel-bg)' : 'var(--white)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--strong)' }}>{t(pt.labelKey)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{pt.model} · {pt.size}</span>
                  {installed && <span style={{ fontSize: '10px', color: '#2ecc71', fontStyle: 'italic' }}>{t('onboarding.ollamaInstalled')}</span>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{t(pt.descKey)}</div>
              </button>
            );
          })}

          {/* Download / Use button */}
          {tier && !pulling && (
            <div style={{ marginTop: '10px' }}>
              {isInstalled && !pullDone ? (
                <button
                  onClick={handleSelectInstalled}
                  style={{ ...s.btn, background: 'var(--strong)', marginBottom: '0' }}
                >
                  {t('onboarding.ollamaUseModel').replace('{model}', tier.model)}
                </button>
              ) : isInstalled || pullDone ? (
                <div style={{ fontSize: '12px', color: '#2ecc71', fontWeight: '500', textAlign: 'center', padding: '8px' }}>
                  {t('onboarding.ollamaModelReady').replace('{model}', tier.model)}
                </div>
              ) : (
                <button
                  onClick={downloadModel}
                  style={{ ...s.btn, marginBottom: '0' }}
                >
                  {t('onboarding.ollamaDownloadModel').replace('{model}', tier.model).replace('{size}', tier.size)}
                </button>
              )}
            </div>
          )}

          {/* Progress bar */}
          {pulling && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{pulling.status}</div>
              {pulling.total > 0 && (
                <div style={{ height: '3px', background: 'var(--panel-bg)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--strong)', width: `${Math.round((pulling.progress / pulling.total) * 100)}%`, transition: 'width 0.3s' }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', marginBottom: '20px' }}>
        {t('onboarding.ollamaSettingsHint')}
      </div>

      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 6: Backups ──────────────────────────────────────────────────────────

function BackupsStep({ backup, setBackup, onContinue, onBack, onSkipForNow, onSkipCompletely, saving }) {
  const { t } = useLanguage();

  async function pickFolder() {
    if (!window.liminal?.pickBackupFolder) {
      alert(t('onboarding.backupDesktopOnlyAlert'));
      return;
    }
    const folder = await window.liminal.pickBackupFolder();
    if (folder) {
      setBackup('backup_location', folder);
      // If they're committing to a folder, keep the toggle ON by default.
      // (They can flip it off below if they only want manual backups.)
      setBackup('auto_backup_enabled', true);
    }
  }

  return (
    <>
      <BackButton onClick={onBack} />
      <div style={s.title}>{t('onboarding.backupTitle')}</div>
      <div style={s.subtitle}>
        {t('onboarding.backupSubtitle')}
      </div>

      <label style={s.label}>{t('onboarding.backupFolderLabel')}</label>
      {backup.backup_location ? (
        <div style={{ ...s.astroResult, wordBreak: 'break-all' }}>
          <span style={s.astroValue}>{backup.backup_location}</span>
        </div>
      ) : (
        <div style={s.hint}>{t('onboarding.backupNoFolder')}</div>
      )}
      <button
        style={{
          ...s.btn,
          background: 'transparent',
          color: 'var(--strong)',
          border: 'var(--border-style)',
        }}
        onClick={pickFolder}
      >
        {backup.backup_location ? t('onboarding.backupChangeFolder') : t('onboarding.backupPickFolder')}
      </button>

      {backup.backup_location && (
        <>
          <label style={s.label}>{t('onboarding.backupAutoLabel')}</label>
          <select
            style={s.input}
            value={backup.auto_backup_enabled ? 'on' : 'off'}
            onChange={(e) => setBackup('auto_backup_enabled', e.target.value === 'on')}
          >
            <option value="on">{t('onboarding.backupEnabled')}</option>
            <option value="off">{t('onboarding.backupDisabled')}</option>
          </select>

          <label style={s.label}>{t('onboarding.backupKeepLabel')}</label>
          <select
            style={s.input}
            value={backup.max_backups}
            onChange={(e) => setBackup('max_backups', e.target.value)}
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="20">20</option>
          </select>
          <div style={s.hint}>{t('onboarding.backupRetentionHint')}</div>
        </>
      )}

      <button style={s.btn} onClick={onContinue}>{t('common.continue')}</button>
      <SkipButtons onSkipForNow={onSkipForNow} onSkipCompletely={onSkipCompletely} saving={saving} />
    </>
  );
}

// ── Step 7: Done ─────────────────────────────────────────────────────────────

function DoneStep({ data, onFinish, onBack, saving }) {
  const { t } = useLanguage();
  return (
    <>
      <BackButton onClick={onBack} />
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
