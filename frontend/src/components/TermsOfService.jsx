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
            <p style={{ ...s.paragraph, fontStyle: 'italic' }}>{t('terms.plainLanguageNote')}</p>
          </div>

          {/* Tool, not Publisher */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.toolStatusTitle')}</div>
            <p style={s.paragraph}>{t('terms.toolStatusBody')}</p>
          </div>

          {/* Provider AUP pass-through */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.providerTermsTitle')}</div>
            <p style={s.paragraph}>{t('terms.providerTermsBody')}</p>
          </div>

          {/* AI-Generated Content */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.aiContentTitle')}</div>
            <p style={s.paragraph}>{t('terms.aiContentBody1')}</p>
            <p style={s.paragraph}>{t('terms.aiContentBody2')}</p>
            <p style={s.paragraph}>{t('terms.aiContentBody3')}</p>
            <p style={s.paragraph}>{t('terms.aiContentBody4')}</p>
            <p style={s.paragraph}>{t('terms.aiContentBody5')}</p>
            <p style={s.paragraph}>{t('terms.aiContentBody6')}</p>
            <p style={s.paragraph}>{t('terms.aiContentBody7')}</p>
          </div>

          {/* EU AI Act Compliance */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.aiActTitle')}</div>
            <p style={s.paragraph}>{t('terms.aiActBody1')}</p>
            <p style={s.paragraph}>{t('terms.aiActBody2')}</p>
            <p style={s.paragraph}>{t('terms.aiActBody3')}</p>
          </div>

          {/* Anthropomorphism / Not a Companion */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.anthropomorphismTitle')}</div>
            <p style={s.paragraph}>{t('terms.anthropomorphismBody1')}</p>
            <p style={s.paragraph}>{t('terms.anthropomorphismBody2')}</p>
          </div>

          {/* Not a Medical Device */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.medicalDeviceTitle')}</div>
            <p style={s.paragraph}>{t('terms.medicalDeviceBody')}</p>
          </div>

          {/* Health Data, HIPAA, US State Health-Privacy Laws */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.healthDataTitle')}</div>
            <p style={s.paragraph}>{t('terms.healthDataBody')}</p>
          </div>

          {/* Not Professional Advice */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.notAdviceTitle')}</div>
            <p style={s.paragraph}>{t('terms.notAdviceBody')}</p>
          </div>

          {/* Crisis & Self-Harm */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.crisisTitle')}</div>
            <p style={s.paragraph}>{t('terms.crisisBody1')}</p>
            <p style={s.paragraph}>{t('terms.crisisBody2')}</p>
            <p style={{ ...s.paragraph, whiteSpace: 'pre-line', padding: '10px 14px', background: 'var(--panel-bg)', borderRadius: '4px', fontSize: '12px', lineHeight: '1.8' }}>
              {t('terms.crisisResources')}
            </p>
            <p style={s.paragraph}>{t('terms.crisisBody3')}</p>
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
            <p style={s.paragraph}>{t('terms.privacyBody4')}</p>
          </div>

          {/* Lawful Basis */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.lawfulBasisTitle')}</div>
            <p style={s.paragraph}>{t('terms.lawfulBasisBody')}</p>
          </div>

          {/* Roles Under GDPR: Controller / Processor / You */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.controllerProcessorTitle')}</div>
            <p style={s.paragraph}>{t('terms.controllerProcessorBody')}</p>
          </div>

          {/* EU / UK Controller, Representative, and Contact */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.euRepresentativeTitle')}</div>
            <p style={s.paragraph}>{t('terms.euRepresentativeBody')}</p>
          </div>

          {/* Data Retention */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.retentionTitle')}</div>
            <p style={s.paragraph}>{t('terms.retentionBody')}</p>
          </div>

          {/* Security Incident & Breach Notification */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.breachNotificationTitle')}</div>
            <p style={s.paragraph}>{t('terms.breachNotificationBody')}</p>
          </div>

          {/* Automated Decision-Making */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.automatedDecisionsTitle')}</div>
            <p style={s.paragraph}>{t('terms.automatedDecisionsBody')}</p>
          </div>

          {/* Data Protection Impact Assessment */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.dpiaTitle')}</div>
            <p style={s.paragraph}>{t('terms.dpiaBody')}</p>
          </div>

          {/* Australian Privacy Principles */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.australianPrivacyTitle')}</div>
            <p style={s.paragraph}>{t('terms.australianPrivacyBody')}</p>
          </div>

          {/* Local Browser-Style Storage */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.localStorageTitle')}</div>
            <p style={s.paragraph}>{t('terms.localStorageBody')}</p>
          </div>

          {/* California Privacy Rights (CCPA / CPRA) */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.ccpaTitle')}</div>
            <p style={s.paragraph}>{t('terms.ccpaBody1')}</p>
            <p style={s.paragraph}>{t('terms.ccpaBody2')}</p>
          </div>

          {/* Other US State Privacy Rights */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.multiStateTitle')}</div>
            <p style={s.paragraph}>{t('terms.multiStateBody')}</p>
          </div>

          {/* Limit Use of My Sensitive Personal Information */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.spiLimitTitle')}</div>
            <p style={s.paragraph}>{t('terms.spiLimitBody')}</p>
          </div>

          {/* Your Data Rights */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.privacyRightsTitle')}</div>
            <p style={s.paragraph}>{t('terms.privacyRightsBody')}</p>
            <p style={s.paragraph}>{t('terms.privacyRightsBody2')}</p>
          </div>

          {/* Encryption at Rest */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.encryptionTitle')}</div>
            <p style={s.paragraph}>{t('terms.encryptionBody1')}</p>
            <p style={s.paragraph}>{t('terms.encryptionBody2')}</p>
          </div>

          {/* Backups */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.backupsTitle')}</div>
            <p style={s.paragraph}>{t('terms.backupsBody1')}</p>
            <p style={s.paragraph}>{t('terms.backupsBody2')}</p>
            <p style={s.paragraph}>{t('terms.backupsBody3')}</p>
            <p style={{ ...s.paragraph, fontWeight: '600' }}>{t('terms.backupsBody4')}</p>
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

          {/* Australian Consumer Law */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.aclTitle')}</div>
            <p style={s.paragraph}>{t('terms.aclBody')}</p>
          </div>

          {/* Refunds & Withdrawal */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.refundsTitle')}</div>
            <p style={s.paragraph}>{t('terms.refundsBody')}</p>
          </div>

          {/* Limitation of Liability */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.liabilityTitle')}</div>
            <p style={s.paragraph}>{t('terms.liabilityBody1')}</p>
            <p style={s.paragraph}>{t('terms.liabilityBody2')}</p>
          </div>

          {/* Eligibility & Children's Privacy */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.eligibilityTitle')}</div>
            <p style={s.paragraph}>{t('terms.eligibilityBody1')}</p>
            <p style={s.paragraph}>{t('terms.eligibilityBody2')}</p>
            <p style={s.paragraph}>{t('terms.eligibilityBody3')}</p>
          </div>

          {/* Third-Party Services & Subprocessors */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.thirdPartyTitle')}</div>
            <p style={s.paragraph}>{t('terms.thirdPartyBody')}</p>
            <p style={{ ...s.paragraph, whiteSpace: 'pre-line' }}>{t('terms.thirdPartyList')}</p>
          </div>

          {/* Your Uploads & Licence */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.userUploadsTitle')}</div>
            <p style={s.paragraph}>{t('terms.userUploadsBody1')}</p>
            <p style={s.paragraph}>{t('terms.userUploadsBody2')}</p>
            <p style={s.paragraph}>{t('terms.userUploadsBody3')}</p>
          </div>

          {/* Copyright, Likeness & Publicity */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.likenessTitle')}</div>
            <p style={s.paragraph}>{t('terms.likenessBody1')}</p>
            <p style={s.paragraph}>{t('terms.likenessBody2')}</p>
          </div>

          {/* Prohibited Uses */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.prohibitedUsesTitle')}</div>
            <p style={s.paragraph}>{t('terms.prohibitedUsesBody1')}</p>
            <p style={{ ...s.paragraph, whiteSpace: 'pre-line' }}>{t('terms.prohibitedUsesBody2')}</p>
            <p style={s.paragraph}>{t('terms.prohibitedUsesBody3')}</p>
          </div>

          {/* Voice Cloning Disclaimer */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.voiceCloneDisclaimerTitle')}</div>
            <p style={s.paragraph}>{t('terms.voiceCloneDisclaimerBody1')}</p>
            <p style={s.paragraph}>{t('terms.voiceCloneDisclaimerBody2')}</p>
            <p style={s.paragraph}>{t('terms.voiceCloneDisclaimerBody3')}</p>
          </div>

          {/* Third-Party Attributions */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.attributionTitle')}</div>
            <p style={s.paragraph}>{t('terms.attributionBody1')}</p>
            <p style={s.paragraph}>
              <a href={t('terms.attributionBody2')} target="_blank" rel="noopener noreferrer"
                 style={{ color: 'var(--body)', textDecoration: 'underline', wordBreak: 'break-all' }}>
                {t('terms.attributionBody2')}
              </a>
            </p>
            <p style={s.paragraph}>{t('terms.attributionBody3')}</p>
          </div>

          {/* Refusal & Termination */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.refuseServiceTitle')}</div>
            <p style={s.paragraph}>{t('terms.refuseServiceBody')}</p>
          </div>

          {/* Reporting Abuse */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.reportAbuseTitle')}</div>
            <p style={s.paragraph}>{t('terms.reportAbuseBody')}</p>
          </div>

          {/* Indemnification */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.indemnificationTitle')}</div>
            <p style={s.paragraph}>{t('terms.indemnificationBody')}</p>
          </div>

          {/* Dispute Resolution */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.disputeTitle')}</div>
            <p style={s.paragraph}>{t('terms.disputeBody1')}</p>
            <p style={s.paragraph}>{t('terms.disputeBody2')}</p>
            <p style={s.paragraph}>{t('terms.disputeBody3')}</p>
          </div>

          {/* Content Ownership */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.contentOwnershipTitle')}</div>
            <p style={s.paragraph}>{t('terms.contentOwnershipBody')}</p>
          </div>

          {/* Severability */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.severabilityTitle')}</div>
            <p style={s.paragraph}>{t('terms.severabilityBody')}</p>
          </div>

          {/* Governing Law & Jurisdiction */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.governingLawTitle')}</div>
            <p style={s.paragraph}>{t('terms.governingLawBody1')}</p>
            <p style={s.paragraph}>{t('terms.governingLawBody2')}</p>
            <p style={s.paragraph}>{t('terms.governingLawBody3')}</p>
          </div>

          {/* Changes to Terms */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.changesTitle')}</div>
            <p style={s.paragraph}>{t('terms.changesBody')}</p>
          </div>

          {/* Open-Source Notices */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.openSourceNoticesTitle')}</div>
            <p style={s.paragraph}>{t('terms.openSourceNoticesBody')}</p>
          </div>

          {/* Entire Agreement */}
          <div style={s.section}>
            <div style={s.sectionTitle}>{t('terms.entireAgreementTitle')}</div>
            <p style={s.paragraph}>{t('terms.entireAgreementBody')}</p>
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
