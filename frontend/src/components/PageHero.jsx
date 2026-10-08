import { useLayoutEffect, useRef, useState } from 'react';

// Top of a page's list column: the page's hand-drawn icon with the page title
// under it, the title sized to exactly the icon's width — like the "Liminal."
// wordmark under the logo. Icons live in /public/page-icons (black ink on
// transparent; the .page-icon rule turns them white in dark mode).
//
// Every page title — and Home's "Liminal." wordmark — sits on one baseline,
// 153px from the top of the window, so switching pages the title doesn't
// jump. The top spacing below (55px in list columns; 15px on top of the 40px
// page padding of Oracle/Context) and Home's 26px top padding produce that;
// measured in the app, so change them together.
export const PAGE_ICON_WIDTH = 92;
// Every icon fits the same box (the journal book's proportions), so the
// title sits at the same height on every page; taller icons draw narrower.
export const PAGE_ICON_HEIGHT = 63;

const s = {
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '55px 12px 14px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  icon: {
    display: 'block',
    width: `${PAGE_ICON_WIDTH}px`,
    height: `${PAGE_ICON_HEIGHT}px`,
    objectFit: 'contain',
    userSelect: 'none',
  },
  title: {
    fontFamily: 'var(--font-display)',
    // Matches the "Liminal." wordmark: its ink coverage sits between
    // Cormorant Garamond 650 and 700 (variable font, so any weight works).
    fontWeight: 660,
    color: 'var(--strong)',
    lineHeight: 1,
  },
  // Full-width pages (Oracle, Context): icon stacked over the title, both
  // left-aligned with the page content, no box of its own.
  heroLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '10px',
    marginTop: '15px',
    marginBottom: '6px',
  },
  subtitle: {
    marginTop: '-4px',
    fontSize: '11px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    textAlign: 'center',
  },
};

// Measured rather than a fixed size, so it fits the icon in every language
// (and when a list shows a tag name instead of the page name). `sizeAs` is the
// text that gets fitted — the title itself by default; other pages pass the
// Journal title so every page title is the same size as Journal's.
function FittedTitle({ text, sizeAs = text, width, style }) {
  const measureRef = useRef(null); // hidden copy of `sizeAs` at a 100px reference size
  const [fontSize, setFontSize] = useState(32);
  useLayoutEffect(() => {
    let cancelled = false;
    const fit = () => {
      const natural = measureRef.current?.scrollWidth;
      if (!cancelled && natural > 0) setFontSize(Math.max(18, Math.min(44, (100 * width) / natural)));
    };
    fit();
    // Cormorant Garamond may still be loading; re-fit once it's in.
    document.fonts?.ready?.then(fit);
    return () => { cancelled = true; };
  }, [sizeAs, width]);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ ...style, fontSize: `${fontSize}px`, whiteSpace: 'nowrap', display: 'inline-block' }}>{text}</span>
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{ ...style, fontSize: '100px', whiteSpace: 'nowrap', position: 'absolute', left: 0, top: 0, visibility: 'hidden', pointerEvents: 'none' }}
      >
        {sizeAs}
      </span>
    </span>
  );
}

export default function PageHero({ icon, title, sizeAs, subtitle, align = 'center', ...rest }) {
  const left = align === 'left';
  return (
    <div style={left ? s.heroLeft : s.hero} {...rest}>
      <img
        src={icon} alt="" aria-hidden="true" className="page-icon" draggable={false}
        style={left ? { ...s.icon, objectPosition: 'left center' } : s.icon}
      />
      <FittedTitle text={title} sizeAs={sizeAs} width={PAGE_ICON_WIDTH} style={s.title} />
      {subtitle && <div style={s.subtitle}>{subtitle}</div>}
    </div>
  );
}
