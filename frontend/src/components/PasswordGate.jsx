import { useState } from 'react';
import { setStoredToken } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';
import TermsOfService from './TermsOfService';
import { useTheme } from '../hooks/useTheme';

/* CSS-based mobile override — guaranteed to work via media queries */
const mobileCSS = `
@media (max-width: 768px) {
  .auth-card {
    flex-direction: column !important;
    gap: 20px !important;
    padding: 28px 22px !important;
    width: 94vw !important;
    max-width: 400px !important;
  }
  .auth-brand-logo {
    width: 52px !important;
    margin-bottom: 8px !important;
  }
  .auth-brand-col {
    flex-direction: column !important;
  }
}
`;

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
    width: '100px',
    height: 'auto',
    opacity: 0.85,
    marginBottom: '4px',
  },
  brandWordmark: {
    width: '90px',
    height: 'auto',
    opacity: 0.75,
    marginBottom: '12px',
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
  const [view, setView] = useState('login'); // 'login' | 'register' | 'recover' | 'recovery-reveal' | 'wipe'
  // Pending context held while we pause on the recovery-key reveal screen
  // between a successful auth call and handing off to the app. The token is
  // already stored; we just delay calling onSuccess until the user confirms
  // they've saved the key.
  const [pending, setPending] = useState(null); // { username, onboardingComplete, password, recoveryKey, isNewAccount }

  function finishAuth(token, username, onboardingComplete, password, recoveryKey, isNewAccount = false) {
    setStoredToken(token);
    if (recoveryKey) {
      setPending({ username, onboardingComplete, password, recoveryKey, isNewAccount });
      setView('recovery-reveal');
    } else {
      onSuccess(username, onboardingComplete, password);
    }
  }

  function confirmRecoveryReveal() {
    if (!pending) return;
    const { username, onboardingComplete, password } = pending;
    setPending(null);
    onSuccess(username, onboardingComplete, password);
  }

  if (view === 'recovery-reveal' && pending) {
    return <RecoveryKeyReveal
      recoveryKey={pending.recoveryKey}
      isNewAccount={pending.isNewAccount}
      onConfirm={confirmRecoveryReveal}
    />;
  }

  if (view === 'register') {
    return <RegisterForm onSuccess={finishAuth} onBack={() => setView('login')} />;
  }

  if (view === 'recover') {
    return (
      <RecoverForm
        onSuccess={finishAuth}
        onBack={() => setView('login')}
        onWipe={() => setView('wipe')}
      />
    );
  }

  if (view === 'wipe') {
    return <WipeForm onDone={() => setView('login')} onBack={() => setView('recover')} />;
  }

  return (
    <LoginForm
      onSuccess={finishAuth}
      onRegister={() => setView('register')}
      onForgot={() => setView('recover')}
    />
  );
}

// ── Recovery Key Reveal ──────────────────────────────────────────────────────
// Shown once after registration, and once for legacy users who just got
// upgraded on their first post-encryption login. Blocks entry into the app
// until the user confirms they've written the key down.

function RecoveryKeyReveal({ recoveryKey, isNewAccount, onConfirm }) {
  const { theme } = useTheme();
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // LAN / non-secure origins block the clipboard API — surface a hint
      setCopied(false);
    }
  }

  return (
    <div style={s.overlay}>
      <style>{mobileCSS}</style>
      <div className="auth-card" style={{ ...s.card, flexDirection: 'column', gap: '24px', textAlign: 'left', maxWidth: '540px' }}>
        <div className="auth-brand-col" style={{ ...s.brandCol, alignSelf: 'center' }}>
          <video src="/Liminal_B_v003_animated_1.webm" autoPlay loop muted playsInline className="auth-brand-logo" style={{ ...s.brandLogo, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
          <img src="/liminal-wordmark.png" alt="Liminal." style={{ ...s.brandWordmark, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
        </div>

        <div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--strong)', marginBottom: '8px' }}>
            {isNewAccount ? 'Save your recovery key' : 'Your journal is now encrypted'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.6 }}>
            {isNewAccount
              ? 'This recovery key is the only way to get back into your account if you forget your password. Write it down somewhere safe — Liminal cannot show it to you again without your password.'
              : 'Your entries are now encrypted with your password. If you forget your password, this recovery key is the only way to get your journal back. Save it somewhere safe now.'}
          </div>
        </div>

        <div style={{
          padding: '18px',
          background: 'var(--panel-bg)',
          border: 'var(--border-style)',
          borderRadius: '10px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '15px',
          letterSpacing: '0.1em',
          color: 'var(--strong)',
          textAlign: 'center',
          userSelect: 'all',
        }}>
          {recoveryKey}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" style={{ ...s.btnSecondary, marginBottom: 0 }} onClick={copy}>
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--body)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: '14px', height: '14px', accentColor: 'var(--strong)', cursor: 'pointer' }}
          />
          I've saved this recovery key somewhere I trust.
        </label>

        <button
          type="button"
          style={{ ...s.btn, marginBottom: 0, opacity: confirmed ? 1 : 0.5 }}
          disabled={!confirmed}
          onClick={onConfirm}
        >
          Continue
        </button>

        <div style={{ ...s.hint, textAlign: 'left', marginTop: 0 }}>
          You can view or regenerate this key later from Settings, but only after entering your password.
        </div>
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────

function LoginForm({ onSuccess, onRegister, onForgot }) {
  const { t } = useLanguage();
  const { theme } = useTheme();
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
        // Legacy-user migrations return a recovery_key on their first
        // post-encryption login; finishAuth will route us through the
        // reveal screen instead of handing straight to the app.
        onSuccess(data.token, data.username, data.onboarding_complete, password, data.recovery_key || null, false);
      }
    } catch {
      setError(t('auth.errorBackend'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.overlay}>
      <style>{mobileCSS}</style>
      <form className="auth-card" style={s.card} onSubmit={handleSubmit}>
        <div className="auth-brand-col" style={s.brandCol}>
          <video src="/Liminal_B_v003_animated_1.webm" autoPlay loop muted playsInline className="auth-brand-logo" style={{ ...s.brandLogo, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
          <img src="/liminal-wordmark.png" alt="Liminal." style={{ ...s.brandWordmark, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
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

          <button
            type="button"
            onClick={onForgot}
            style={{
              display: 'block',
              margin: '14px auto 0',
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: 'var(--font)',
            }}
          >
            Forgot password?
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Recover (forgot password) ────────────────────────────────────────────────
// Unlock via the recovery key that was shown once at register time, then set
// a new password. The recovery key itself is unchanged — the user may still
// have the slip of paper they wrote it on.

function RecoverForm({ onSuccess, onBack, onWipe }) {
  const { theme } = useTheme();
  const [username, setUsername] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Username is required.'); return; }
    if (!recoveryKey.trim()) { setError('Recovery key is required.'); return; }
    if (newPassword.length < 4) { setError('Password must be at least 4 characters.'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          recovery_key: recoveryKey.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Recovery failed.');
      } else {
        // Straight into the app — recovery key is unchanged, no reveal needed.
        onSuccess(data.token, data.username, false, newPassword, null, false);
      }
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.overlay}>
      <style>{mobileCSS}</style>
      <form className="auth-card" style={s.card} onSubmit={handleSubmit}>
        <div className="auth-brand-col" style={s.brandCol}>
          <video src="/Liminal_B_v003_animated_1.webm" autoPlay loop muted playsInline className="auth-brand-logo" style={{ ...s.brandLogo, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
          <img src="/liminal-wordmark.png" alt="Liminal." style={{ ...s.brandWordmark, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
        </div>
        <div style={s.formCol}>
          <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.6, marginBottom: '20px' }}>
            Enter the recovery key you saved when you created your account, then choose a new password.
          </div>

          <label style={s.label} htmlFor="rec-username">Username</label>
          <input
            id="rec-username"
            style={s.input}
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label style={s.label} htmlFor="rec-key">Recovery key</label>
          <input
            id="rec-key"
            style={{ ...s.input, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.05em' }}
            type="text"
            autoComplete="off"
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
          />

          <label style={s.label} htmlFor="rec-newpass">New password</label>
          <input
            id="rec-newpass"
            style={s.input}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <label style={s.label} htmlFor="rec-confirm">Confirm new password</label>
          <input
            id="rec-confirm"
            style={{ ...s.input, marginBottom: error ? '0' : '20px' }}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && <div style={{ ...s.error, marginTop: '12px' }}>{error}</div>}

          <button style={{ ...s.btn, opacity: loading ? 0.5 : 1, marginTop: '8px' }} type="submit" disabled={loading}>
            {loading ? '…' : 'Recover account'}
          </button>

          <button type="button" style={s.btnSecondary} onClick={onBack}>
            ← Back to login
          </button>

          {onWipe && (
            <button
              type="button"
              onClick={onWipe}
              style={{
                display: 'block',
                margin: '14px auto 0',
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontFamily: 'var(--font)',
              }}
            >
              Don't want to recover — delete all data instead
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Wipe (recovery-key-authenticated account deletion) ──────────────────────
// Required by Apple 5.1.1(v) and Google account-deletion guidance: a user who
// forgot their password must still be able to delete their data. Recovery key
// is the second factor that proves it's their account.

function WipeForm({ onDone, onBack }) {
  const { theme } = useTheme();
  const [username, setUsername] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const CONFIRM_PHRASE = 'DELETE EVERYTHING';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Username is required.'); return; }
    if (!recoveryKey.trim()) { setError('Recovery key is required.'); return; }
    if (confirmText !== CONFIRM_PHRASE) {
      setError(`Type ${CONFIRM_PHRASE} to confirm. This cannot be undone.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/wipe-with-recovery-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), recovery_key: recoveryKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not delete account.');
      } else {
        setDone(true);
      }
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={s.overlay}>
        <style>{mobileCSS}</style>
        <div className="auth-card" style={{ ...s.card, flexDirection: 'column', gap: '20px', textAlign: 'center', maxWidth: '460px' }}>
          <div className="auth-brand-col" style={{ ...s.brandCol, alignSelf: 'center' }}>
            <video src="/Liminal_B_v003_animated_1.webm" autoPlay loop muted playsInline className="auth-brand-logo" style={{ ...s.brandLogo, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--strong)' }}>
            Account deleted
          </div>
          <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.6 }}>
            All journal data, threads, notes, and settings for this account have been removed from this device.
          </div>
          <button type="button" style={{ ...s.btn, marginBottom: 0 }} onClick={onDone}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.overlay}>
      <style>{mobileCSS}</style>
      <form className="auth-card" style={s.card} onSubmit={handleSubmit}>
        <div className="auth-brand-col" style={s.brandCol}>
          <video src="/Liminal_B_v003_animated_1.webm" autoPlay loop muted playsInline className="auth-brand-logo" style={{ ...s.brandLogo, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
          <img src="/liminal-wordmark.png" alt="Liminal." style={{ ...s.brandWordmark, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
        </div>
        <div style={s.formCol}>
          <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.6, marginBottom: '20px' }}>
            This will permanently delete every journal entry, note, thread, oracle session, memory, and setting for this account. The data is encrypted at rest and cannot be recovered after deletion. Use this only if you no longer want this account on this device.
          </div>

          <label style={s.label} htmlFor="wipe-username">Username</label>
          <input
            id="wipe-username"
            style={s.input}
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label style={s.label} htmlFor="wipe-key">Recovery key</label>
          <input
            id="wipe-key"
            style={{ ...s.input, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.05em' }}
            type="text"
            autoComplete="off"
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
          />

          <label style={s.label} htmlFor="wipe-confirm">Type {CONFIRM_PHRASE} to confirm</label>
          <input
            id="wipe-confirm"
            style={{ ...s.input, marginBottom: error ? '0' : '20px' }}
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />

          {error && <div style={{ ...s.error, marginTop: '12px' }}>{error}</div>}

          <button
            style={{ ...s.btn, opacity: loading ? 0.5 : 1, marginTop: '8px', background: 'var(--strong)' }}
            type="submit"
            disabled={loading}
          >
            {loading ? '…' : 'Delete account and all data'}
          </button>

          <button type="button" style={s.btnSecondary} onClick={onBack}>
            ← Back
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────

function RegisterForm({ onSuccess, onBack }) {
  const { t } = useLanguage();
  const { theme } = useTheme();
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
        // New accounts always get a recovery key; the parent component
        // shows the reveal screen before entering the app.
        onSuccess(data.token, data.username, data.onboarding_complete, password, data.recovery_key || null, true);
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
      <style>{mobileCSS}</style>
      <form className="auth-card" style={s.card} onSubmit={handleSubmit}>
        <div className="auth-brand-col" style={s.brandCol}>
          <video src="/Liminal_B_v003_animated_1.webm" autoPlay loop muted playsInline className="auth-brand-logo" style={{ ...s.brandLogo, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
          <img src="/liminal-wordmark.png" alt="Liminal." style={{ ...s.brandWordmark, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
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
