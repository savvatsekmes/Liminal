import { useState, useEffect, useRef, useCallback } from 'react';
import Layout from './components/Layout';
import LockScreen from './components/LockScreen';
import EntryList from './components/EntryList';
import WritingCanvas from './components/WritingCanvas';
import MirrorPanel from './components/MirrorPanel';
import PasswordGate from './components/PasswordGate';
import Onboarding from './components/Onboarding';
import SelectionMenu from './components/SelectionMenu';
import FindBar from './components/FindBar';
import HomePage from './pages/HomePage';
import PortraitPage from './pages/PortraitPage';
import NotesPage from './pages/NotesPage';
import OraclePage from './pages/OraclePage';
import MemoryPage from './pages/MemoryPage';
import SettingsPage from './pages/SettingsPage';
import { useEntries } from './hooks/useEntries';
import { useReflect } from './hooks/useReflect';
import { isAuthenticated, getStoredUsername, getStoredToken, clearStoredToken, apiFetch } from './utils/api';
import { LanguageProvider } from './i18n/LanguageContext';
import { useTtsLoading } from './utils/ttsStatus';

// ── Authenticated shell ───────────────────────────────────────────────────────
// Mounted only after auth is confirmed — ensures hooks fetch with valid token.

function AuthenticatedApp({ username, onLogout, isFirstSession, avatarUrl, onAvatarChange, lockTimeoutMinutes }) {
  const [activeView, setActiveView] = useState(() => {
    const saved = sessionStorage.getItem('liminal_view');
    if (saved && ['home','journal','notes','oracle','portrait','memory','settings'].includes(saved)) return saved;
    return 'home';
  });
  const handleViewChange = useCallback((view) => {
    setActiveView(view);
    sessionStorage.setItem('liminal_view', view);
  }, []);
  const [locked, setLocked] = useState(false);
  const lockTimerRef = useRef(null);
  // 0 (or any non-positive value) means "never lock" — the user opted out
  // of the inactivity gate via Settings → Auto-lock after.
  const lockTimeoutMs = lockTimeoutMinutes > 0 ? lockTimeoutMinutes * 60 * 1000 : null;

  const resetLockTimer = useCallback(() => {
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    if (lockTimeoutMs == null) return;
    lockTimerRef.current = setTimeout(() => setLocked(true), lockTimeoutMs);
  }, [lockTimeoutMs]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    const handler = () => { if (!locked) resetLockTimer(); };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetLockTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, [locked, resetLockTimer, lockTimeoutMs]);
  const [previewVersion, setPreviewVersion] = useState(null);
  const [pendingNoteId, setPendingNoteId] = useState(null);
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const [pendingPortraitTab, setPendingPortraitTab] = useState(null);
  const [findBarOpen, setFindBarOpen] = useState(false);

  // Ctrl/Cmd+F opens the find-on-page bar while viewing a journal entry or a
  // note. Scoped to those views because the list-style pages (home, entries
  // list, oracle, etc.) don't have enough prose content for find to be useful.
  useEffect(() => {
    const isFindView = activeView === 'journal' || activeView === 'notes';
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        if (!isFindView) return;
        e.preventDefault();
        setFindBarOpen(true);
      }
    }
    // Capture phase so the handler fires before ProseMirror (or any other
    // editor) can swallow the keystroke.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeView]);

  // Auto-close the find bar when switching away from journal/notes.
  useEffect(() => {
    if (activeView !== 'journal' && activeView !== 'notes' && findBarOpen) {
      setFindBarOpen(false);
    }
  }, [activeView, findBarOpen]);

  const {
    entries,
    activeEntry,
    createEntry,
    updateEntry,
    deleteEntry,
    selectEntry,
    refreshEntries,
    allTags,
    allManualTags,
    allAutoTags,
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
    // Remove tag from every entry's manual `tags` AND auto `auto_tags`.
    // Since the filter column shows both kinds of pill and the user can
    // hit × on either, we need to clear from whichever list it lives in.
    const affected = entries.filter(e =>
      (e.tags || []).includes(tag) || (e.auto_tags || []).includes(tag)
    );
    for (const entry of affected) {
      const fields = {};
      if ((entry.tags || []).includes(tag)) {
        fields.tags = (entry.tags || []).filter(t => t !== tag);
      }
      if ((entry.auto_tags || []).includes(tag)) {
        fields.auto_tags = (entry.auto_tags || []).filter(t => t !== tag);
      }
      await updateEntry(entry.id, fields);
    }
  }

  async function handleAddTagToActive(tag) {
    if (!activeEntry?.id) return;
    const current = activeEntry.tags || [];
    if (current.includes(tag)) return;
    await updateEntry(activeEntry.id, { tags: [...current, tag] });
  }

  async function handleReflect(archetype) {
    if (!activeEntry) return;
    await reflect(activeEntry, archetype);
  }

  async function handleTalkAboutEntry(entry) {
    if (!entry?.id) return;
    // If already linked, navigate to that session
    if (entry.linked_session_id) {
      setPendingSessionId(entry.linked_session_id);
      handleViewChange('oracle');
      return;
    }
    try {
      const res = await apiFetch('/api/oracle/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceEntryId: entry.id }),
      });
      const session = await res.json();
      // Update local entry with linked session id
      await updateEntry(entry.id, { linked_session_id: session.id });
      setPendingSessionId(session.id);
      handleViewChange('oracle');
    } catch (err) {
      console.error('Failed to create linked session:', err);
    }
  }

  async function handleTalkAboutNote(noteId, linkedSessionId) {
    if (!noteId) return;
    if (linkedSessionId) {
      setPendingSessionId(linkedSessionId);
      handleViewChange('oracle');
      return;
    }
    try {
      const res = await apiFetch('/api/oracle/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceNoteId: noteId }),
      });
      const session = await res.json();
      setPendingSessionId(session.id);
      handleViewChange('oracle');
    } catch (err) {
      console.error('Failed to create linked session:', err);
    }
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
            allManualTags={allManualTags}
            allAutoTags={allAutoTags}
            onDeleteTag={handleDeleteTag}
            onAddTag={handleAddTagToActive}
            onNavigateToChat={(sessionId) => { setPendingSessionId(sessionId); handleViewChange('oracle'); }}
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
              onLogout={onLogout}
              onLock={() => setLocked(true)}
              onNavigateToSettings={() => handleViewChange('settings')}
            />
          );
          if (activeView === 'oracle') return (
            <OraclePage
              initialSessionId={pendingSessionId}
              onSessionSelected={() => setPendingSessionId(null)}
              onNavigateToEntry={(id) => { selectEntry({ id }); handleViewChange('journal'); }}
              onNavigateToNote={(id) => { setPendingNoteId(id); handleViewChange('notes'); }}
            />
          );
          if (activeView === 'notes') return <NotesPage initialNoteId={pendingNoteId} onNoteSelected={() => setPendingNoteId(null)} onTalkAboutNote={handleTalkAboutNote} onNavigateToChat={(sessionId) => { setPendingSessionId(sessionId); handleViewChange('oracle'); }} />;
          if (activeView === 'portrait') return <PortraitPage onNavigateEntry={(id) => { selectEntry({ id }); handleViewChange('journal'); }} initialTab={pendingPortraitTab} onTabLoaded={() => setPendingPortraitTab(null)} />;
          if (activeView === 'memory') return <MemoryPage onNavigateToPortrait={() => { setPendingPortraitTab('portrait'); handleViewChange('portrait'); }} />;
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
              onTalkAboutThis={handleTalkAboutEntry}
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
            onNavigateToEntry={(id) => { selectEntry({ id }); handleViewChange('journal'); }}
          />
        ) : (
          <div style={{ display: 'none' }} />
        ),
      }}
    </Layout>
    <SelectionMenu />
    {findBarOpen && <FindBar onClose={() => setFindBarOpen(false)} />}
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
  const [lockTimeoutMinutes, setLockTimeoutMinutes] = useState(30);

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
          // Fetch language + lock timeout setting
          apiFetch('/api/settings').then(r => r.json()).then(s => {
            if (s.language) setLanguage(s.language);
            const lt = parseInt(s.lock_timeout_minutes, 10);
            if (!isNaN(lt)) setLockTimeoutMinutes(lt);
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

  // React to live settings changes from the Settings page so things like
  // lock_timeout_minutes take effect without requiring a re-login.
  useEffect(() => {
    function onChange(e) {
      const s = e.detail || {};
      if (s.language) setLanguage(s.language);
      const lt = parseInt(s.lock_timeout_minutes, 10);
      if (!isNaN(lt)) setLockTimeoutMinutes(lt);
    }
    window.addEventListener('liminal:settings-changed', onChange);
    return () => window.removeEventListener('liminal:settings-changed', onChange);
  }, []);

  function handleAuthSuccess(u, onboardingComplete, password) {
    setUsername(u);
    // Forward password to Electron main process for encrypted backups
    if (password) window.liminal?.setSessionPassword(password, getStoredToken());
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
      .then((s) => {
        if (s.language) setLanguage(s.language);
        const lt = parseInt(s.lock_timeout_minutes, 10);
        if (!isNaN(lt)) setLockTimeoutMinutes(lt);
      })
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

  // Backup splash overlay — shown by Electron main process before quit
  const [backupSplash, setBackupSplash] = useState(false);
  useEffect(() => {
    if (!window.liminal?.onBackupStarting) return;
    return window.liminal.onBackupStarting(() => setBackupSplash(true));
  }, []);

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
      {authStatus === 'ok' && <AuthenticatedApp username={username} onLogout={handleLogout} isFirstSession={isFirstSession} avatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} lockTimeoutMinutes={lockTimeoutMinutes} />}
      {backupSplash && <BackupSplash />}
      <TtsLoadingToast />
    </LanguageProvider>
  );
}

function TtsLoadingToast() {
  const loading = useTtsLoading();
  if (!loading) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99998,
      background: 'rgba(15, 15, 16, 0.92)',
      color: 'rgba(255,255,255,0.85)',
      padding: '10px 16px',
      borderRadius: '999px',
      fontSize: '12px',
      fontFamily: 'var(--font)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      maxWidth: '92vw',
    }}>
      <div style={{
        width: '12px', height: '12px',
        border: '2px solid rgba(255,255,255,0.2)',
        borderTopColor: 'var(--accent, #a78bfa)',
        borderRadius: '50%',
        animation: 'liminal-spin 0.8s linear infinite',
        flexShrink: 0,
      }} />
      <span>Loading Chatterbox into VRAM… (takes ~15s first time)</span>
      <style>{`@keyframes liminal-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function BackupSplash() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(15, 15, 16, 0.92)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '18px',
    }}>
      <div style={{
        width: '40px', height: '40px',
        border: '3px solid rgba(255,255,255,0.15)',
        borderTopColor: 'var(--accent, #a78bfa)',
        borderRadius: '50%',
        animation: 'liminal-spin 0.8s linear infinite',
      }} />
      <div style={{
        color: 'rgba(255,255,255,0.7)',
        fontSize: '14px',
        fontFamily: 'var(--font)',
        letterSpacing: '0.5px',
      }}>
        Saving backup…
      </div>
      <style>{`@keyframes liminal-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
