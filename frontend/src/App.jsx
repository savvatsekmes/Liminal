import { useState, useEffect, useRef, useCallback } from 'react';
import Layout from './components/Layout';
import LockScreen from './components/LockScreen';
import EntryList from './components/EntryList';
import WritingCanvas from './components/WritingCanvas';
import MirrorPanel from './components/MirrorPanel';
import PasswordGate from './components/PasswordGate';
import Onboarding from './components/Onboarding';
import SelectionMenu from './components/SelectionMenu';
import HomePage from './pages/HomePage';
import PortraitPage from './pages/PortraitPage';
import NotesPage from './pages/NotesPage';
import OraclePage from './pages/OraclePage';
import MemoryPage from './pages/MemoryPage';
import SettingsPage from './pages/SettingsPage';
import { useEntries } from './hooks/useEntries';
import { useReflect } from './hooks/useReflect';
import { isAuthenticated, getStoredUsername, clearStoredToken, apiFetch } from './utils/api';
import { LanguageProvider } from './i18n/LanguageContext';

// ── Authenticated shell ───────────────────────────────────────────────────────
// Mounted only after auth is confirmed — ensures hooks fetch with valid token.

const LOCK_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function AuthenticatedApp({ username, onLogout, isFirstSession, avatarUrl, onAvatarChange }) {
  const [activeView, setActiveView] = useState(() => {
    const saved = sessionStorage.getItem('liminal_view');
    if (saved && ['home','journal','notes','oracle','portrait','memory','settings'].includes(saved)) return saved;
    return isFirstSession ? 'journal' : 'home';
  });
  const handleViewChange = useCallback((view) => {
    setActiveView(view);
    sessionStorage.setItem('liminal_view', view);
  }, []);
  const [locked, setLocked] = useState(false);
  const lockTimerRef = useRef(null);

  const resetLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => setLocked(true), LOCK_TIMEOUT);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    const handler = () => { if (!locked) resetLockTimer(); };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetLockTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, [locked, resetLockTimer]);
  const [previewVersion, setPreviewVersion] = useState(null);
  const [pendingNoteId, setPendingNoteId] = useState(null);
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const [pendingPortraitTab, setPendingPortraitTab] = useState(null);

  const {
    entries,
    activeEntry,
    createEntry,
    updateEntry,
    deleteEntry,
    selectEntry,
    refreshEntries,
    allTags,
  } = useEntries();

  const {
    blocks,
    opening,
    loading: reflectLoading,
    error: reflectError,
    ttsOnline,
    reflect,
    regenerateBlock,
    loadReflections,
    updateBlock,
    patchBlock,
    deleteBlock,
    addBlock,
  } = useReflect();

  // Create first entry for brand new users after onboarding
  useEffect(() => {
    if (isFirstSession && entries.length === 0) {
      createEntry();
    }
  }, [isFirstSession]);

  // Load reflections whenever the active entry changes (covers initial load and entry switches)
  useEffect(() => {
    if (activeEntry?.id) {
      loadReflections(activeEntry.id);
    }
  }, [activeEntry?.id]);

  async function handleUpdate(fields, id) {
    const targetId = id ?? activeEntry?.id;
    if (!targetId) return;
    await updateEntry(targetId, fields);
  }

  async function handleNew() {
    await createEntry();
  }

  async function handleSelect(entry) {
    await selectEntry(entry);
  }

  async function handleDeleteTag(tag) {
    // Remove tag from all entries that have it
    const tagged = entries.filter(e => (e.tags || []).includes(tag));
    for (const entry of tagged) {
      await updateEntry(entry.id, { tags: (entry.tags || []).filter(t => t !== tag) });
    }
  }

  async function handleReflect(archetype) {
    if (!activeEntry) return;
    await reflect(activeEntry, archetype);
  }

  return (
    <>
    {locked && <LockScreen username={username} onUnlock={() => { setLocked(false); resetLockTimer(); }} />}
    <Layout activeView={activeView} onViewChange={handleViewChange} onLogout={onLogout} onLock={() => setLocked(true)} avatarUrl={avatarUrl} username={username}>
      {{
        entryList: (
          <EntryList
            entries={entries}
            activeId={activeEntry?.id}
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={deleteEntry}
            allTags={allTags}
            onDeleteTag={handleDeleteTag}
          />
        ),

        canvas: ({ toggleEntryList, entryListOpen }) => {
          if (activeView === 'home') return (
            <HomePage
              username={username}
              avatarUrl={avatarUrl}
              onNavigateToEntry={(id) => { selectEntry({ id }); handleViewChange('journal'); }}
              onNavigateToNote={(id) => { setPendingNoteId(id); handleViewChange('notes'); }}
              onNavigateToOracle={(id) => { setPendingSessionId(id); handleViewChange('oracle'); }}
              onNavigateToSky={() => { setPendingPortraitTab('sky'); handleViewChange('portrait'); }}
              onNavigateToCards={() => { setPendingPortraitTab('cards'); handleViewChange('portrait'); }}
              onNavigateToPortrait={() => { setPendingPortraitTab('portrait'); handleViewChange('portrait'); }}
              onNewEntry={() => { createEntry(); handleViewChange('journal'); }}
              onNewNote={() => handleViewChange('notes')}
              onNewConversation={() => handleViewChange('oracle')}
            />
          );
          if (activeView === 'oracle') return <OraclePage initialSessionId={pendingSessionId} onSessionSelected={() => setPendingSessionId(null)} />;
          if (activeView === 'notes') return <NotesPage initialNoteId={pendingNoteId} onNoteSelected={() => setPendingNoteId(null)} />;
          if (activeView === 'portrait') return <PortraitPage onNavigateEntry={(id) => { selectEntry({ id }); handleViewChange('journal'); }} initialTab={pendingPortraitTab} onTabLoaded={() => setPendingPortraitTab(null)} />;
          if (activeView === 'memory') return <MemoryPage />;
          if (activeView === 'settings') return <SettingsPage username={username} onLogout={onLogout} avatarUrl={avatarUrl} onAvatarChange={onAvatarChange} onNavigate={handleViewChange} />;

          return (
            <WritingCanvas
              entry={activeEntry}
              onUpdate={handleUpdate}
              onNew={handleNew}
              toggleEntryList={toggleEntryList}
              entryListOpen={entryListOpen}
              onVersionPreview={setPreviewVersion}
              previewVersionId={previewVersion?.id}
              isFirstSession={isFirstSession}
              allTags={allTags}
            />
          );
        },

        mirror: activeView === 'journal' ? (
          <MirrorPanel
            blocks={blocks}
            opening={opening}
            loading={reflectLoading}
            error={reflectError}
            entryText={activeEntry?.body_text || ''}
            entryId={activeEntry?.id}
            ttsOnline={ttsOnline}
            onReflect={handleReflect}
            onRegenerateBlock={regenerateBlock}
            onUpdateBlock={updateBlock}
            onPatchBlock={patchBlock}
            onDeleteBlock={deleteBlock}
            onAddBlock={addBlock}
            previewVersion={previewVersion}
            onClearPreview={() => setPreviewVersion(null)}
          />
        ) : (
          <div style={{ display: 'none' }} />
        ),
      }}
    </Layout>
    <SelectionMenu />
    </>
  );
}

// ── Root app ──────────────────────────────────────────────────────────────────

export default function App() {
  // null = checking | 'gate' = show login | 'onboarding' = first-time setup | 'ok' = authenticated
  const [authStatus, setAuthStatus] = useState(null);
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [isFirstSession, setIsFirstSession] = useState(false);
  const [language, setLanguage] = useState('en');

  useEffect(() => {
    // Check for valid stored JWT first
    if (isAuthenticated()) {
      // Verify onboarding status with the server
      apiFetch('/api/auth/me')
        .then((r) => r.json())
        .then((data) => {
          setUsername(data.username || getStoredUsername() || '');
          // Optimistically construct the avatar URL even if /me reports null —
          // the img onError fallback in Layout/HomePage handles a 404 cleanly.
          if (data.avatar_url) setAvatarUrl(data.avatar_url);
          else if (data.user_id) setAvatarUrl(`/api/auth/avatar/${data.user_id}?t=${Date.now()}`);
          // Fetch language setting
          apiFetch('/api/settings').then(r => r.json()).then(s => {
            if (s.language) setLanguage(s.language);
          }).catch(() => {});
          if (data.onboarding_complete) {
            setAuthStatus('ok');
          } else {
            setIsFirstSession(true);
            setAuthStatus('onboarding');
          }
        })
        .catch(() => {
          clearStoredToken();
          setAuthStatus('gate');
        });
      return;
    }

    // No token — show login gate
    setAuthStatus('gate');
  }, []);

  function handleAuthSuccess(u, onboardingComplete) {
    setUsername(u);
    // After fresh login, fetch /me to pick up avatar_url and user_id —
    // otherwise the avatar stays null until the user re-uploads or restarts.
    apiFetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.avatar_url) setAvatarUrl(data.avatar_url);
        else if (data.user_id) setAvatarUrl(`/api/auth/avatar/${data.user_id}?t=${Date.now()}`);
      })
      .catch(() => {});
    // Same problem for language — fetch saved value so the UI restores it
    // after a fresh password-gate login (not just on auto-resume).
    apiFetch('/api/settings')
      .then((r) => r.json())
      .then((s) => { if (s.language) setLanguage(s.language); })
      .catch(() => {});
    if (onboardingComplete) {
      setAuthStatus('ok');
    } else {
      setIsFirstSession(true);
      setAuthStatus('onboarding');
    }
  }

  function handleOnboardingComplete() {
    setAuthStatus('ok');
  }

  function handleLogout() {
    clearStoredToken();
    setAuthStatus('gate');
    setUsername('');
    setIsFirstSession(false);
  }

  if (authStatus === null) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--muted)',
        fontSize: '13px',
        fontFamily: 'var(--font)',
      }}>
        …
      </div>
    );
  }

  return (
    <LanguageProvider initialLang={language}>
      {authStatus === 'gate' && <PasswordGate onSuccess={handleAuthSuccess} />}
      {authStatus === 'onboarding' && <Onboarding username={username} onComplete={handleOnboardingComplete} />}
      {authStatus === 'ok' && <AuthenticatedApp username={username} onLogout={handleLogout} isFirstSession={isFirstSession} avatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} />}
    </LanguageProvider>
  );
}
