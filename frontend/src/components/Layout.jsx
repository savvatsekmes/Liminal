import { useState } from 'react';
import { useResizable } from '../hooks/useResizable';
import ResizeDivider from './ResizeDivider';

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
};

export default function Layout({ children, activeView, onViewChange }) {
  const [entryListOpen, setEntryListOpen] = useState(true);
  const [entryListWidth, startEntryDrag] = useResizable(240, { min: 160, max: 480 });
  const [mirrorWidth, startMirrorDrag] = useResizable(
    Math.floor((window.innerWidth - 48 - 240) / 2),
    { min: 200, max: window.innerWidth - 48 - 240 - 200 },
  );

  // children is expected to be: { entryList, canvas, mirror }
  const { entryList, canvas, mirror } = children;

  return (
    <div style={styles.root}>
      {/* Left icon sidebar */}
      <nav style={styles.sidebar}>
        <span style={styles.sidebarLogo}>Liminal</span>
        <div style={styles.sidebarSpacer} />

        <SidebarButton
          label="Home"
          icon="◯"
          active={activeView === 'home'}
          onClick={() => onViewChange('home')}
        />
        <SidebarButton
          label="Journal"
          icon="✦"
          active={activeView === 'journal'}
          onClick={() => onViewChange('journal')}
        />
        <SidebarButton
          label="Notes"
          icon="◇"
          active={activeView === 'notes'}
          onClick={() => onViewChange('notes')}
        />
        <SidebarButton
          label="Oracle"
          icon="✧"
          active={activeView === 'oracle'}
          onClick={() => onViewChange('oracle')}
        />
        <SidebarButton
          label="Portrait"
          icon="◎"
          active={activeView === 'portrait'}
          onClick={() => onViewChange('portrait')}
        />
        <div style={styles.sidebarSpacer} />

        <SidebarButton
          label="Settings"
          icon="⊙"
          active={activeView === 'settings'}
          onClick={() => onViewChange('settings')}
        />
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
