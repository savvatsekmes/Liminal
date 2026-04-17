import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDictation } from '../hooks/useDictation';
import { useTagSuggestions } from '../hooks/useTagSuggestions';
import { useLanguage } from '../i18n/LanguageContext';
import MicButton from '../components/MicButton';
import { apiFetch } from '../utils/api';
import { tagLabel, IMG_EMOJI, tagEmojisFromTags } from '../utils/tagEmoji';

function TagLabel({ tag }) {
  const src = IMG_EMOJI[tag.toLowerCase()];
  if (src) return <><img src={src} alt="" style={{ width: '12px', height: '12px', verticalAlign: '-2px' }} /> {tag}</>;
  return tagLabel(tag);
}
import { streamSpeak, stopSpeak } from '../utils/ttsStream';
import { BUILT_IN_ARCHETYPES as BUILT_IN_ARCH_OBJECTS } from '../constants/archetypes';
import ArchetypeAvatar from '../components/ArchetypeAvatar';
import Calendar from '../components/Calendar';
import { useIsMobile } from '../hooks/useIsMobile';

const BUILT_IN_ARCHETYPES = BUILT_IN_ARCH_OBJECTS.map(a => a.value);
const ALL_TAG = '__all__';

// ── Styles ─────────────────────────────────────────────────────────────────
const s = {
  root: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    height: '100%',
    minWidth: 0,
    overflow: 'hidden',
  },
  // History sidebar
  sidebar: {
    width: '220px',
    flexShrink: 0,
    borderRight: 'var(--border-style)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--near-white)',
    overflow: 'hidden',
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    height: '44px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  sidebarNew: {
    fontSize: '18px',
    color: 'var(--muted)',
    lineHeight: 1,
    padding: '2px 4px',
    borderRadius: '2px',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    transition: 'color 0.15s',
  },
  sidebarList: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  sidebarItem: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: '10px',
    margin: '1px 6px',
    transition: 'background 0.1s',
  },
  sidebarItemActive: {
    background: 'var(--panel-bg)',
  },
  sidebarItemMeta: {
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '2px',
  },
  sidebarItemMetaActive: {},
  sidebarItemTitle: {
    fontSize: '12px',
    color: 'var(--strong)',
    lineHeight: '1.4',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  sidebarItemTitleActive: {},
  sidebarEmpty: {
    padding: '24px 12px',
    fontSize: '12px',
    color: 'var(--muted)',
    textAlign: 'center',
    lineHeight: '1.6',
  },
  sidebarBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  // Tag strip (between sidebar and main)
  tagStrip: {
    width: '76px',
    flexShrink: 0,
    borderLeft: 'var(--border-style)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--near-white)',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '16px 6px',
    gap: '4px',
  },
  tagStripDivider: {
    width: '9px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  tagStripDividerLine: {
    width: '1px',
    background: 'var(--border-color, rgba(0,0,0,0.1))',
  },
  // Session tag selector in header
  sessionTagSelector: {
    fontSize: '11px',
    padding: '3px 8px',
    border: 'var(--border-style)',
    borderRadius: '20px',
    background: 'var(--white)',
    color: 'var(--muted)',
    outline: 'none',
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    maxWidth: '120px',
  },
  // Confirm modal
  confirmModal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  confirmBox: {
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '16px',
    padding: '24px 28px',
    width: '320px',
    maxWidth: '90vw',
  },
  confirmMsg: {
    fontSize: '13px',
    color: 'var(--body)',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  confirmActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  confirmBtn: {
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '500',
    border: 'var(--border-style)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    background: 'var(--white)',
    color: 'var(--body)',
  },
  confirmBtnDelete: {
    background: '#c0392b',
    color: '#fff',
    border: '1px solid #c0392b',
  },
  // Main area
  mainArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 0,
  },
  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: '44px',
    borderBottom: 'var(--border-style)',
    flexShrink: 0,
    background: 'var(--white)',
    gap: '12px',
  },
  headerTitle: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    flexShrink: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: 'auto',
  },
  archetypeSelect: {
    fontSize: '12px',
    padding: '4px 8px',
    border: 'var(--border-style)',
    borderRadius: '10px',
    background: 'var(--white)',
    color: 'var(--strong)',
    outline: 'none',
    fontFamily: 'var(--font)',
    cursor: 'pointer',
  },
  headerBtn: {
    fontSize: '11px',
    color: 'var(--muted)',
    padding: '4px 8px',
    border: 'var(--border-style)',
    borderRadius: '10px',
    background: 'var(--white)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'color 0.12s',
  },
  historyWrapper: {
    position: 'relative',
  },
  historyDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '16px',
    minWidth: '260px',
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  historyItem: {
    padding: '8px 14px',
    fontSize: '12px',
    color: 'var(--body)',
    cursor: 'pointer',
    borderBottom: 'var(--border-style)',
    transition: 'background 0.1s',
  },
  historyItemDate: {
    fontSize: '10px',
    color: 'var(--muted)',
    marginTop: '2px',
  },
  // Create archetype modal
  createModal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  createBox: {
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '16px',
    padding: '28px 32px',
    width: '360px',
    maxWidth: '90vw',
  },
  createTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--strong)',
    marginBottom: '20px',
  },
  createLabel: {
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--muted)',
    marginBottom: '6px',
    display: 'block',
  },
  createInput: {
    width: '100%',
    fontSize: '13px',
    padding: '8px 10px',
    border: 'var(--border-style)',
    borderRadius: '10px',
    outline: 'none',
    fontFamily: 'var(--font)',
    color: 'var(--strong)',
    marginBottom: '14px',
    boxSizing: 'border-box',
    background: 'var(--white)',
  },
  createActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '8px',
  },
  createBtn: {
    padding: '7px 16px',
    fontSize: '12px',
    fontWeight: '500',
    border: 'var(--border-style)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  createBtnPrimary: {
    background: 'var(--strong)',
    color: 'var(--white)',
    borderColor: 'var(--strong)',
  },
  // Messages
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  // Empty state
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  },
  emptyBox: {
    textAlign: 'center',
    maxWidth: '400px',
  },
  emptyTitle: {
    fontSize: '14px',
    color: 'var(--body)',
    lineHeight: '1.8',
    marginBottom: '4px',
  },
  emptySubtitle: {
    fontSize: '12px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    lineHeight: '1.7',
  },
  // Message bubbles
  msgRow: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '100%',
  },
  msgRowUser: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  msgRowAssistant: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  msgLabel: {
    fontSize: '10px',
    color: 'var(--muted)',
    letterSpacing: '0.05em',
    marginBottom: '5px',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  msgBubble: {
    padding: '12px 16px',
    borderRadius: '16px',
    lineHeight: '1.75',
  },
  msgBubbleUser: {
    background: 'var(--strong)',
    color: 'var(--white)',
    fontSize: '13px',
  },
  msgBubbleAssistant: {
    background: 'var(--near-white)',
    color: 'var(--body)',
    fontSize: '13px',
    border: 'var(--border-style)',
    whiteSpace: 'pre-wrap',
  },
  msgActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '6px',
    alignItems: 'center',
  },
  msgActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '3px',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'color 0.12s, background 0.12s',
  },
  msgActionBtnActive: {
    color: 'var(--strong)',
    background: 'var(--panel-bg)',
  },
  msgSaveLink: {
    fontSize: '10px',
    color: 'var(--muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'var(--font)',
    padding: 0,
    transition: 'color 0.12s',
  },
  switchDivider: {
    textAlign: 'center',
    fontSize: '10px',
    color: 'var(--muted)',
    padding: '4px 0',
    letterSpacing: '0.05em',
    fontStyle: 'italic',
  },
  // Typing indicator
  typingRow: {
    alignSelf: 'flex-start',
  },
  typingBubble: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--near-white)',
    border: 'var(--border-style)',
    borderRadius: '16px',
  },
  dot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: 'var(--muted)',
  },
  // Input area
  inputArea: {
    borderTop: 'var(--border-style)',
    padding: '14px 24px',
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-end',
    flexShrink: 0,
    background: 'var(--white)',
  },
  inputTextarea: {
    flex: 1,
    fontSize: '13px',
    padding: '10px 12px',
    border: 'var(--border-style)',
    borderRadius: '10px',
    background: 'var(--white)',
    color: 'var(--strong)',
    outline: 'none',
    fontFamily: 'var(--font)',
    lineHeight: '1.6',
    resize: 'none',
    minHeight: '40px',
    maxHeight: '160px',
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  },
  sendBtn: {
    padding: '9px 18px',
    fontSize: '12px',
    fontWeight: '500',
    border: 'none',
    borderRadius: '20px',
    background: 'var(--strong)',
    color: 'var(--white)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    flexShrink: 0,
    transition: 'opacity 0.12s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
};

function formatSessionDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
  } catch { return ''; }
}

export default function OraclePage({ initialSessionId, onSessionSelected, onNavigateToEntry, onNavigateToNote }) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState('chat'); // 'list' | 'chat'
  const [sessions, setSessions] = useState([]);
  const [showCal, setShowCal] = useState(true);
  const [search, setSearch] = useState('');
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [archetype, setArchetype] = useState('Auto');
  const [archetypeOptions, setArchetypeOptions] = useState([...BUILT_IN_ARCHETYPES]);
  const [customArchetypesList, setCustomArchetypesList] = useState([]);
  const [archetypeOpen, setArchetypeOpen] = useState(false);
  const archetypePickerRef = useRef(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateArchetype, setShowCreateArchetype] = useState(false);
  const [newArchetypeName, setNewArchetypeName] = useState('');
  const [newArchetypeDesc, setNewArchetypeDesc] = useState('');

  // Tags — multi-select filter
  const [activeFilters, setActiveFilters] = useState([]);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  // Manual tags above LLM-applied auto tags. Manual wins: anything in `tags`
  // is filtered out of `auto_tags` so a tag never appears in both lists.
  const allManualSessionTags = [...new Set(sessions.flatMap(s => s.tags || []))].sort();
  const allAutoSessionTags = (() => {
    const manualSet = new Set(allManualSessionTags);
    return [...new Set(sessions.flatMap(s => s.auto_tags || []))]
      .filter((t) => !manualSet.has(t))
      .sort();
  })();
  const allSessionTags = [...allManualSessionTags, ...allAutoSessionTags];
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }

  // Per-message TTS state
  const [playingMsgId, setPlayingMsgId] = useState(null);
  const audioRef = useRef(null);
  const cancelRef = useRef(false);

  // Saved message tracking
  const [savedMsgIds, setSavedMsgIds] = useState(new Set());

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const { isRecording: isDictating, isProcessing: isDictatingProcessing, toggle: toggleDictation } = useDictation((text) => {
    setInput((prev) => prev + (prev.trim() ? ' ' : '') + text);
  });

  // Close archetype picker on outside click
  useEffect(() => {
    if (!archetypeOpen) return;
    function handleClick(e) {
      if (archetypePickerRef.current && !archetypePickerRef.current.contains(e.target)) {
        setArchetypeOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [archetypeOpen]);

  useEffect(() => {
    // Load sessions, portrait archetypes, tags, and TTS status in parallel
    Promise.all([
      apiFetch('/api/oracle/sessions').then((r) => r.json()),
      apiFetch('/api/portrait').then((r) => r.json()),
    ]).then(([sessionsData, portrait]) => {
      if (Array.isArray(sessionsData)) {
        setSessions(sessionsData);
        const targetId = initialSessionId || (sessionsData.length > 0 ? sessionsData[0].id : null);
        if (targetId) {
          loadSession(targetId);
          if (initialSessionId) onSessionSelected?.();
        }
      }
      if (portrait) {
        try {
          const active = JSON.parse(portrait.active_archetypes || '[]');
          const all = [...new Set([...BUILT_IN_ARCHETYPES, ...active.filter((a) => !BUILT_IN_ARCHETYPES.includes(a))])];
          setArchetypeOptions(all);
          if (active.length) setArchetype(active[0]);
        } catch {}
        try {
          const custom = Array.isArray(portrait.custom_archetypes) ? portrait.custom_archetypes : JSON.parse(portrait.custom_archetypes || '[]');
          if (custom.length) setCustomArchetypesList(custom);
        } catch {}
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  async function loadSession(sessionId) {
    try {
      const res = await apiFetch(`/api/oracle/sessions/${sessionId}`);
      const data = await res.json();
      setCurrentSession(data);
      setMessages(data.messages || []);
      if (data.archetype) setArchetype(data.archetype);
    } catch {}
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || loading) return;
    setInput('');

    // Detect archetype switch mid-conversation
    const prevArchetype = currentSession?.archetype;
    const switched = prevArchetype && prevArchetype !== archetype;

    // Ensure we have a session
    let sessionId = currentSession?.id;
    if (!sessionId) {
      try {
        const r = await apiFetch('/api/oracle/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archetype }),
        });
        const newSession = await r.json();
        // Auto-tag if a tag filter is active
        if (activeFilters.length === 1) {
          const tag = activeFilters[0];
          await apiFetch(`/api/oracle/sessions/${newSession.id}/tag`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag }),
          });
          newSession.tags = [...(newSession.tags || []), tag];
        }
        setCurrentSession(newSession);
        setSessions((prev) => [newSession, ...prev]);
        sessionId = newSession.id;
      } catch { return; }
    }

    // Optimistically add user message + optional switch divider
    const tempId = `temp-${Date.now()}`;
    const optimisticMessages = [];
    if (switched) {
      optimisticMessages.push({ id: `switch-${Date.now()}`, type: 'switch', archetype });
    }
    optimisticMessages.push({ id: tempId, role: 'user', content, archetype });
    setMessages((prev) => [...prev, ...optimisticMessages]);
    setLoading(true);

    try {
      const r2 = await apiFetch(`/api/oracle/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, archetype }),
      });
      if (!r2.ok) {
        const errData = await r2.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Request failed');
      }
      const assistantMsg = await r2.json();

      // Append assistant message (keep the optimistic user message)
      setMessages((prev) => [...prev, assistantMsg]);

      // Update current session archetype
      if (switched) {
        setCurrentSession((s) => s ? { ...s, archetype } : s);
        setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, archetype } : s));
      }
    } catch (err) {
      // Remove optimistic messages on error and show it
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId && m.type !== 'switch'),
        { id: `err-${Date.now()}`, role: 'error', content: err.message || t('oracle.error') },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleNewConversation() {
    if (messages.length > 0) {
      if (!window.confirm(t('oracle.newConversationConfirm'))) return;
    }
    stopAudio();
    try {
      const r = await apiFetch('/api/oracle/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype }),
      });
      const newSession = await r.json();
      // Auto-tag new session if a tag filter is active
      if (activeFilters.length === 1) {
        const tag = activeFilters[0];
        await apiFetch(`/api/oracle/sessions/${newSession.id}/tag`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        });
        newSession.tags = [...(newSession.tags || []), tag];
      }
      setCurrentSession(newSession);
      setMessages([]);
      setSessions((prev) => [newSession, ...prev]);
    } catch (err) { console.error('[oracle] New conversation failed:', err); }
  }

  async function handleArchetypeChange(newArch) {
    if (newArch === '__create__') {
      setShowCreateArchetype(true);
      return;
    }
    setArchetype(newArch);
  }

  function openConfirm(message, onConfirm) {
    setConfirmModal({ message, onConfirm });
  }

  function toggleFilter(key) {
    setActiveFilters((prev) =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function clearFilters() {
    setActiveFilters([]);
  }

  async function handleAddTag() {
    const tag = newTagInput.trim().toLowerCase();
    if (!tag || !currentSession) return;
    const newTags = (currentSession.tags || []).includes(tag) ? currentSession.tags : [...(currentSession.tags || []), tag];
    await apiFetch(`/api/oracle/sessions/${currentSession.id}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    setCurrentSession((s) => s ? { ...s, tags: newTags } : s);
    setSessions((prev) => prev.map((s) => s.id === currentSession.id ? { ...s, tags: newTags } : s));
    setNewTagInput('');
    setAddingTag(false);
  }

  async function handleDeleteTag(tag) {
    openConfirm(t('oracle.deleteTagConfirm', { tag }), async () => {
      // Remove tag from all sessions
      const affected = sessions.filter(s => (s.tags || []).includes(tag));
      for (const sess of affected) {
        const newTags = (sess.tags || []).filter(t => t !== tag);
        await apiFetch(`/api/oracle/sessions/${sess.id}/tags`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: newTags }),
        });
      }
      setSessions((prev) => prev.map((s) => ({
        ...s, tags: (s.tags || []).filter(t => t !== tag)
      })));
      if ((currentSession?.tags || []).includes(tag)) {
        setCurrentSession((s) => s ? { ...s, tags: (s.tags || []).filter(t => t !== tag) } : s);
      }
      setActiveFilters((prev) => prev.filter(k => k !== tag));
      setConfirmModal(null);
    });
  }

  async function handleDeleteSession(sess) {
    openConfirm(
      t('oracle.deleteSessionConfirm', { title: (sess.first_message || sess.title || t('oracle.thisConversation')).slice(0, 50) }),
      async () => {
        await apiFetch(`/api/oracle/sessions/${sess.id}`, { method: 'DELETE' });
        setSessions((prev) => prev.filter((s) => s.id !== sess.id));
        if (currentSession?.id === sess.id) {
          setCurrentSession(null);
          setMessages([]);
        }
        setConfirmModal(null);
      }
    );
  }

  // Local mirror of server's normaliseTagPair: lowercase, dedupe, manual wins.
  function normaliseTagPair(manualArr, autoArr) {
    const norm = (arr) => {
      const seen = new Set();
      const out = [];
      for (const t of (arr || [])) {
        const c = String(t || '').trim().toLowerCase();
        if (!c || seen.has(c)) continue;
        seen.add(c);
        out.push(c);
      }
      return out;
    };
    const m = norm(manualArr);
    const mSet = new Set(m);
    return { tags: m, auto_tags: norm(autoArr).filter((t) => !mSet.has(t)) };
  }

  async function handleSessionTagsChange(tags) {
    if (!currentSession) return;
    const next = normaliseTagPair(tags, currentSession.auto_tags || []);
    await apiFetch(`/api/oracle/sessions/${currentSession.id}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: next.tags }),
    });
    setCurrentSession((s) => s ? { ...s, tags: next.tags, auto_tags: next.auto_tags } : s);
    setSessions((prev) => prev.map((s) => s.id === currentSession.id ? { ...s, tags: next.tags, auto_tags: next.auto_tags } : s));
  }

  async function handleSessionAutoTagsChange(auto_tags) {
    if (!currentSession) return;
    const next = normaliseTagPair(currentSession.tags || [], auto_tags);
    await apiFetch(`/api/oracle/sessions/${currentSession.id}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_tags: next.auto_tags }),
    });
    setCurrentSession((s) => s ? { ...s, tags: next.tags, auto_tags: next.auto_tags } : s);
    setSessions((prev) => prev.map((s) => s.id === currentSession.id ? { ...s, tags: next.tags, auto_tags: next.auto_tags } : s));
  }

  // Live tag suggestions for the conversation. The "text" we feed the LLM is
  // the joined transcript of every message in the current session — that way
  // tags reflect the whole exchange, not just the last user line.
  const conversationText = useMemo(
    () => messages.map((m) => m?.content || '').join('\n\n').trim(),
    [messages]
  );
  const { suggestions: oracleSuggestedTags, dismiss: dismissOracleSuggestion } = useTagSuggestions(
    conversationText,
    [...(currentSession?.tags || []), ...(currentSession?.auto_tags || [])]
  );

  async function handleCreateArchetype() {
    const name = newArchetypeName.trim();
    if (!name) return;

    try {
      // Add to portrait archetypes list
      const rp = await apiFetch('/api/portrait');
      const portrait = await rp.json();
      const existing = JSON.parse(portrait.active_archetypes || '[]');
      if (!existing.includes(name)) {
        await apiFetch('/api/portrait', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active_archetypes: JSON.stringify([...existing, name]) }),
        });
      }
      setArchetypeOptions((prev) => prev.includes(name) ? prev : [...prev, name]);
      setArchetype(name);
    } catch {}

    setNewArchetypeName('');
    setNewArchetypeDesc('');
    setShowCreateArchetype(false);
  }

  async function handleSpeak(msg) {
    if (playingMsgId === msg.id) { stopSpeak(audioRef, cancelRef); setPlayingMsgId(null); return; }
    cancelRef.current = false;
    setPlayingMsgId(msg.id);
    // Current dropdown selection wins over the archetype the message was
    // generated with — switching the dropdown updates the voice immediately.
    const speakArch = (archetype && archetype !== 'Auto') ? archetype : msg.archetype;
    await streamSpeak(msg.content, audioRef, cancelRef, {
      archetype: speakArch && speakArch !== 'Auto' ? speakArch : undefined,
    });
    setPlayingMsgId(null);
  }

  async function handleSaveMessage(msg) {
    const title = (messages.find((m, i) => m.role === 'user' && messages[i + 1]?.id === msg.id)?.content || t('oracle.oracleConversation')).slice(0, 70);
    const body = `<p><em>${t('oracle.title')} — ${msg.archetype || archetype}</em></p><p>${msg.content.split('\n\n').join('</p><p>')}</p>`;
    const body_text = msg.content;
    try {
      const res = await apiFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, body_text }),
      });
      if (res.ok) {
        setSavedMsgIds((prev) => new Set([...prev, msg.id]));
      } else {
        console.error('Save to journal failed:', await res.text());
      }
    } catch (err) {
      console.error('Save to journal error:', err);
    }
  }

  const showEmpty = !loading && messages.length === 0;

  const filteredSessions = activeFilters.length === 0
    ? sessions
    : sessions.filter((s) => (s.tags || []).some(t => activeFilters.includes(t)));

  const searchedSessions = search
    ? filteredSessions.filter(s => (s.first_message || s.title || '').toLowerCase().includes(search.toLowerCase()))
    : filteredSessions;

  // On mobile: load a session and switch to chat view
  const mobileLoadSession = (id) => {
    loadSession(id);
    setMobileView('chat');
  };

  return (
    <div style={s.root}>
      {/* History sidebar — hidden on mobile when viewing chat */}
      <div style={{ ...s.sidebar, ...(isMobile ? { width: 'auto', flex: 1, minWidth: 0, display: mobileView === 'list' ? 'flex' : 'none' } : {}) }}>
        <div style={s.sidebarHeader}>
          <span style={s.sidebarTitle}>{t('oracle.conversations')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              style={{
                fontSize: '11px',
                color: showCal ? 'var(--strong)' : 'var(--muted)',
                background: showCal ? 'var(--panel-bg)' : 'none',
                border: 'var(--border-style)',
                borderRadius: '2px',
                padding: '2px 5px',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                lineHeight: 1.4,
                transition: 'color 0.15s, background 0.15s',
              }}
              onClick={() => setShowCal(v => !v)}
              title={t('journal.calendar')}
            >
              {t('journal.calendar')}
            </button>
          </div>
        </div>
        {showCal && (
          <Calendar
            items={filteredSessions}
            activeId={currentSession?.id}
            onSelect={(sess) => loadSession(sess.id)}
            dateField="created_at"
            titleField="first_message"
          />
        )}
        <input
          style={{
            margin: '8px 10px', padding: '5px 10px', fontSize: '12px',
            border: 'var(--border-style)', borderRadius: '10px', background: 'var(--white)',
            width: 'calc(100% - 20px)', color: 'var(--strong)', outline: 'none',
            flexShrink: 0, fontFamily: 'var(--font)',
          }}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          style={{
            margin: '0 10px 8px', padding: '7px 0', fontSize: '11px',
            fontFamily: 'var(--font)', color: 'var(--muted)', background: 'transparent',
            border: '1.5px dashed var(--border)', borderRadius: '10px',
            width: 'calc(100% - 20px)', cursor: 'pointer', letterSpacing: '0.03em',
            transition: 'background 0.15s, color 0.15s', flexShrink: 0,
          }}
          onClick={() => { handleNewConversation(); if (isMobile) setMobileView('chat'); }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--strong)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)'; }}
        >
          + {t('oracle.newConversation')}
        </button>
        <div style={s.sidebarList}>
          {searchedSessions.length === 0 ? (
            <div style={s.sidebarEmpty}>{t('oracle.noConversations')}</div>
          ) : searchedSessions.map((sess) => {
            const active = currentSession?.id === sess.id;
            return (
              <SidebarItem
                key={sess.id}
                sess={sess}
                active={active}
                onClick={() => isMobile ? mobileLoadSession(sess.id) : loadSession(sess.id)}
                onDelete={() => handleDeleteSession(sess)}
                onNavigateToSource={
                  sess.source_entry_id ? () => onNavigateToEntry?.(sess.source_entry_id) :
                  sess.source_note_id ? () => onNavigateToNote?.(sess.source_note_id) :
                  null
                }
              />
            );
          })}
        </div>
      </div>

      {/* Tag strip — hidden on mobile except in list view */}
      {(!isMobile || mobileView === 'list') && <>
        <TagStrip
          tags={allSessionTags}
          manualTags={allManualSessionTags}
          autoTags={allAutoSessionTags}
          activeFilters={activeFilters}
          onToggle={toggleFilter}
          onClear={clearFilters}
          addingTag={addingTag}
          newTagInput={newTagInput}
          onAddingTag={setAddingTag}
          onNewTagInput={setNewTagInput}
          onAddTag={handleAddTag}
          onDeleteTag={handleDeleteTag}
        />
        <div style={s.tagStripDivider}>
          <div style={s.tagStripDividerLine} />
        </div>
      </>}

      {/* Main chat area — hidden on mobile when viewing list */}
      <div style={{ ...s.mainArea, ...(isMobile && mobileView === 'list' ? { display: 'none' } : {}) }}>
      {/* Mobile back button */}
      {isMobile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: 'var(--border-style)', flexShrink: 0 }}>
          <button
            onClick={() => setMobileView('list')}
            style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)', padding: '4px 0' }}
          >
            ‹ {t('oracle.conversations')}
          </button>
        </div>
      )}
      {/* Session tag selector */}
      {currentSession && (
        <SessionTagSelector
          tags={currentSession.tags || []}
          autoTags={currentSession.auto_tags || []}
          allTags={allSessionTags}
          suggestedTags={oracleSuggestedTags}
          onDismissSuggestion={dismissOracleSuggestion}
          onTagsChange={handleSessionTagsChange}
          onAutoTagsChange={handleSessionAutoTagsChange}
        />
      )}

      {/* Messages */}
      {showEmpty ? (
        <div style={s.emptyState}>
          <div style={s.emptyBox}>
            <div style={s.emptyTitle}>
              {t('oracle.emptyTitle')}
            </div>
            <div style={s.emptySubtitle}>
              {t('oracle.emptySubtitle')}
            </div>
          </div>
        </div>
      ) : (
        <div style={s.messages}>
          {messages.map((msg) => {
            if (msg.type === 'switch') {
              return (
                <div key={msg.id} style={s.switchDivider}>
                  {t('oracle.switchedTo', { archetype: msg.archetype })}
                </div>
              );
            }

            if (msg.role === 'error') {
              return (
                <div key={msg.id} style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', padding: '4px 0' }}>
                  {msg.content}
                </div>
              );
            }

            const isUser = msg.role === 'user';
            const isPlaying = playingMsgId === msg.id;

            return (
              <div
                key={msg.id}
                style={{ ...s.msgRow, ...(isUser ? s.msgRowUser : s.msgRowAssistant) }}
              >
                <div style={s.msgLabel}>
                  {isUser ? t('oracle.you') : (msg.archetype || archetype)}
                </div>
                <div style={{
                  ...s.msgBubble,
                  ...(isUser ? s.msgBubbleUser : s.msgBubbleAssistant),
                }}>
                  {msg.content}
                </div>
                {!isUser && (
                  <div style={s.msgActions}>
                    <button
                      style={{ ...s.msgActionBtn, ...(isPlaying ? s.msgActionBtnActive : {}) }}
                      onClick={() => handleSpeak(msg)}
                      title={isPlaying ? t('oracle.stop') : t('oracle.listen')}
                    >
                      <WaveformIcon playing={isPlaying} />
                    </button>
                    {savedMsgIds.has(msg.id) ? (
                      <span style={{ ...s.msgSaveLink, cursor: 'default' }}>{t('oracle.saved')}</span>
                    ) : (
                      <button style={s.msgSaveLink} onClick={() => handleSaveMessage(msg)}>
                        {t('oracle.saveToJournal')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div style={{ ...s.msgRow, ...s.typingRow }}>
              <div style={s.msgLabel}>{archetype}</div>
              <div style={s.typingBubble}>
                <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0s infinite' }} />
                <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0.2s infinite' }} />
                <div style={{ ...s.dot, animation: 'pulse 1s ease-in-out 0.4s infinite' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <div style={s.inputArea}>
        <textarea
          ref={inputRef}
          style={s.inputTextarea}
          placeholder={t('oracle.askArchetype', { archetype })}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          rows={1}
        />
        {/* Archetype picker */}
        <div style={{ position: 'relative' }} ref={archetypePickerRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setArchetypeOpen(!archetypeOpen); }}
            title={archetype}
            type="button"
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '20px',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 0.15s, background 0.15s',
              flexShrink: 0,
              background: archetypeOpen ? 'rgba(0,0,0,0.06)' : 'var(--near-white)',
              color: 'var(--strong)',
              boxShadow: archetypeOpen
                ? 'inset 0 1px 2px rgba(0,0,0,0.08)'
                : '0 1px 3px rgba(0,0,0,0.08), inset 0 -1px 0 rgba(0,0,0,0.06)',
            }}
          >
            {(() => {
              const builtIn = BUILT_IN_ARCH_OBJECTS.find(a => a.value === archetype);
              const custom = customArchetypesList.find(a => a.name === archetype);
              if (builtIn) return <ArchetypeAvatar archetype={builtIn} size={20} color="var(--strong)" />;
              if (custom) return <ArchetypeAvatar archetype={{ value: custom.name }} size={20} color={custom.color || 'var(--strong)'} />;
              return <ArchetypeAvatar archetype={{ value: archetype }} size={20} color="var(--strong)" />;
            })()}
          </button>
          {archetypeOpen && (
            <div style={{
              position: 'absolute',
              bottom: '46px',
              right: 0,
              background: 'var(--white)',
              borderRadius: '12px',
              padding: '6px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)',
              zIndex: 50,
              minWidth: '160px',
            }}>
              {BUILT_IN_ARCH_OBJECTS.map((a) => (
                <button
                  key={a.value}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                    padding: '7px 14px', fontSize: '12px', background: 'none', border: 'none',
                    borderRadius: '8px', cursor: 'pointer', fontFamily: 'var(--font)',
                    transition: 'background 0.1s',
                    fontWeight: archetype === a.value ? '600' : '400',
                    color: archetype === a.value ? 'var(--strong)' : 'var(--body)',
                  }}
                  onClick={() => { handleArchetypeChange(a.value); setArchetypeOpen(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ArchetypeAvatar archetype={a} size={18} color={archetype === a.value ? 'var(--strong)' : 'var(--muted)'} />
                  <span style={{ marginLeft: '8px' }}>{t(a.key)}</span>
                </button>
              ))}
              {customArchetypesList.length > 0 && (
                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 8px' }} />
              )}
              {customArchetypesList.map((c) => (
                <button
                  key={c.name}
                  style={{
                    display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                    padding: '7px 14px', fontSize: '12px', background: 'none', border: 'none',
                    borderRadius: '8px', cursor: 'pointer', fontFamily: 'var(--font)',
                    transition: 'background 0.1s',
                    fontWeight: archetype === c.name ? '600' : '400',
                    color: archetype === c.name ? 'var(--strong)' : 'var(--body)',
                  }}
                  onClick={() => { handleArchetypeChange(c.name); setArchetypeOpen(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--near-white)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ArchetypeAvatar archetype={{ value: c.name }} size={18} color={c.color || 'var(--muted)'} />
                  <span style={{ marginLeft: '8px' }}>{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <MicButton
          isRecording={isDictating}
          isProcessing={isDictatingProcessing}
          onClick={toggleDictation}
          style={{ width: '36px', height: '36px' }}
        />
        <button
          style={{ ...s.sendBtn, opacity: loading || !input.trim() ? 0.5 : 1 }}
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {t('oracle.ask')}
        </button>
      </div>

      {/* Confirm Modal */}
      {confirmModal && (
        <div style={s.confirmModal} onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(null); }}>
          <div style={s.confirmBox}>
            <div style={s.confirmMsg}>{confirmModal.message}</div>
            <div style={s.confirmActions}>
              <button style={s.confirmBtn} onClick={() => setConfirmModal(null)}>{t('common.cancel')}</button>
              <button style={{ ...s.confirmBtn, ...s.confirmBtnDelete }} onClick={confirmModal.onConfirm}>{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Archetype Modal */}
      {showCreateArchetype && (
        <div style={s.createModal} onClick={(e) => { if (e.target === e.currentTarget) setShowCreateArchetype(false); }}>
          <div style={s.createBox}>
            <div style={s.createTitle}>{t('oracle.createArchetype')}</div>
            <label style={s.createLabel}>{t('oracle.archetypeName')}</label>
            <input
              style={s.createInput}
              placeholder={t('oracle.archetypeNamePlaceholder')}
              value={newArchetypeName}
              onChange={(e) => setNewArchetypeName(e.target.value)}
              autoFocus
            />
            <label style={s.createLabel}>{t('oracle.archetypeDescription')}</label>
            <input
              style={s.createInput}
              placeholder={t('oracle.archetypeDescPlaceholder')}
              value={newArchetypeDesc}
              onChange={(e) => setNewArchetypeDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateArchetype(); }}
            />
            <div style={s.createActions}>
              <button
                style={s.createBtn}
                onClick={() => { setShowCreateArchetype(false); setNewArchetypeName(''); setNewArchetypeDesc(''); }}
              >
                {t('common.cancel')}
              </button>
              <button
                style={{ ...s.createBtn, ...s.createBtnPrimary }}
                onClick={handleCreateArchetype}
                disabled={!newArchetypeName.trim()}
              >
                {t('oracle.create')}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ── Tag strip ───────────────────────────────────────────────────────────────

function TagStrip({ tags, manualTags, autoTags, activeFilters, onToggle, onClear, addingTag, newTagInput, onAddingTag, onNewTagInput, onAddTag, onDeleteTag }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);

  useEffect(() => {
    if (addingTag) inputRef.current?.focus();
  }, [addingTag]);

  // Manual tags above LLM-applied auto tags. Falls back to a single list if
  // the parent didn't pass the split arrays.
  const manual = manualTags || tags;
  const auto = autoTags || [];

  return (
    <div style={s.tagStrip}>
      {/* "All" pill */}
      <TagFilterPill
        label={t('oracle.allTag')}
        active={activeFilters.length === 0}
        onClick={onClear}
      />

      {(manual.length > 0 || auto.length > 0) && (
        <div style={{ width: '100%', borderTop: 'var(--border-style)', margin: '6px 0' }} />
      )}

      {manual.map((tag) => (
        <TagCustomPill
          key={`m-${tag}`}
          label={tag}
          active={activeFilters.includes(tag)}
          onClick={() => onToggle(tag)}
          onDelete={() => onDeleteTag(tag)}
        />
      ))}

      {auto.length > 0 && (
        <div style={{
          width: '50px',
          height: '1px',
          background: 'var(--border)',
          opacity: 0.6,
          margin: '4px 0',
          flexShrink: 0,
        }} title="LLM-suggested tags" />
      )}

      {auto.map((tag) => (
        <TagCustomPill
          key={`a-${tag}`}
          label={tag}
          active={activeFilters.includes(tag)}
          onClick={() => onToggle(tag)}
          onDelete={() => onDeleteTag(tag)}
          auto
        />
      ))}

      {addingTag ? (
        <input
          ref={inputRef}
          value={newTagInput}
          onChange={(e) => onNewTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAddTag();
            if (e.key === 'Escape') { onAddingTag(false); onNewTagInput(''); }
          }}
          onBlur={() => { if (!newTagInput.trim()) { onAddingTag(false); } }}
          placeholder={t('oracle.tagPlaceholder')}
          maxLength={30}
          style={{
            width: '62px',
            padding: '4px 6px',
            fontSize: '11px',
            borderRadius: '20px',
            border: '1px solid var(--border)',
            textAlign: 'center',
            outline: 'none',
            fontFamily: 'var(--font)',
          }}
        />
      ) : (
        <button
          onClick={() => onAddingTag(true)}
          title={t('oracle.newTag')}
          style={{
            width: '62px',
            padding: '4px 0',
            fontSize: '14px',
            color: 'var(--muted)',
            border: '1px dashed var(--border)',
            borderRadius: '20px',
            background: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          +
        </button>
      )}

      <div style={{ flex: 1 }} />
    </div>
  );
}

function TagFilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '62px',
        padding: '5px 4px',
        fontSize: '10px',
        fontWeight: active ? '600' : '400',
        letterSpacing: '0.03em',
        borderRadius: '20px',
        border: active ? '1px solid var(--strong)' : '1px solid var(--border)',
        background: active ? 'var(--strong)' : 'transparent',
        color: active ? 'var(--white)' : 'var(--body)',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.12s',
        flexShrink: 0,
        fontFamily: 'var(--font)',
      }}
    >
      {label}
    </button>
  );
}

function TagCustomPill({ label, active, onClick, onDelete, auto = false }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);
  // Auto (LLM-applied) tags get a dashed border + italic so they read as
  // distinct from user-typed manual tags at a glance.
  const borderStyle = auto
    ? (active ? '1px solid var(--strong)' : '1px dashed var(--border)')
    : (active ? '1px solid var(--strong)' : '1px solid var(--border)');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '72px',
        borderRadius: '20px',
        border: borderStyle,
        background: active ? 'var(--strong)' : 'transparent',
        overflow: 'hidden',
        transition: 'all 0.12s',
        flexShrink: 0,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={onClick}
        style={{
          flex: 1,
          padding: '5px 0 5px 6px',
          fontSize: '10px',
          fontWeight: active ? '600' : '400',
          fontStyle: auto && !active ? 'italic' : 'normal',
          letterSpacing: '0.03em',
          background: 'none',
          border: 'none',
          color: active ? 'var(--white)' : (auto ? 'var(--muted)' : 'var(--body)'),
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--font)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
        title={label}
      >
        <TagLabel tag={label} />
      </button>
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={t('oracle.deleteTag')}
          style={{
            padding: '5px 5px 5px 2px',
            fontSize: '9px',
            background: 'none',
            border: 'none',
            color: active ? 'rgba(255,255,255,0.6)' : 'var(--muted)',
            cursor: 'pointer',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Sidebar item ────────────────────────────────────────────────────────────

function SidebarItem({ sess, active, onClick, onDelete, onNavigateToSource }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        ...s.sidebarItem,
        ...(active ? s.sidebarItemActive : hover ? { background: 'var(--panel-bg)' } : {}),
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {onNavigateToSource && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigateToSource(); }}
          title={sess.source_entry_id ? 'Go to journal entry' : 'Go to note'}
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '14px',
            border: 'none',
            background: 'rgba(99,102,241,0.1)',
            color: 'rgb(99,102,241)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6l-3 3V11H4a2 2 0 0 1-2-2V3z" />
            <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </button>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...s.sidebarItemMeta, ...(active ? s.sidebarItemMetaActive : {}), paddingRight: '18px' }}>
          {sess.archetype}{(sess.tags || []).length > 0 ? ' · ' + (sess.tags || []).join(' · ') : ''} · {formatSessionDate(sess.created_at)}
        </div>
        <div style={{ ...s.sidebarItemTitle, ...(active ? s.sidebarItemTitleActive : {}) }}>
          {(sess.first_message || sess.title || t('oracle.newConversation')).slice(0, 60)}
        </div>
      </div>
      {(() => {
        const emojiTags = tagEmojisFromTags([...(sess.tags || []), ...(sess.auto_tags || [])]);
        if (!emojiTags.length) return null;
        return (
          <div
            title={emojiTags.map(e => e.tag).join(', ')}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '3px',
              flexShrink: 0,
              fontSize: '15px',
              lineHeight: 1,
              marginRight: hover ? '14px' : '0',
            }}
          >
            {emojiTags.slice(0, 3).map((e) => (
              e.img
                ? <img key={e.tag} src={e.img} alt={e.tag} style={{ width: '15px', height: '15px', display: 'block' }} />
                : <span key={e.tag}>{e.glyph}</span>
            ))}
          </div>
        );
      })()}
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={t('oracle.deleteConversation')}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: '13px',
            lineHeight: 1,
            borderRadius: '2px',
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function WaveformIcon({ playing }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="1" y={playing ? 2 : 4} width="2" height={playing ? 10 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="10;4;10" dur="0.8s" repeatCount="indefinite" />}
      </rect>
      <rect x="4.5" y={playing ? 0 : 2} width="2" height={playing ? 14 : 10} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="14;6;14" dur="0.6s" repeatCount="indefinite" />}
      </rect>
      <rect x="8" y={playing ? 3 : 4} width="2" height={playing ? 8 : 6} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />}
      </rect>
      <rect x="11.5" y={playing ? 1 : 3} width="2" height={playing ? 12 : 8} rx="1" fill="currentColor">
        {playing && <animate attributeName="height" values="12;5;12" dur="0.7s" repeatCount="indefinite" />}
      </rect>
    </svg>
  );
}

function SessionTagSelector({ tags, autoTags = [], allTags, suggestedTags = [], onDismissSuggestion, onTagsChange, onAutoTagsChange }) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');

  // Manual pills toggle in `tags`, auto pills toggle in `auto_tags`. A pill
  // not on the session yet (e.g. a filter from another conversation) is
  // added to manual tags.
  function toggleTag(tag) {
    if (tags.includes(tag)) {
      onTagsChange(tags.filter(t => t !== tag));
    } else if (autoTags.includes(tag)) {
      onAutoTagsChange?.(autoTags.filter(t => t !== tag));
    } else {
      onTagsChange([...tags, tag]);
    }
  }

  // Promote a suggestion → write into `auto_tags`. The user can later
  // promote to manual by clicking the auto pill (server normaliseTagPair
  // ensures a tag never lives in both arrays).
  function applySuggestion(tag) {
    if (!tags.includes(tag) && !autoTags.includes(tag)) {
      onAutoTagsChange?.([...autoTags, tag]);
    }
    onDismissSuggestion?.(tag);
  }

  function addTag() {
    const clean = newTag.trim().toLowerCase();
    if (clean && !tags.includes(clean)) onTagsChange([...tags, clean]);
    setNewTag('');
    setAdding(false);
  }

  const ownSet = new Set([...tags, ...autoTags]);
  const otherTags = allTags.filter((t) => !ownSet.has(t));
  const freshSuggestions = suggestedTags.filter((s) => !tags.includes(s) && !autoTags.includes(s) && !otherTags.includes(s));

  const pillBase = {
    fontSize: '10px',
    padding: '3px 9px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  const pillActive = {
    border: '1px solid var(--strong)',
    background: 'var(--strong)',
    color: 'var(--white)',
    fontWeight: '600',
  };

  // Visually distinct pill for live LLM-suggested tags.
  const pillSuggested = {
    border: '1px dashed var(--border)',
    background: 'var(--near-white)',
    color: 'var(--muted)',
    fontStyle: 'italic',
  };

  // Auto-applied (LLM) tags already on the session: dashed border, no italic.
  const pillAuto = {
    border: '1px dashed var(--border)',
    background: 'transparent',
    color: 'var(--muted)',
  };

  const sortedManual = [...tags].sort();
  const sortedAuto = [...autoTags].sort();
  const sortedOther = [...otherTags].sort();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      padding: '6px 24px',
      borderBottom: 'var(--border-style)',
      flexWrap: 'wrap',
      flexShrink: 0,
    }}>
      {sortedManual.map((tag) => (
        <button
          key={'m-' + tag}
          style={{ ...pillBase, ...pillActive }}
          onClick={() => toggleTag(tag)}
          title="Manual tag — click to remove"
        >
          <TagLabel tag={tag} />
        </button>
      ))}
      {sortedAuto.map((tag) => (
        <button
          key={'a-' + tag}
          style={{ ...pillBase, ...pillAuto }}
          onClick={() => toggleTag(tag)}
          title="Suggested tag — click to remove"
        >
          <TagLabel tag={tag} />
        </button>
      ))}
      {sortedOther.map((tag) => (
        <button
          key={'o-' + tag}
          style={{ ...pillBase }}
          onClick={() => toggleTag(tag)}
          title="Filter tag — click to add to this conversation"
        >
          <TagLabel tag={tag} />
        </button>
      ))}
      {freshSuggestions.map((tag) => (
        <button
          key={'sug-' + tag}
          style={{ ...pillBase, ...pillSuggested }}
          onClick={() => applySuggestion(tag)}
          title="Suggested — click to add"
        >
          + <TagLabel tag={tag} />
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') { setAdding(false); setNewTag(''); } }}
          onBlur={addTag}
          placeholder="tag…"
          style={{
            fontSize: '10px',
            padding: '3px 8px',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            background: 'var(--white)',
            color: 'var(--strong)',
            outline: 'none',
            width: '70px',
            fontFamily: 'var(--font)',
          }}
        />
      ) : (
        <button
          style={{ ...pillBase, border: '1px dashed var(--border)' }}
          onClick={() => setAdding(true)}
          title="Add tag"
        >
          +
        </button>
      )}
    </div>
  );
}
