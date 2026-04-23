import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle({ size = 'md', style = {} }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  const dims = size === 'sm'
    ? { w: 42, h: 22, knob: 16, pad: 3, icon: 10 }
    : { w: 52, h: 28, knob: 22, pad: 3, icon: 12 };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      style={{
        position: 'relative',
        width: dims.w,
        height: dims.h,
        borderRadius: dims.h / 2,
        background: isDark ? 'var(--strong)' : 'var(--panel-bg)',
        border: 'var(--border-style)',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        padding: 0,
        ...style,
      }}
    >
      {/* Sun icon (left) — inline SVG so Windows doesn't substitute the
          Segoe UI Emoji glyph (VS15 text-presentation selector is ignored
          by Chromium on Windows for U+2600). */}
      <span style={{
        position: 'absolute',
        left: dims.pad + (dims.knob - dims.icon) / 2,
        top: '50%',
        transform: 'translateY(-50%)',
        width: dims.icon,
        height: dims.icon,
        color: 'var(--muted)',
        opacity: isDark ? 0.4 : 1,
        transition: 'opacity 0.2s, color 0.2s',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width={dims.icon} height={dims.icon} viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2"  x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="2"  y1="12" x2="4"  y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.9"  y1="4.9"  x2="6.3"  y2="6.3" />
          <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
          <line x1="4.9"  y1="19.1" x2="6.3"  y2="17.7" />
          <line x1="17.7" y1="6.3"  x2="19.1" y2="4.9" />
        </svg>
      </span>
      {/* Moon icon (right) */}
      <span style={{
        position: 'absolute',
        right: dims.pad + (dims.knob - dims.icon) / 2,
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: dims.icon,
        lineHeight: 1,
        color: isDark ? 'var(--white)' : 'var(--muted)',
        opacity: isDark ? 1 : 0.4,
        transition: 'opacity 0.2s, color 0.2s',
        pointerEvents: 'none',
      }}>☾</span>
      {/* Knob */}
      <span style={{
        position: 'absolute',
        top: dims.pad,
        left: isDark ? dims.w - dims.knob - dims.pad : dims.pad,
        width: dims.knob,
        height: dims.knob,
        borderRadius: '50%',
        background: isDark ? 'var(--white)' : 'var(--white)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transition: 'left 0.2s ease',
      }} />
    </button>
  );
}
