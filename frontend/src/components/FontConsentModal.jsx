// One-time consent modal shown the first time a user picks a font that would
// be fetched from fonts.googleapis.com. Required because that fetch sends the
// user's IP to Google's US servers (ePrivacy Art. 5(3) + post-Schrems II
// reading on Google Fonts). The choice is persisted via fontCatalog's
// setGoogleFontsConsent helper.

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
};

const cardStyle = {
  background: 'var(--white)',
  border: 'var(--border-style)',
  borderRadius: '14px',
  padding: '28px',
  maxWidth: '440px',
  width: '90vw',
  fontFamily: 'var(--font)',
  color: 'var(--body)',
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
  marginBottom: '20px',
};

const btnRow = {
  display: 'flex',
  gap: '10px',
  justifyContent: 'flex-end',
};

const btnSecondary = {
  padding: '10px 16px',
  fontSize: '13px',
  background: 'transparent',
  color: 'var(--muted)',
  border: 'var(--border-style)',
  borderRadius: '10px',
  cursor: 'pointer',
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

export default function FontConsentModal({ fontLabel, onGrant, onDeny }) {
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={cardStyle}>
        <div style={titleStyle}>Load this font from Google?</div>
        <div style={bodyStyle}>
          <strong>{fontLabel}</strong> is hosted by Google. Selecting it will fetch the font files from <code>fonts.googleapis.com</code> and <code>fonts.gstatic.com</code>, which sends your IP address to Google’s servers in the United States. Liminal does not control what Google logs about that request.
          <br /><br />
          Under Article 5(3) of the EU ePrivacy Directive, this fetch requires your explicit consent before it happens. The transfer to the United States relies on Google LLC’s self-certification under the EU-US Data Privacy Framework (and its UK and Swiss extensions); if that certification lapses, the transfer is no longer covered. Clicking <em>Allow and don’t ask again</em> gives that consent for this and future Google Fonts selections; you can withdraw it at any time from Settings → Appearance.
          <br /><br />
          The default heading font (Cormorant Garamond) and the default body font (Segoe UI) are bundled with Liminal and never contact Google.
        </div>
        <div style={btnRow}>
          <button type="button" style={btnSecondary} onClick={onDeny}>
            Cancel
          </button>
          <button type="button" style={btnPrimary} onClick={onGrant}>
            Allow and don’t ask again
          </button>
        </div>
      </div>
    </div>
  );
}
