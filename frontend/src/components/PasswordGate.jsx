import { useState, useEffect, useRef, useCallback } from 'react';
import { setStoredToken } from '../utils/api';
import { useLanguage, LANGUAGES } from '../i18n/LanguageContext';
import TermsOfService from './TermsOfService';
import { useTheme } from '../hooks/useTheme';

// Format remaining seconds as "47m" / "2h 15m" / "23s" / "1d 4h" — used by
// the lockout banner and submit-button label. Server returns seconds as an
// integer; we format on the client so the countdown ticks smoothly.
function formatLockoutRemaining(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  const s = Math.ceil(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
}

// Polls /api/auth/lockout/:username every 5s normally and every 1s while
// locked, so the countdown ticks visibly. Returns the state plus a refetch
// function the form can call right after a failed attempt to update the UI
// without waiting for the next poll tick. Callers pass a trimmed username;
// when the username is empty we skip polling and return a safe default.
function useLockoutState(username) {
  const trimmed = (username || '').trim();
  const [state, setState] = useState({
    locked: false,
    secondsRemaining: 0,
    failedAttempts: 0,
    attemptsBeforeLockout: 5,
    consecutiveLockouts: 0,
  });

  const refetch = useCallback(async () => {
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/auth/lockout/${encodeURIComponent(trimmed)}`);
      if (!res.ok) return;
      const data = await res.json();
      setState({
        locked: !!data.locked,
        secondsRemaining: data.seconds_remaining || 0,
        failedAttempts: data.failed_attempts || 0,
        attemptsBeforeLockout: data.attempts_before_lockout ?? 5,
        consecutiveLockouts: data.consecutive_lockouts || 0,
      });
    } catch {
      // Network errors are non-fatal — leave state as-is so the UI doesn't
      // flicker between "locked" and "unlocked" if a poll request flakes.
    }
  }, [trimmed]);

  useEffect(() => {
    if (!trimmed) {
      setState({ locked: false, secondsRemaining: 0, failedAttempts: 0, attemptsBeforeLockout: 5, consecutiveLockouts: 0 });
      return;
    }
    refetch();
    const interval = state.locked ? 1000 : 5000;
    const handle = setInterval(refetch, interval);
    return () => clearInterval(handle);
  }, [trimmed, state.locked, refetch]);

  // Local countdown — drop one second per second between server polls so the
  // banner doesn't appear frozen between 1s ticks while locked.
  useEffect(() => {
    if (!state.locked) return;
    const handle = setInterval(() => {
      setState((prev) => {
        if (!prev.locked) return prev;
        const next = Math.max(0, prev.secondsRemaining - 1);
        // When the local countdown reaches zero, optimistically flip to
        // unlocked — the next poll (within 5s) will confirm.
        if (next === 0) return { ...prev, secondsRemaining: 0, locked: false };
        return { ...prev, secondsRemaining: next };
      });
    }, 1000);
    return () => clearInterval(handle);
  }, [state.locked]);

  return { ...state, refetch };
}

// Inline language picker rendered inside each auth card so the user can
// switch language before signing in — so onboarding lands translated.
function AuthLanguagePicker() {
  const { lang, setLanguage } = useLanguage();
  return (
    <select
      value={lang}
      onChange={(e) => setLanguage(e.target.value)}
      style={{
        ...s.btnSecondary,
        marginTop: '14px',
        textAlign: 'center',
        textAlignLast: 'center',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
      }}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}

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
  const { t } = useLanguage();
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
            {isNewAccount ? t('recoveryKey.titleNew') : t('recoveryKey.titleLegacy')}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--body)', lineHeight: 1.6 }}>
            {isNewAccount ? t('recoveryKey.bodyNew') : t('recoveryKey.bodyLegacy')}
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
            {copied ? t('recoveryKey.copied') : t('recoveryKey.copy')}
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--body)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: '14px', height: '14px', accentColor: 'var(--strong)', cursor: 'pointer' }}
          />
          {t('recoveryKey.confirmCheckbox')}
        </label>

        <button
          type="button"
          style={{ ...s.btn, marginBottom: 0, opacity: confirmed ? 1 : 0.5 }}
          disabled={!confirmed}
          onClick={onConfirm}
        >
          {t('common.continue')}
        </button>

        <div style={{ ...s.hint, textAlign: 'left', marginTop: 0 }}>
          {t('recoveryKey.hint')}
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
  const lockoutState = useLockoutState(username);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError(t('auth.errorUsername')); return; }
    if (!password) { setError(t('auth.errorPassword')); return; }
    // Frontend gate — backend re-checks; this just avoids a wasted round-trip.
    if (lockoutState.locked) return;

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
        // Refetch so the "X attempts left" hint and the locked banner update
        // immediately after a failed attempt instead of on the next poll tick.
        lockoutState.refetch();
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
          {/* Username stays editable even when this account is locked, so the
              user can switch to a different account. The lockout hook
              refetches whenever the username field changes — typing a name
              that isn't locked re-enables the form automatically. */}
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
            style={{ ...s.input, marginBottom: error ? '0' : '20px', opacity: lockoutState.locked ? 0.5 : 1 }}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.placeholderPassword')}
            disabled={lockoutState.locked}
          />

          {/* "X attempts left" hint when failed_attempts is 1..4. Hidden at
              0 (clean state) and replaced by the lockout note below at 5+. */}
          {!lockoutState.locked && lockoutState.failedAttempts > 0 && lockoutState.attemptsBeforeLockout > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
              {lockoutState.attemptsBeforeLockout} {lockoutState.attemptsBeforeLockout === 1 ? 'attempt' : 'attempts'} left before lockout
            </div>
          )}

          {/* Locked-out note — replaces the inline error / hint when locked.
              The disabled submit-button label shows the countdown; this just
              adds the "X consecutive lockouts" detail when relevant. */}
          {lockoutState.locked && lockoutState.consecutiveLockouts > 1 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
              {lockoutState.consecutiveLockouts} consecutive lockouts — each escalates the cooldown.
            </div>
          )}

          {error && !lockoutState.locked && <div style={{ ...s.error, marginTop: '12px' }}>{error}</div>}

          <button
            style={{ ...s.btn, opacity: (loading || lockoutState.locked) ? 0.5 : 1, marginTop: '8px', cursor: lockoutState.locked ? 'not-allowed' : 'pointer' }}
            type="submit"
            disabled={loading || lockoutState.locked}
          >
            {lockoutState.locked
              ? `Locked — ${formatLockoutRemaining(lockoutState.secondsRemaining)} left`
              : (loading ? '…' : t('auth.login'))}
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
          <AuthLanguagePicker />
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
  // Same per-user lockout counter as login. Five wrong recovery keys triggers
  // the same cooldown — this is intentional so an attacker can't bypass the
  // login lockout by switching to recovery.
  const lockoutState = useLockoutState(username);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Username is required.'); return; }
    if (!recoveryKey.trim()) { setError('Recovery key is required.'); return; }
    if (newPassword.length < 4) { setError('Password must be at least 4 characters.'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return; }
    if (lockoutState.locked) return;

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
        lockoutState.refetch();
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
          {/* Stays editable — see LoginForm comment. */}
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
            style={{ ...s.input, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.05em', opacity: lockoutState.locked ? 0.5 : 1 }}
            type="text"
            autoComplete="off"
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
            disabled={lockoutState.locked}
          />

          <label style={s.label} htmlFor="rec-newpass">New password</label>
          <input
            id="rec-newpass"
            style={{ ...s.input, opacity: lockoutState.locked ? 0.5 : 1 }}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={lockoutState.locked}
          />

          <label style={s.label} htmlFor="rec-confirm">Confirm new password</label>
          <input
            id="rec-confirm"
            style={{ ...s.input, marginBottom: error ? '0' : '20px', opacity: lockoutState.locked ? 0.5 : 1 }}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={lockoutState.locked}
          />

          {!lockoutState.locked && lockoutState.failedAttempts > 0 && lockoutState.attemptsBeforeLockout > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
              {lockoutState.attemptsBeforeLockout} {lockoutState.attemptsBeforeLockout === 1 ? 'attempt' : 'attempts'} left before lockout
            </div>
          )}

          {lockoutState.locked && lockoutState.consecutiveLockouts > 1 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
              {lockoutState.consecutiveLockouts} consecutive lockouts — each escalates the cooldown.
            </div>
          )}

          {error && !lockoutState.locked && <div style={{ ...s.error, marginTop: '12px' }}>{error}</div>}

          <button
            style={{ ...s.btn, opacity: (loading || lockoutState.locked) ? 0.5 : 1, marginTop: '8px', cursor: lockoutState.locked ? 'not-allowed' : 'pointer' }}
            type="submit"
            disabled={loading || lockoutState.locked}
          >
            {lockoutState.locked
              ? `Locked — ${formatLockoutRemaining(lockoutState.secondsRemaining)} left`
              : (loading ? '…' : 'Recover account')}
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
          <AuthLanguagePicker />
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
  // Same lockout counter as login + recover. Stops an attacker from skipping
  // the password lockout by bouncing to wipe-with-recovery-key to grind
  // through recovery keys.
  const lockoutState = useLockoutState(username);

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
    if (lockoutState.locked) return;

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
        lockoutState.refetch();
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
          {/* Stays editable — see LoginForm comment. */}
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
            style={{ ...s.input, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.05em', opacity: lockoutState.locked ? 0.5 : 1 }}
            type="text"
            autoComplete="off"
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
            disabled={lockoutState.locked}
          />

          <label style={s.label} htmlFor="wipe-confirm">Type {CONFIRM_PHRASE} to confirm</label>
          <input
            id="wipe-confirm"
            style={{ ...s.input, marginBottom: error ? '0' : '20px', opacity: lockoutState.locked ? 0.5 : 1 }}
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={lockoutState.locked}
          />

          {!lockoutState.locked && lockoutState.failedAttempts > 0 && lockoutState.attemptsBeforeLockout > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
              {lockoutState.attemptsBeforeLockout} {lockoutState.attemptsBeforeLockout === 1 ? 'attempt' : 'attempts'} left before lockout
            </div>
          )}

          {lockoutState.locked && lockoutState.consecutiveLockouts > 1 && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
              {lockoutState.consecutiveLockouts} consecutive lockouts — each escalates the cooldown.
            </div>
          )}

          {error && !lockoutState.locked && <div style={{ ...s.error, marginTop: '12px' }}>{error}</div>}

          <button
            style={{ ...s.btn, opacity: (loading || lockoutState.locked) ? 0.5 : 1, marginTop: '8px', background: 'var(--strong)', cursor: lockoutState.locked ? 'not-allowed' : 'pointer' }}
            type="submit"
            disabled={loading || lockoutState.locked}
          >
            {lockoutState.locked
              ? `Locked — ${formatLockoutRemaining(lockoutState.secondsRemaining)} left`
              : (loading ? '…' : 'Delete account and all data')}
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

// Hard requirements for new account passwords. Existing accounts created
// before this gate are grandfathered — login still accepts whatever they
// originally chose. Threshold is 8 chars + at least one upper / number /
// symbol; the strength meter on top of that is just visual feedback so users
// aim higher than the floor.
function passwordChecks(pw) {
  return {
    hasMinLength: pw.length >= 8,
    hasUpper: /[A-Z]/.test(pw),
    hasNumber: /\d/.test(pw),
    hasSymbol: /[^A-Za-z0-9]/.test(pw),
  };
}

function passwordStrength(pw) {
  if (!pw) return { level: 0, label: '', color: 'transparent' };
  let score = 0;
  // Length carries most of the signal — composition rules are easy to
  // game (Password1!) so we weight length more heavily than each class.
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw))           score++;
  if (/[a-z]/.test(pw))           score++;
  if (/\d/.test(pw))              score++;
  if (/[^A-Za-z0-9]/.test(pw))    score++;
  if (score <= 2) return { level: 1, label: 'Very weak', color: '#c42d2d' };
  if (score === 3) return { level: 2, label: 'Weak',     color: '#d97a2c' };
  if (score === 4) return { level: 3, label: 'Fair',     color: '#d4b020' };
  if (score === 5) return { level: 4, label: 'Good',     color: '#5fa860' };
  return                  { level: 5, label: 'Strong',    color: '#2d8a36' };
}

function PasswordStrengthBar({ password }) {
  if (!password) return null;
  const { level, label, color } = passwordStrength(password);
  return (
    <div style={{ marginTop: '-10px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '5px', flex: 1 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              background: i <= level ? color : 'var(--border)',
              transition: 'background 0.2s ease',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '11px', color: 'var(--muted)', minWidth: '60px', textAlign: 'right' }}>
        {label}
      </span>
    </div>
  );
}

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
    const checks = passwordChecks(password);
    if (!checks.hasMinLength) { setError('Password must be at least 8 characters.'); return; }
    if (!checks.hasUpper)     { setError('Password must include at least one uppercase letter.'); return; }
    if (!checks.hasNumber)    { setError('Password must include at least one number.'); return; }
    if (!checks.hasSymbol)    { setError('Password must include at least one symbol (e.g. !@#$%).'); return; }
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

          <PasswordStrengthBar password={password} />

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
          <AuthLanguagePicker />
        </div>
      </form>
    </div>
  );
}
