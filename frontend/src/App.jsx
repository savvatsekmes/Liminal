import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import EntryList from './components/EntryList';
import WritingCanvas from './components/WritingCanvas';
import MirrorPanel from './components/MirrorPanel';
import PasswordGate from './components/PasswordGate';
import Onboarding from './components/Onboarding';
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

function AuthenticatedApp({ username, onLogout, isFirstSession, avatarUrl, onAvatarChange }) {
  const [activeView, setActiveView] = useState(isFirstSession ? 'journal' : 'home');
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

  async function handleReflect() {
    if (!activeEntry) return;
    await reflect(activeEntry);
  }

  return (
    <Layout activeView={activeView} onViewChange={setActiveView} onLogout={onLogout} avatarUrl={avatarUrl} username={username}>
      {{
        entryList: (
          <EntryList
            entries={entries}
            activeId={activeEntry?.id}
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={deleteEntry}
          />
        ),

        canvas: ({ toggleEntryList, entryListOpen }) => {
          if (activeView === 'home') return (
            <HomePage
              username={username}
              avatarUrl={avatarUrl}
              onNavigateToEntry={(id) => { selectEntry({ id }); setActiveView('journal'); }}
              onNavigateToNote={(id) => { setPendingNoteId(id); setActiveView('notes'); }}
              onNavigateToOracle={(id) => { setPendingSessionId(id); setActiveView('oracle'); }}
              onNavigateToSky={() => { setPendingPortraitTab('sky'); setActiveView('portrait'); }}
            />
          );
          if (activeView === 'oracle') return <OraclePage initialSessionId={pendingSessionId} onSessionSelected={() => setPendingSessionId(null)} />;
          if (activeView === 'notes') return <NotesPage initialNoteId={pendingNoteId} onNoteSelected={() => setPendingNoteId(null)} />;
          if (activeView === 'portrait') return <PortraitPage onNavigateEntry={(id) => { selectEntry({ id }); setActiveView('journal'); }} initialTab={pendingPortraitTab} onTabLoaded={() => setPendingPortraitTab(null)} />;
          if (activeView === 'memory') return <MemoryPage />;
          if (activeView === 'settings') return <SettingsPage username={username} onLogout={onLogout} avatarUrl={avatarUrl} onAvatarChange={onAvatarChange} />;

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
            ttsOnline={ttsOnline}
            onReflect={handleReflect}
            onRegenerateBlock={regenerateBlock}
            previewVersion={previewVersion}
            onClearPreview={() => setPreviewVersion(null)}
          />
        ) : (
          <div style={{ display: 'none' }} />
        ),
      }}
    </Layout>
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
          if (data.avatar_url) setAvatarUrl(data.avatar_url);
          // Fetch language setting
          apiFetch('/api/settings').then(r => r.json()).then(s => {
            if (s.language && s.language !== 'en') setLanguage(s.language);
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
