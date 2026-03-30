import { useState, useRef, useEffect } from 'react';
import { useResizable } from '../hooks/useResizable';
import ResizeDivider from './ResizeDivider';
import { useLanguage, LANGUAGES } from '../i18n/LanguageContext';

const styles = {
  root: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: 'var(--white)',
  },
  // Left icon sidebar (48px)
  sidebar: {
    width: 'var(--sidebar-width)',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '12px',
    paddingBottom: '12px',
    borderRight: 'var(--border-style)',
    background: 'var(--near-white)',
    gap: '4px',
  },
  sidebarLogo: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: 'var(--strong)',
    padding: '8px 0',
    textTransform: 'uppercase',
    writingMode: 'vertical-rl',
    textOrientation: 'mixed',
    transform: 'rotate(180deg)',
  },
  sidebarSpacer: { flex: 1 },
  sidebarBtn: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    color: 'var(--muted)',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    fontSize: '16px',
    transition: 'color 0.15s, background 0.15s',
  },
  sidebarBtnActive: {
    color: 'var(--strong)',
    background: 'var(--panel-bg)',
  },
  // Entry list panel
  entryList: {
    width: 'var(--entrylist-width)',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--near-white)',
    transition: 'width 0.2s ease',
  },
  entryListCollapsed: {
    width: '0',
    overflow: 'hidden',
  },
  // Content area (canvas + mirror)
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minWidth: 0,
  },
  // Avatar
  avatar: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.15s',
    objectFit: 'cover',
    background: 'var(--panel-bg)',
  },
  avatarPlaceholder: {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.15s',
    background: 'var(--panel-bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--muted)',
    fontFamily: 'var(--font)',
  },
  // Popout menu
  popout: {
    position: 'absolute',
    bottom: '8px',
    left: '52px',
    minWidth: '160px',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '4px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    padding: '6px 0',
    zIndex: 100,
  },
  popoutItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 16px',
    fontSize: '12px',
    color: 'var(--body)',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background 0.1s',
  },
  popoutDivider: {
    borderTop: 'var(--border-style)',
    margin: '4px 0',
  },
};

export default function Layout({ children, activeView, onViewChange, onLogout, avatarUrl, username }) {
  const { t, lang, setLanguage } = useLanguage();
  const [entryListOpen, setEntryListOpen] = useState(true);
  const [entryListWidth, startEntryDrag] = useResizable(240, { min: 160, max: 480 });
  const [mirrorWidth, startMirrorDrag] = useResizable(
    Math.floor((window.innerWidth - 48 - 240) / 2),
    { min: 200, max: window.innerWidth - 48 - 240 - 200 },
  );
  const [popoutOpen, setPopoutOpen] = useState(false);
  const popoutRef = useRef(null);

  // Close popout on outside click
  useEffect(() => {
    if (!popoutOpen) return;
    function handleClick(e) {
      if (popoutRef.current && !popoutRef.current.contains(e.target)) {
        setPopoutOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoutOpen]);

  // children is expected to be: { entryList, canvas, mirror }
  const { entryList, canvas, mirror } = children;

  const initial = (username || '?')[0].toUpperCase();

  return (
    <div style={styles.root}>
      {/* Left icon sidebar */}
      <nav style={styles.sidebar}>
        <span style={styles.sidebarLogo}>Liminal</span>
        <div style={styles.sidebarSpacer} />

        <SidebarButton
          label={t('nav.home')}
          icon="◯"
          active={activeView === 'home'}
          onClick={() => onViewChange('home')}
        />
        <SidebarButton
          label={t('nav.journal')}
          icon="✦"
          active={activeView === 'journal'}
          onClick={() => onViewChange('journal')}
        />
        <SidebarButton
          label={t('nav.notes')}
          icon="◇"
          active={activeView === 'notes'}
          onClick={() => onViewChange('notes')}
        />
        <SidebarButton
          label={t('nav.oracle')}
          icon="✧"
          active={activeView === 'oracle'}
          onClick={() => onViewChange('oracle')}
        />
        <SidebarButton
          label={t('nav.portrait')}
          icon="◎"
          active={activeView === 'portrait'}
          onClick={() => onViewChange('portrait')}
        />
        <SidebarButton
          label={t('nav.context')}
          icon="◈"
          active={activeView === 'memory'}
          onClick={() => onViewChange('memory')}
        />
        <div style={styles.sidebarSpacer} />

        {/* User avatar + popout */}
        <div style={{ position: 'relative' }} ref={popoutRef}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username}
              style={{
                ...styles.avatar,
                borderColor: popoutOpen || activeView === 'settings' ? 'var(--strong)' : 'transparent',
              }}
              onClick={() => setPopoutOpen((v) => !v)}
            />
          ) : (
            <div
              style={{
                ...styles.avatarPlaceholder,
                borderColor: popoutOpen || activeView === 'settings' ? 'var(--strong)' : 'transparent',
              }}
              onClick={() => setPopoutOpen((v) => !v)}
              title={username}
            >
              {initial}
            </div>
          )}

          {popoutOpen && (
            <div style={styles.popout}>
              <button
                style={styles.popoutItem}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                onClick={() => { setPopoutOpen(false); onViewChange('settings'); }}
              >
                <GearIcon />
                {t('nav.settings')}
              </button>
              <div style={styles.popoutDivider} />
              <div style={{ padding: '6px 16px' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  {t('settings.language')}
                </div>
                <select
                  value={lang}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{
                    width: '100%',
                    fontSize: '12px',
                    padding: '4px 6px',
                    border: 'var(--border-style)',
                    borderRadius: '2px',
                    background: 'var(--white)',
                    fontFamily: 'var(--font)',
                    color: 'var(--body)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div style={styles.popoutDivider} />
              <button
                style={{ ...styles.popoutItem, color: 'var(--muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                onClick={() => { setPopoutOpen(false); onLogout(); }}
              >
                <LogoutIcon />
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Entry list — only visible on the Journal tab */}
      {activeView === 'journal' && (
        <>
          <div style={{
            ...styles.entryList,
            width: entryListOpen ? entryListWidth + 'px' : 0,
          }}>
            {entryList}
          </div>
          {entryListOpen && <ResizeDivider onMouseDown={startEntryDrag} />}
        </>
      )}

      {/* Main content: canvas + mirror */}
      <div style={styles.content}>
        {canvas({ toggleEntryList: () => setEntryListOpen((v) => !v), entryListOpen })}
        {activeView === 'journal' && <ResizeDivider onMouseDown={startMirrorDrag} inverted />}
        <div style={{
          width: activeView === 'journal' ? mirrorWidth + 'px' : 0,
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {mirror}
        </div>
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function SidebarButton({ label, icon, active, onClick }) {
  return (
    <button
      style={{
        ...styles.sidebarBtn,
        ...(active ? styles.sidebarBtnActive : {}),
      }}
      title={label}
      onClick={onClick}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
