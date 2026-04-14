import { useState } from 'react';

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    background: 'rgba(255,255,255,0.7)',
  },
  card: {
    width: '340px',
    maxWidth: '92vw',
    padding: '48px 40px',
    background: 'var(--white)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  lockIcon: {
    marginBottom: '20px',
    color: 'var(--muted)',
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--strong)',
    marginBottom: '6px',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginBottom: '28px',
  },
  input: {
    width: '100%',
    fontSize: '14px',
    padding: '10px 12px',
    border: 'var(--border-style)',
    borderRadius: '8px',
    outline: 'none',
    fontFamily: 'var(--font)',
    color: 'var(--strong)',
    background: 'var(--white)',
    boxSizing: 'border-box',
    textAlign: 'center',
    letterSpacing: '0.1em',
    marginBottom: '16px',
  },
  btn: {
    width: '100%',
    padding: '11px',
    fontSize: '13px',
    fontWeight: '600',
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    letterSpacing: '0.02em',
    fontFamily: 'var(--font)',
  },
  error: {
    fontSize: '12px',
    color: '#c0392b',
    marginBottom: '12px',
  },
};

export default function LockScreen({ username, onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        setPassword('');
        onUnlock();
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch {
      setError('Could not verify');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.overlay}>
      <form style={s.card} onSubmit={handleSubmit}>
        <div style={s.lockIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={s.title}>Locked</div>
        <div style={s.subtitle}>Session timed out — enter your password to continue</div>
        <input
          style={s.input}
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        {error && <div style={s.error}>{error}</div>}
        <button style={{ ...s.btn, opacity: loading ? 0.5 : 1 }} type="submit" disabled={loading}>
          {loading ? '...' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
