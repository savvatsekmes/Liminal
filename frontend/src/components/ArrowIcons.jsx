// Small line arrows drawn as SVG. The ↗ and ↩ characters render as blue
// boxed emoji on Windows, so links and chips use these instead.

const base = {
  display: 'inline-block',
  verticalAlign: '-1px',
  flexShrink: 0,
  color: 'var(--strong)',
};

/** ↗ — opens something (an external link, an entry). */
export function ArrowUpRight({ size = 10, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ ...base, ...style }}>
      <path d="M3 1.5h5.5V7" />
      <path d="M8.5 1.5 1.5 8.5" />
    </svg>
  );
}

/** ↩ — goes back to a source. */
export function ArrowReturn({ size = 11, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ ...base, ...style }}>
      <path d="M4 1.5 1.5 4 4 6.5" />
      <path d="M1.5 4h5.5a2.75 2.75 0 0 1 0 5.5H5" />
    </svg>
  );
}
