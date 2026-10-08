import { useLayoutEffect, useRef, useState } from 'react';

// Top of a page's list column: the page's hand-drawn icon with the page title
// under it, in the same type as the "Liminal." wordmark under Home's logo. Icons live in /public/page-icons (black ink on
// transparent; the .page-icon rule turns them white in dark mode).
//
// Every page's icon and title — and Home's logo and "Liminal." wordmark — sit
// in the same place, so switching pages nothing jumps:
//   vertically: one title baseline, 153px from the top of the window (55px top
//     spacing in list columns; 15px on top of Oracle/Context's 40px page
//     padding; Home's 26px top padding). Measured in the app.
//   horizontally: centred at x=176px — the icon and title live in a 220px box
//     (the Journal list column's width) at the left edge of the column; on
//     Oracle/Context the box steps back over the page's 48px left padding.
// Change these together. On phones (≤768px) the box is simply centred.
export const PAGE_ICON_WIDTH = 92;
// Every icon fits the same box (the journal book's proportions), so the
// title sits at the same height on every page; taller icons draw narrower.
export const PAGE_ICON_HEIGHT = 63;
const HERO_BOX_WIDTH = 220;
const PAGE_LEFT_PADDING = 48; // Oracle/Context desktop padding the box steps back over

const s = {
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '55px 0 14px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  box: {
    width: `${HERO_BOX_WIDTH}px`,
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: '0 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
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
    // The font's heaviest weight (Cormorant Garamond is 400–700) — a touch
    // heavier than the "Liminal." wordmark (~660 by ink coverage), by choice.
    fontWeight: 700,
    color: 'var(--strong)',
    lineHeight: 1,
  },
  // Full-width pages (Oracle, Context): no divider of its own; the box steps
  // back over the page's left padding so it lines up with the list pages.
  heroPage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginTop: '15px',
    marginBottom: '6px',
    marginLeft: `-${PAGE_LEFT_PADDING}px`,
  },
  subtitle: {
    marginTop: '-4px',
    fontSize: '11px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    textAlign: 'center',
  },
};

// Titles are set in the same type size as Home's "Liminal." wordmark: the
// size at which "Liminal." in Cormorant is as wide as the wordmark's lettering
// (90px image, ~89px of it text). Measured, since it depends on the font.
const WORDMARK_TEXT = 'Liminal.';
const WORDMARK_TEXT_WIDTH = 89;
// The baseline stays where it was measured to line up with the wordmark
// (153px from the top) by aligning the title to an invisible strut of this
// size, so the title's own size doesn't move it.
const BASELINE_STRUT_SIZE = 31.6;

function FittedTitle({ text, sizeAs = WORDMARK_TEXT, width = WORDMARK_TEXT_WIDTH, style }) {
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
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'baseline' }}>
      <span aria-hidden="true" style={{ ...style, fontSize: `${BASELINE_STRUT_SIZE}px`, width: 0 }}>{'​'}</span>
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

// `page`: on a full-width page (Oracle, Context) rather than at the top of a
// list column. `iconScale`: draw an icon that reads small in the shared box
// (tall or round shapes) a little bigger. It grows upward and outward from
// its bottom edge, so the title and its baseline don't move.
export default function PageHero({ icon, title, subtitle, page = false, iconScale = 1, ...rest }) {
  const iconStyle = iconScale === 1 ? s.icon : { ...s.icon, transform: `scale(${iconScale})`, transformOrigin: 'center bottom' };
  return (
    <div className={page ? 'page-hero page-hero--page' : 'page-hero'} style={page ? s.heroPage : s.hero} {...rest}>
      <div style={s.box}>
        <img src={icon} alt="" aria-hidden="true" className="page-icon" draggable={false} style={iconStyle} />
        {/* Titles end in a full stop, like the "Liminal." wordmark. */}
        <FittedTitle text={/[.!?。．]$/.test(title) ? title : `${title}.`} style={s.title} />
        {subtitle && <div style={s.subtitle}>{subtitle}</div>}
      </div>
    </div>
  );
}
