import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';

// Top-right pill that surfaces when GitHub has a newer release than the
// installed version. Click → starts downloading the new stub installer
// directly (falls back to the release page if the API didn't return an
// installer asset, e.g. for non-Windows or in-development builds). The ×
// dismisses the pill for that specific version (persisted in localStorage)
// so a future v1.5.0 still notifies even if v1.4.0 was dismissed.
//
// Backed by /api/version/check (GitHub API + 6h server-side cache).
export default function UpdateBanner() {
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/version/check')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.hasUpdate || !data?.latest || !data?.releaseUrl) return;
        const key = `liminal:dismissedUpdate:${data.latest}`;
        if (localStorage.getItem(key) === '1') return;
        setInfo(data);
      })
      .catch(() => { /* offline / API down — silently skip */ });
    return () => { cancelled = true; };
  }, []);

  if (!info || dismissed) return null;

  const handleClick = () => {
    window.open(info.installerUrl || info.releaseUrl, '_blank', 'noopener');
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    try { localStorage.setItem(`liminal:dismissedUpdate:${info.latest}`, '1'); } catch {}
    setDismissed(true);
  };

  return (
    <div
      onClick={handleClick}
      title={`v${info.latest} is available — click to download`}
      style={{
        position: 'fixed',
        top: '12px',
        right: '14px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px 6px 14px',
        background: 'var(--strong)',
        color: 'var(--white)',
        borderRadius: '20px',
        fontSize: '11px',
        fontFamily: 'var(--font)',
        fontWeight: 500,
        letterSpacing: '0.02em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <span>Update available: v{info.latest} →</span>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss update notification"
        title="Dismiss"
        style={{
          background: 'rgba(255,255,255,0.15)',
          color: 'var(--white)',
          border: 'none',
          borderRadius: '50%',
          width: '18px',
          height: '18px',
          fontSize: '11px',
          lineHeight: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          fontFamily: 'var(--font)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
      >
        ×
      </button>
    </div>
  );
}
