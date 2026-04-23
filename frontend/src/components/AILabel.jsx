// Persistent in-UI label shown above every oracle session. Required because
// the broader product framing — "Oracle", "A mirror for [your] life",
// archetype names — is poetic and could read as a companion. EU AI Act
// Art. 50(1) needs the user to be informed they are interacting with an AI
// system. The Terms cover this in writing; this label is the load-bearing
// in-UI half. Now also carries the "not a crisis line" reminder inline so
// both messages land in the same eyeful.

import { useLanguage } from '../i18n/LanguageContext';

const rowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: '12px',
  rowGap: '2px',
  padding: '6px 14px 6px',
  fontSize: '11px',
  color: 'var(--muted)',
  fontFamily: 'var(--font)',
  fontStyle: 'italic',
  letterSpacing: '0.02em',
  flexShrink: 0,
  userSelect: 'none',
  borderBottom: 'var(--border-style)',
};

const compactStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '2px 0 6px',
  fontSize: '10px',
  color: 'var(--muted)',
  fontFamily: 'var(--font)',
  fontStyle: 'italic',
  letterSpacing: '0.02em',
  userSelect: 'none',
  opacity: 0.85,
};

const dotStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const sepStyle = {
  opacity: 0.4,
};

export default function AILabel({ compact = false }) {
  const { t } = useLanguage();
  if (compact) {
    return (
      <div role="note" aria-label="AI disclosure" style={compactStyle}>
        <span aria-hidden="true">●</span>
        <span>{t('ai.sessionLabel')}</span>
      </div>
    );
  }
  return (
    <div role="note" aria-label="AI disclosure" style={rowStyle}>
      <span style={dotStyle}>
        <span aria-hidden="true">●</span>
        <span>{t('ai.sessionLabel')}</span>
      </span>
      <span aria-hidden="true" style={sepStyle}>·</span>
      <span>{t('crisis.notACrisisLine')}</span>
    </div>
  );
}
