import { useState } from 'react';
import { setStoredToken } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';
import TermsOfService from './TermsOfService';

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
    display: 'flex',
    alignItems: 'center',
    gap: '60px',
    padding: '52px 56px',
    border: 'var(--border-style)',
    borderRadius: '16px',
    background: 'var(--white)',
    maxWidth: '680px',
    width: '90vw',
  },
  brandCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flexShrink: 0,
  },
  brandLogo: {
    width: '120px',
    height: 'auto',
    opacity: 0.85,
    marginBottom: '16px',
  },
  brandName: {
    fontSize: '22px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: 'var(--strong)',
    marginBottom: '6px',
  },
  tagline: {
    fontSize: '12px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  formCol: {
    flex: 1,
    minWidth: 0,
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
  input: {
    width: '100%',
    marginBottom: '16px',
    fontSize: '14px',
    padding: '10px 12px',
    border: 'var(--border-style)',
    borderRadius: '10px',
    outline: 'none',
    fontFamily: 'var(--font)',
    color: 'var(--strong)',
    background: 'var(--white)',
    boxSizing: 'border-box',
  },
  error: {
    fontSize: '12px',
    color: 'var(--body)',
    marginBottom: '16px',
    padding: '10px 12px',
    background: 'var(--panel-bg)',
    borderRadius: '10px',
    border: 'var(--border-style)',
  },
  btn: {
    width: '100%',
    padding: '12px',
    fontSize: '13px',
    fontWeight: '600',
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    letterSpacing: '0.02em',
    marginBottom: '12px',
  },
  btnSecondary: {
    width: '100%',
    padding: '11px',
    fontSize: '13px',
    fontWeight: '500',
    background: 'transparent',
    color: 'var(--muted)',
    border: 'var(--border-style)',
    borderRadius: '10px',
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
  divider: {
    borderTop: 'var(--border-style)',
    margin: '24px 0 20px',
  },
  hint: {
    marginTop: '20px',
    fontSize: '11px',
    color: 'var(--muted)',
    textAlign: 'center',
    lineHeight: '1.7',
  },
};

export default function PasswordGate({ onSuccess }) {
  const [view, setView] = useState('login'); // 'login' | 'register'

  function handleAuthSuccess(token, username, onboardingComplete) {
    setStoredToken(token);
    onSuccess(username, onboardingComplete);
  }

  if (view === 'register') {
    return <RegisterForm onSuccess={handleAuthSuccess} onBack={() => setView('login')} />;
  }

  return <LoginForm onSuccess={handleAuthSuccess} onRegister={() => setView('register')} />;
}

// ── Login ─────────────────────────────────────────────────────────────────────

function LoginForm({ onSuccess, onRegister }) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError(t('auth.errorUsername')); return; }
    if (!password) { setError(t('auth.errorPassword')); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('auth.errorLoginFailed'));
        setPassword('');
      } else {
        onSuccess(data.token, data.username, data.onboarding_complete);
      }
    } catch {
      setError(t('auth.errorBackend'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.overlay}>
      <form style={s.card} onSubmit={handleSubmit}>
        <div style={s.brandCol}>
          <img src="/logo.png" alt="Liminal" style={s.brandLogo} />
          <div style={s.tagline}>{t('auth.tagline')}</div>
        </div>
        <div style={s.formCol}>
          <label style={s.label} htmlFor="login-username">{t('auth.username')}</label>
          <input
            id="login-username"
            style={s.input}
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('auth.placeholderUsername')}
          />

          <label style={s.label} htmlFor="login-password">{t('auth.password')}</label>
          <input
            id="login-password"
            style={{ ...s.input, marginBottom: error ? '0' : '20px' }}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.placeholderPassword')}
          />

          {error && <div style={{ ...s.error, marginTop: '12px' }}>{error}</div>}

          <button style={{ ...s.btn, opacity: loading ? 0.5 : 1, marginTop: '8px' }} type="submit" disabled={loading}>
            {loading ? '…' : t('auth.login')}
          </button>

          <button type="button" style={s.btnSecondary} onClick={onRegister}>
            {t('auth.register')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────

function RegisterForm({ onSuccess, onBack }) {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError(t('auth.errorChooseUsername')); return; }
    if (password.length < 4) { setError(t('auth.errorPasswordLength')); return; }
    if (password !== confirm) { setError(t('auth.errorPasswordMatch')); return; }
    if (!agreedToTerms) { setError(t('auth.errorMustAgree')); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, agreed_to_terms: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('auth.errorRegisterFailed'));
      } else {
        onSuccess(data.token, data.username, data.onboarding_complete);
      }
    } catch {
      setError(t('auth.errorBackend'));
    } finally {
      setLoading(false);
    }
  }

  if (showTerms) {
    return <TermsOfService onBack={() => setShowTerms(false)} />;
  }

  return (
    <div style={s.overlay}>
      <form style={s.card} onSubmit={handleSubmit}>
        <div style={s.brandCol}>
          <img src="/logo.png" alt="Liminal" style={s.brandLogo} />
          <div style={s.tagline}>{t('auth.tagline')}</div>
        </div>
        <div style={s.formCol}>
          <label style={s.label} htmlFor="reg-username">{t('auth.chooseUsername')}</label>
          <input
            id="reg-username"
            style={s.input}
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('auth.username')}
          />

          <div style={s.divider} />

          <label style={s.label} htmlFor="reg-password">{t('auth.createPassword')}</label>
          <input
            id="reg-password"
            style={s.input}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.placeholderNewPassword')}
          />

          <label style={s.label} htmlFor="reg-confirm">{t('auth.confirmPassword')}</label>
          <input
            id="reg-confirm"
            style={{ ...s.input, marginBottom: '0' }}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('auth.placeholderConfirm')}
          />

          {/* Terms of Service checkbox */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '18px',
          }}>
            <input
              id="reg-terms"
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              style={{
                width: '14px',
                height: '14px',
                accentColor: 'var(--strong)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />
            <label htmlFor="reg-terms" style={{ fontSize: '12px', color: 'var(--body)', cursor: 'pointer' }}>
              {t('auth.agreeToTerms')}
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--strong)',
                  fontSize: '12px',
                  fontWeight: '600',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'var(--font)',
                }}
              >
                {t('auth.termsLink')}
              </button>
            </label>
          </div>

          {error && <div style={{ ...s.error, marginTop: '16px' }}>{error}</div>}

          <button
            style={{ ...s.btn, marginTop: '20px', opacity: (loading || !agreedToTerms) ? 0.5 : 1 }}
            type="submit"
            disabled={loading || !agreedToTerms}
          >
            {loading ? t('auth.creating') : t('auth.createAccount')}
          </button>

          <button type="button" style={s.btnSecondary} onClick={onBack}>
            ← Back
          </button>

          <div style={s.hint}>
            {t('auth.localHint').split('\n').map((line, i, arr) => (
              <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
