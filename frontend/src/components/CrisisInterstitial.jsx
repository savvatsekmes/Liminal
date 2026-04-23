// Modal shown when the crisis gate detects a first-person crisis statement.
// Surfaces help-line numbers (AU / US / UK) with tel: links, then asks the
// user to acknowledge the message before "Continue anyway" unlocks. ESC
// routes to the helpline open (not silent dismissal). Helpline button is
// the focused/default action.

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2100,
};

const cardStyle = {
  background: 'var(--white)',
  border: 'var(--border-style)',
  borderRadius: '14px',
  padding: '28px',
  maxWidth: '480px',
  width: '92vw',
  fontFamily: 'var(--font)',
  color: 'var(--body)',
  maxHeight: '90vh',
  overflowY: 'auto',
};

const titleStyle = {
  fontSize: '17px',
  fontWeight: 700,
  color: 'var(--strong)',
  marginBottom: '12px',
};

const bodyStyle = {
  fontSize: '13px',
  lineHeight: 1.6,
  marginBottom: '18px',
};

const listStyle = {
  fontSize: '13px',
  lineHeight: 1.7,
  marginBottom: '20px',
  paddingLeft: '18px',
};

const linkStyle = {
  color: 'var(--strong)',
  textDecoration: 'underline',
};

const ackRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  fontSize: '12px',
  lineHeight: 1.5,
  color: 'var(--muted)',
  marginBottom: '14px',
};

const btnRow = {
  display: 'flex',
  gap: '10px',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
};

const btnSecondaryBase = {
  padding: '10px 16px',
  fontSize: '13px',
  background: 'transparent',
  border: 'var(--border-style)',
  borderRadius: '10px',
  fontFamily: 'var(--font)',
};

const btnPrimary = {
  padding: '10px 16px',
  fontSize: '13px',
  background: 'var(--strong)',
  color: 'var(--white)',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'var(--font)',
};

const COOLDOWN_MS = 3000;

export default function CrisisInterstitial({ onContinue, onOpenHelpline }) {
  const { t } = useLanguage();
  const helplineRef = useRef(null);
  const [acked, setAcked] = useState(false);
  const [ackedAt, setAckedAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    helplineRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!acked) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [acked]);

  function openDirectory() {
    try {
      window.open('https://findahelpline.com', '_blank', 'noopener,noreferrer');
    } catch { /* */ }
    onOpenHelpline?.();
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        openDirectory();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cooldownRemaining = acked ? Math.max(0, COOLDOWN_MS - (now - ackedAt)) : COOLDOWN_MS;
  const continueDisabled = !acked || cooldownRemaining > 0;
  const continueLabel = !acked
    ? t('crisis.continueAnyway')
    : cooldownRemaining > 0
      ? `${t('crisis.continueAnyway')} (${Math.ceil(cooldownRemaining / 1000)})`
      : t('crisis.continueAnyway');

  const btnSecondary = {
    ...btnSecondaryBase,
    color: continueDisabled ? 'var(--border)' : 'var(--muted)',
    cursor: continueDisabled ? 'not-allowed' : 'pointer',
    opacity: continueDisabled ? 0.5 : 1,
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="crisis-modal-title">
      <div style={cardStyle}>
        <div id="crisis-modal-title" style={titleStyle}>
          {t('crisis.modalTitle')}
        </div>
        <div style={bodyStyle}>{t('crisis.modalBody')}</div>
        <ul style={listStyle}>
          <li>
            <strong>Australia</strong> — Lifeline <a href="tel:131114" style={linkStyle}>13 11 14</a>
            {' · '}Emergency <a href="tel:000" style={linkStyle}>000</a>
          </li>
          <li>
            <strong>United States</strong> — <a href="tel:988" style={linkStyle}>988</a> Suicide &amp; Crisis Lifeline
          </li>
          <li>
            <strong>United Kingdom</strong> — Samaritans <a href="tel:116123" style={linkStyle}>116 123</a>
            {' · '}NHS <a href="tel:111" style={linkStyle}>111</a>
          </li>
          <li>
            <strong>{t('crisis.elsewhereLabel')}</strong> —{' '}
            <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>findahelpline.com</a>
          </li>
        </ul>

        <label style={ackRowStyle}>
          <input
            type="checkbox"
            checked={acked}
            onChange={(e) => {
              setAcked(e.target.checked);
              if (e.target.checked) setAckedAt(Date.now());
            }}
          />
          <span>{t('crisis.acknowledgement')}</span>
        </label>

        <div style={btnRow}>
          <button
            type="button"
            style={btnSecondary}
            onClick={continueDisabled ? undefined : onContinue}
            disabled={continueDisabled}
            aria-disabled={continueDisabled}
          >
            {continueLabel}
          </button>
          <button type="button" style={btnPrimary} onClick={openDirectory} ref={helplineRef}>
            {t('crisis.openHelpline')}
          </button>
        </div>
      </div>
    </div>
  );
}
