import { useState, useRef, useEffect, useCallback } from 'react';
import { useResizable } from '../hooks/useResizable';
import ResizeDivider from './ResizeDivider';
import { useLanguage, LANGUAGES } from '../i18n/LanguageContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTheme } from '../hooks/useTheme';

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
    gap: '16px',
  },
  sidebarLogo: {
    padding: '8px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarLogoImg: {
    width: '46px',
    height: 'auto',
    opacity: 0.85,
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

const mobileStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    width: '100vw',
    overflow: 'hidden',
    background: 'var(--white)',
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  bottomBar: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: '50px',
    borderTop: 'var(--border-style)',
    background: 'var(--near-white)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    paddingLeft: '4px',
    paddingRight: '4px',
  },
  bottomBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1px',
    padding: '4px 0',
    border: 'none',
    background: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '9px',
    fontFamily: 'var(--font)',
    minWidth: '0',
    flex: 1,
  },
  bottomBtnActive: {
    color: 'var(--strong)',
  },
  moreMenu: {
    position: 'fixed',
    bottom: '62px',
    right: '8px',
    minWidth: '160px',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '10px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    padding: '6px 0',
    zIndex: 200,
  },
  moreMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 16px',
    fontSize: '13px',
    color: 'var(--body)',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
};

export default function Layout({ children, activeView, onViewChange, onLogout, onLock, avatarUrl, username }) {
  const { t, lang, setLanguage } = useLanguage();
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const [entryListOpen, setEntryListOpen] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => { setAvatarFailed(false); }, [avatarUrl]);
  const [entryListWidth, startEntryDrag] = useResizable(296, { min: 220, max: 480 });
  // Mirror split as percentage (0–100) of content area
  const [mirrorPct, setMirrorPct] = useState(50);
  const contentRef = useRef(null);
  const startMirrorDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPct = mirrorPct;
    const contentW = contentRef.current?.offsetWidth || 1;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(evt) {
      const delta = startX - evt.clientX;
      const deltaPct = (delta / contentW) * 100;
      setMirrorPct(Math.max(15, Math.min(75, startPct + deltaPct)));
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [mirrorPct]);
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

  // ── Mobile layout: bottom nav bar ───────────────────────────────────────
  if (isMobile) {
    const moreRef = useRef(null);
    const [moreOpen, setMoreOpen] = useState(false);

    // Close more menu on outside tap
    useEffect(() => {
      if (!moreOpen) return;
      function h(e) { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); }
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, [moreOpen]);

    const navItems = [
      { id: 'home',    label: t('nav.home'),    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 14 15 14 15 21"/></svg> },
      { id: 'journal', label: t('nav.journal'),  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4c2-1 4-1.5 6-1.5S12 3.5 12 4.5c0-1 3.5-2 6-1.5s4 .5 4 1.5v14c0-.5-2-1-4-1s-4.5.5-6 1.5c-1.5-1-3.5-1.5-6-1.5s-3.5.5-4 1V4z"/><line x1="12" y1="4.5" x2="12" y2="19.5"/></svg> },
      { id: 'notes',   label: t('nav.notes'),   icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="16 2 16 8 22 8"/><line x1="10" y1="13" x2="18" y2="13"/><line x1="10" y1="17" x2="15" y2="17"/></svg> },
      { id: 'oracle',  label: t('nav.oracle'),  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="13" height="7" rx="3"/><rect x="8" y="13.5" width="13" height="7" rx="3" fill="currentColor"/></svg> },
      { id: 'portrait', label: t('nav.portrait'), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg> },
    ];

    const moreItems = [
      { id: 'memory',   label: t('nav.context') },
      { id: 'settings', label: t('nav.settings') },
    ];

    const [journalView, setJournalView] = useState('editor'); // 'list' | 'editor' | 'mirror'
    useEffect(() => {
      if (activeView !== 'journal') setJournalView('editor');
    }, [activeView]);

    // Open the editor whenever a brand-new entry is created — otherwise the
    // "new entry" button on mobile would leave you stuck on the list view.
    useEffect(() => {
      function onCreated() { setJournalView('editor'); }
      window.addEventListener('liminal:entry-created', onCreated);
      return () => window.removeEventListener('liminal:entry-created', onCreated);
    }, []);

    const isJournal = activeView === 'journal';
    const headerBtn = {
      background: 'none', border: 'none', fontSize: '13px',
      color: 'var(--muted)', cursor: 'pointer',
      fontFamily: 'var(--font)', padding: '4px 0',
    };

    return (
      <div style={mobileStyles.root}>
        <div style={mobileStyles.content}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            {isJournal && journalView !== 'list' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--white)', borderBottom: 'var(--border-style)', flexShrink: 0 }}>
                {journalView === 'mirror' ? (
                  <button onClick={() => setJournalView('editor')} style={headerBtn}>
                    ‹ Journal Editor
                  </button>
                ) : (
                  <button onClick={() => setJournalView('list')} style={headerBtn}>
                    ‹ {t('nav.journal')}
                  </button>
                )}
                {journalView === 'editor' && (
                  <button onClick={() => setJournalView('mirror')} style={{ ...headerBtn, color: 'var(--strong)' }}>
                    {t('notes.mirror') || 'Mirror'} ›
                  </button>
                )}
              </div>
            )}
            {isJournal && journalView === 'list' && (
              <div
                style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}
                onClick={(e) => {
                  // Only switch to editor when tapping an actual entry item, not
                  // the new-entry button, search, tag pills, or delete "×".
                  if (e.target.closest('[data-entry-item="true"]')) {
                    setJournalView('editor');
                  }
                }}
              >
                {entryList}
              </div>
            )}
            {isJournal && journalView === 'mirror' && (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
                {mirror}
              </div>
            )}
            <div style={{ flex: 1, display: isJournal && journalView !== 'editor' ? 'none' : 'flex', overflow: 'hidden', minWidth: 0 }}>
              {canvas({ toggleEntryList: () => setJournalView('list'), entryListOpen: false })}
            </div>
          </div>
        </div>
        <nav style={mobileStyles.bottomBar}>
          {navItems.map((item) => (
            <button
              key={item.id}
              style={{ ...mobileStyles.bottomBtn, ...(activeView === item.id ? mobileStyles.bottomBtnActive : {}) }}
              onClick={() => { onViewChange(item.id); setMoreOpen(false); }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          <div ref={moreRef} style={{ position: 'relative', flex: 1, display: 'flex', justifyContent: 'center' }}>
            <button
              style={{ ...mobileStyles.bottomBtn, ...(moreItems.some(m => m.id === activeView) || moreOpen ? mobileStyles.bottomBtnActive : {}) }}
              onClick={() => setMoreOpen(v => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
              <span>More</span>
            </button>
            {moreOpen && (
              <div style={mobileStyles.moreMenu}>
                {moreItems.map((item) => (
                  <button
                    key={item.id}
                    style={{ ...mobileStyles.moreMenuItem, ...(activeView === item.id ? { color: 'var(--strong)', fontWeight: 600 } : {}) }}
                    onClick={() => { onViewChange(item.id); setMoreOpen(false); }}
                  >
                    {item.label}
                  </button>
                ))}
                <div style={{ borderTop: 'var(--border-style)', margin: '4px 0' }} />
                <button style={{ ...mobileStyles.moreMenuItem, color: 'var(--muted)' }} onClick={() => { setMoreOpen(false); onLock(); }}>
                  Lock
                </button>
                <button style={{ ...mobileStyles.moreMenuItem, color: 'var(--muted)' }} onClick={() => { setMoreOpen(false); onLogout(); }}>
                  {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    );
  }

  // ── Desktop layout ──────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* Left icon sidebar */}
      <nav style={styles.sidebar}>
        <div style={styles.sidebarSpacer} />
        <div style={{ ...styles.sidebarLogo, cursor: 'pointer' }} onClick={() => onViewChange('home')}><img src={theme === 'dark' ? '/Liminal_Logo_Inverted.png' : '/logo.png'} alt="Liminal" style={styles.sidebarLogoImg} onError={(e) => { if (e.currentTarget.src.endsWith('/Liminal_Logo_Inverted.png')) e.currentTarget.src = '/logo.png'; }} /></div>

        <SidebarButton
          label={t('nav.home')}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 14 15 14 15 21"/></svg>}
          active={activeView === 'home'}
          onClick={() => onViewChange('home')}
        />
        <SidebarButton
          label={t('nav.journal')}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4c2-1 4-1.5 6-1.5S12 3.5 12 4.5c0-1 3.5-2 6-1.5s4 .5 4 1.5v14c0-.5-2-1-4-1s-4.5.5-6 1.5c-1.5-1-3.5-1.5-6-1.5s-3.5.5-4 1V4z"/><line x1="12" y1="4.5" x2="12" y2="19.5"/><line x1="5" y1="8" x2="9.5" y2="8"/><line x1="5" y1="11" x2="9.5" y2="11"/><line x1="5" y1="14" x2="8.5" y2="14"/><text x="17" y="14" textAnchor="middle" fill="currentColor" stroke="none" fontSize="13" fontFamily="serif">✦</text></svg>}
          active={activeView === 'journal'}
          onClick={() => onViewChange('journal')}
        />
        <SidebarButton
          label={t('nav.notes')}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10z" fill="var(--white)"/><polyline points="12 4 12 10 16 10"/><path d="M16 2H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="var(--white)"/><polyline points="16 2 16 8 22 8"/><line x1="10" y1="13" x2="18" y2="13"/><line x1="10" y1="17" x2="15" y2="17"/></svg>}
          active={activeView === 'notes'}
          onClick={() => onViewChange('notes')}
        />
        <SidebarButton
          label={t('nav.oracle')}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="13" height="7" rx="3"/><rect x="8" y="13.5" width="13" height="7" rx="3" fill="currentColor"/></svg>}
          active={activeView === 'oracle'}
          onClick={() => onViewChange('oracle')}
        />
        <SidebarButton
          label={t('nav.portrait')}
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M19 9l1.2-3 1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2z" fill="currentColor" strokeWidth="0"/><circle cx="12" cy="11" r="6.5" fill="var(--white)"/><path d="M6.5 17.5h11" strokeWidth="2"/><path d="M7.5 19.5h9" strokeWidth="2"/><path d="M12.5 3.5l1.5-4 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5z" fill="currentColor" strokeWidth="0"/><path d="M6 1.5l1.2-3 1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2z" fill="currentColor" strokeWidth="0"/></svg>}
          active={activeView === 'portrait'}
          onClick={() => onViewChange('portrait')}
        />
        <SidebarButton
          label={t('nav.context')}
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2.5" fill="currentColor"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2.5" fill="currentColor"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2.5" fill="currentColor"/></svg>}
          active={activeView === 'memory'}
          onClick={() => onViewChange('memory')}
        />
        <div style={styles.sidebarSpacer} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        {/* Lock button */}
        <button
          onClick={onLock}
          title="Lock"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            marginBottom: '0',
            color: 'var(--muted)',
            fontSize: '16px',
            lineHeight: 1,
            transition: 'color 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>

        {/* Settings button */}
        <button
          onClick={() => onViewChange('settings')}
          title="Settings"
          style={{
            ...styles.sidebarBtn,
            ...(activeView === 'settings' ? styles.sidebarBtnActive : {}),
            marginBottom: '0',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--strong)'; }}
          onMouseLeave={(e) => { if (activeView !== 'settings') e.currentTarget.style.color = 'var(--muted)'; }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        {/* User avatar + popout */}
        <div style={{ position: 'relative' }} ref={popoutRef}>
          {avatarUrl && !avatarFailed ? (
            <img
              src={avatarUrl}
              alt={username}
              style={{
                ...styles.avatar,
                borderColor: popoutOpen || activeView === 'settings' ? 'var(--strong)' : 'transparent',
              }}
              onClick={() => setPopoutOpen((v) => !v)}
              onError={() => setAvatarFailed(true)}
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
              <button
                style={styles.popoutItem}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                onClick={() => { setPopoutOpen(false); onLock(); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Lock
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
      <div style={styles.content} ref={contentRef}>
        <div style={{
          width: activeView === 'journal' ? `${100 - mirrorPct}%` : '100%',
          minWidth: 0,
          display: 'flex',
          overflow: 'hidden',
        }}>
          {canvas({ toggleEntryList: () => setEntryListOpen((v) => !v), entryListOpen })}
        </div>
        {activeView === 'journal' && <ResizeDivider onMouseDown={(e) => startMirrorDrag(e)} inverted />}
        <div style={{
          width: activeView === 'journal' ? `${mirrorPct}%` : 0,
          minWidth: 0,
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
