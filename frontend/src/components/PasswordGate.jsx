import { useState } from 'react';
import { setStoredToken } from '../utils/api';

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
    width: '360px',
    padding: '52px 44px',
    border: 'var(--border-style)',
    borderRadius: '2px',
    background: 'var(--white)',
  },
  logo: {
    fontSize: '28px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: 'var(--strong)',
    marginBottom: '6px',
  },
  tagline: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginBottom: '40px',
    fontStyle: 'italic',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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

  function handleAuthSuccess(token, username) {
    setStoredToken(token);
    onSuccess(username);
  }

  if (view === 'register') {
    return <RegisterForm onSuccess={handleAuthSuccess} onBack={() => setView('login')} />;
  }

  return <LoginForm onSuccess={handleAuthSuccess} onRegister={() => setView('register')} />;
}

// ── Login ─────────────────────────────────────────────────────────────────────

function LoginForm({ onSuccess, onRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Enter your username.'); return; }
    if (!password) { setError('Enter your password.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed.');
        setPassword('');
      } else {
        onSuccess(data.token, data.username);
      }
    } catch {
      setError('Could not reach the backend. Make sure Liminal is running.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.overlay}>
      <form style={s.card} onSubmit={handleSubmit}>
        <div style={s.logo}>Liminal</div>
        <div style={s.tagline}>A journal for the in-between.</div>

        <label style={s.label} htmlFor="login-username">Username</label>
        <input
          id="login-username"
          style={s.input}
          type="text"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Your username"
        />

        <label style={s.label} htmlFor="login-password">Password</label>
        <input
          id="login-password"
          style={{ ...s.input, marginBottom: error ? '0' : '20px' }}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
        />

        {error && <div style={{ ...s.error, marginTop: '12px' }}>{error}</div>}

        <button style={{ ...s.btn, opacity: loading ? 0.5 : 1, marginTop: '8px' }} type="submit" disabled={loading}>
          {loading ? '…' : 'Open journal →'}
        </button>

        <button type="button" style={s.btnSecondary} onClick={onRegister}>
          Start Journal
        </button>
      </form>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────

function RegisterForm({ onSuccess, onBack }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Choose a username.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed.');
      } else {
        // Create first journal entry for the new user
        const today = new Date().toISOString().split('T')[0];
        await fetch('/api/entries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.token}`,
          },
          body: JSON.stringify({ title: 'First entry', body: '', body_text: '', date: today }),
        });
        onSuccess(data.token, data.username);
      }
    } catch {
      setError('Could not reach the backend. Make sure Liminal is running.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.overlay}>
      <form style={s.card} onSubmit={handleSubmit}>
        <div style={s.logo}>Liminal</div>
        <div style={s.tagline}>A journal for the in-between.</div>

        <label style={s.label} htmlFor="reg-username">Choose a username</label>
        <input
          id="reg-username"
          style={s.input}
          type="text"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
        />

        <div style={s.divider} />

        <label style={s.label} htmlFor="reg-password">Create a password</label>
        <input
          id="reg-password"
          style={s.input}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 4 characters"
        />

        <label style={s.label} htmlFor="reg-confirm">Confirm password</label>
        <input
          id="reg-confirm"
          style={{ ...s.input, marginBottom: error ? '0' : '0' }}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
        />

        {error && <div style={{ ...s.error, marginTop: '16px' }}>{error}</div>}

        <button
          style={{ ...s.btn, marginTop: '20px', opacity: loading ? 0.5 : 1 }}
          type="submit"
          disabled={loading}
        >
          {loading ? 'Creating…' : 'Create Account →'}
        </button>

        <button type="button" style={s.btnSecondary} onClick={onBack}>
          ← Back
        </button>

        <div style={s.hint}>
          Your journal lives entirely on this machine.<br />
          Nothing is sent to the cloud without your API keys.
        </div>
      </form>
    </div>
  );
}
