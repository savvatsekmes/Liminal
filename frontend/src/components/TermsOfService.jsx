import { useLanguage } from '../i18n/LanguageContext';

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--white)',
    zIndex: 1001,
  },
  card: {
    width: '560px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 48px',
  },
  header: {
    paddingTop: '40px',
    paddingBottom: '20px',
    flexShrink: 0,
  },
  title: {
    fontSize: '24px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: 'var(--strong)',
    marginBottom: '6px',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--muted)',
    fontStyle: 'italic',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    paddingRight: '8px',
  },
  section: {
    marginBottom: '28px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--strong)',
    marginBottom: '10px',
    paddingBottom: '6px',
    borderBottom: 'var(--border-style)',
  },
  paragraph: {
    fontSize: '12px',
    color: 'var(--body)',
    lineHeight: '1.8',
    marginBottom: '10px',
  },
  footer: {
    paddingTop: '20px',
    paddingBottom: '40px',
    flexShrink: 0,
  },
  backBtn: {
    width: '100%',
    padding: '10px',
    fontSize: '13px',
    fontWeight: '500',
    background: 'none',
    color: 'var(--muted)',
    border: 'var(--border-style)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'color 0.15s, border-color 0.15s',
  },
};

export default function TermsOfService({ onBack }) {
  const { t } = useLanguage();

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.title}>{t('terms.title')}</div>
          <div style={s.subtitle}>{t('terms.lastUpdated')}</div>
        </div>

        <div style={s.body}>
          {/* Acceptance */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.acceptanceTitle')}</div>
            <p style={s.paragraph}>{t('terms.acceptanceBody')}</p>
          </div>

          {/* AI-Generated Content */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.aiContentTitle')}</div>
            <p style={s.paragraph}>{t('terms.aiContentBody1')}</p>
            <p style={s.paragraph}>{t('terms.aiContentBody2')}</p>
            <p style={s.paragraph}>{t('terms.aiContentBody3')}</p>
          </div>

          {/* Not Professional Advice */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.notAdviceTitle')}</div>
            <p style={s.paragraph}>{t('terms.notAdviceBody')}</p>
          </div>

          {/* Tarot & Oracle */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.tarotTitle')}</div>
            <p style={s.paragraph}>{t('terms.tarotBody1')}</p>
            <p style={s.paragraph}>{t('terms.tarotBody2')}</p>
          </div>

          {/* Privacy & Data */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.privacyTitle')}</div>
            <p style={s.paragraph}>{t('terms.privacyBody1')}</p>
            <p style={s.paragraph}>{t('terms.privacyBody2')}</p>
            <p style={s.paragraph}>{t('terms.privacyBody3')}</p>
          </div>

          {/* Backups & Encryption */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.backupsTitle')}</div>
            <p style={s.paragraph}>{t('terms.backupsBody1')}</p>
            <p style={s.paragraph}>{t('terms.backupsBody2')}</p>
            <p style={s.paragraph}>{t('terms.backupsBody3')}</p>
          </div>

          {/* User Responsibility */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.responsibilityTitle')}</div>
            <p style={s.paragraph}>{t('terms.responsibilityBody')}</p>
          </div>

          {/* No Warranty */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.warrantyTitle')}</div>
            <p style={s.paragraph}>{t('terms.warrantyBody')}</p>
          </div>

          {/* Limitation of Liability */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.liabilityTitle')}</div>
            <p style={s.paragraph}>{t('terms.liabilityBody')}</p>
          </div>

          {/* Changes to Terms */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.changesTitle')}</div>
            <p style={s.paragraph}>{t('terms.changesBody')}</p>
          </div>
        </div>

        <div style={s.footer}>
          <button
            style={s.backBtn}
            onClick={onBack}
            onMouseEnter={e => { e.target.style.color = 'var(--strong)'; e.target.style.borderColor = 'var(--strong)'; }}
            onMouseLeave={e => { e.target.style.color = 'var(--muted)'; e.target.style.borderColor = 'var(--border)'; }}
          >
            {t('terms.back')}
          </button>
        </div>
      </div>
    </div>
  );
}
