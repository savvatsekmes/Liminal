import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import EntryList from './components/EntryList';
import WritingCanvas from './components/WritingCanvas';
import MirrorPanel from './components/MirrorPanel';
import PasswordGate from './components/PasswordGate';
import HomePage from './pages/HomePage';
import PortraitPage from './pages/PortraitPage';
import NotesPage from './pages/NotesPage';
import OraclePage from './pages/OraclePage';
import SettingsPage from './pages/SettingsPage';
import { useEntries } from './hooks/useEntries';
import { useReflect } from './hooks/useReflect';
import { isAuthenticated, getStoredUsername, clearStoredToken } from './utils/api';

// ── Authenticated shell ───────────────────────────────────────────────────────
// Mounted only after auth is confirmed — ensures hooks fetch with valid token.

function AuthenticatedApp({ username, onLogout }) {
  const [activeView, setActiveView] = useState('home');
  const [previewVersion, setPreviewVersion] = useState(null);
  const [pendingNoteId, setPendingNoteId] = useState(null);
  const [pendingSessionId, setPendingSessionId] = useState(null);

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
    loading: reflectLoading,
    error: reflectError,
    ttsOnline,
    reflect,
    regenerateBlock,
    loadReflections,
  } = useReflect();

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
    <Layout activeView={activeView} onViewChange={setActiveView}>
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
              onNavigateToEntry={(id) => { selectEntry({ id }); setActiveView('journal'); }}
              onNavigateToNote={(id) => { setPendingNoteId(id); setActiveView('notes'); }}
              onNavigateToOracle={(id) => { setPendingSessionId(id); setActiveView('oracle'); }}
            />
          );
          if (activeView === 'oracle') return <OraclePage initialSessionId={pendingSessionId} onSessionSelected={() => setPendingSessionId(null)} />;
          if (activeView === 'notes') return <NotesPage initialNoteId={pendingNoteId} onNoteSelected={() => setPendingNoteId(null)} />;
          if (activeView === 'portrait') return <PortraitPage />;
if (activeView === 'settings') return <SettingsPage username={username} onLogout={onLogout} />;

          return (
            <WritingCanvas
              entry={activeEntry}
              onUpdate={handleUpdate}
              onNew={handleNew}
              toggleEntryList={toggleEntryList}
              entryListOpen={entryListOpen}
              onVersionPreview={setPreviewVersion}
              previewVersionId={previewVersion?.id}
            />
          );
        },

        mirror: activeView === 'journal' ? (
          <MirrorPanel
            blocks={blocks}
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
  // null = checking | 'gate' = show login | 'ok' = authenticated
  const [authStatus, setAuthStatus] = useState(null);
  const [username, setUsername] = useState('');

  useEffect(() => {
    // Check for valid stored JWT first
    if (isAuthenticated()) {
      setUsername(getStoredUsername() || '');
      setAuthStatus('ok');
      return;
    }

    // No token — check if any users exist
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((d) => {
        // Always show the gate (login or register is handled inside PasswordGate)
        setAuthStatus('gate');
      })
      .catch(() => {
        setAuthStatus('gate');
      });
  }, []);

  function handleAuthSuccess(u) {
    setUsername(u);
    setAuthStatus('ok');
  }

  function handleLogout() {
    clearStoredToken();
    setAuthStatus('gate');
    setUsername('');
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

  if (authStatus === 'gate') {
    return <PasswordGate onSuccess={handleAuthSuccess} />;
  }

  return <AuthenticatedApp username={username} onLogout={handleLogout} />;
}
