import { useState, useEffect, useRef, useCallback } from 'react';
import { useDictation } from '../hooks/useDictation';
import { useLanguage } from '../i18n/LanguageContext';
import MicButton from '../components/MicButton';
import { apiFetch } from '../utils/api';

const BUILT_IN_ARCHETYPES = ['Zen', 'Jungian', 'Stoic', 'Somatic', 'Taoist', 'Direct Friend'];
const ALL_TAG = '__all__';

// ── Styles ─────────────────────────────────────────────────────────────────
const s = {
  root: {
    display: 'flex',
    flexDirection: 'row',
    height: '100%',
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
    borderRadius: '2px',
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
    borderRadius: '4px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    borderRadius: '3px',
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
    borderRadius: '4px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    maxWidth: '720px',
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
    borderRadius: '3px',
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
    borderRadius: '3px',
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
    borderRadius: '3px',
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
    border: 'var(--border-style)',
    borderRadius: '3px',
    background: 'var(--strong)',
    color: 'var(--white)',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    flexShrink: 0,
    transition: 'opacity 0.12s',
  },
};

function formatSessionDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export default function OraclePage({ initialSessionId, onSessionSelected }) {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [archetype, setArchetype] = useState('Zen');
  const [archetypeOptions, setArchetypeOptions] = useState([...BUILT_IN_ARCHETYPES]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateArchetype, setShowCreateArchetype] = useState(false);
  const [newArchetypeName, setNewArchetypeName] = useState('');
  const [newArchetypeDesc, setNewArchetypeDesc] = useState('');

  // Tags
  const [oracleTags, setOracleTags] = useState([]);
  const [filterTag, setFilterTag] = useState(ALL_TAG);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }

  // Per-message TTS state
  const [playingMsgId, setPlayingMsgId] = useState(null);
  const [ttsOnline, setTtsOnline] = useState(false);
  const audioRef = useRef(null);

  // Saved message tracking
  const [savedMsgIds, setSavedMsgIds] = useState(new Set());

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const { isRecording: isDictating, isProcessing: isDictatingProcessing, toggle: toggleDictation } = useDictation((text) => {
    setInput((prev) => prev + (prev.trim() ? ' ' : '') + text);
  });

  useEffect(() => {
    // Load sessions, portrait archetypes, tags, and TTS status in parallel
    Promise.all([
      apiFetch('/api/oracle/sessions').then((r) => r.json()),
      apiFetch('/api/portrait').then((r) => r.json()),
      fetch('/api/tts/status').then((r) => r.json()),
      apiFetch('/api/oracle/tags').then((r) => r.json()),
    ]).then(([sessionsData, portrait, ttsData, tagsData]) => {
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
      }
      setTtsOnline(ttsData.online);
      if (Array.isArray(tagsData)) setOracleTags(tagsData);
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
        const activeTag = filterTag !== ALL_TAG ? filterTag : null;
        if (activeTag) {
          await apiFetch(`/api/oracle/sessions/${newSession.id}/tag`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: activeTag }),
          });
          newSession.tag = activeTag;
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
      const activeTag = filterTag !== ALL_TAG ? filterTag : null;
      if (activeTag) {
        await apiFetch(`/api/oracle/sessions/${newSession.id}/tag`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: activeTag }),
        });
        newSession.tag = activeTag;
      }
      setCurrentSession(newSession);
      setMessages([]);
      setSessions((prev) => [newSession, ...prev]);
    } catch {}
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

  async function handleAddTag() {
    const tag = newTagInput.trim();
    if (!tag) return;
    setOracleTags((prev) => prev.includes(tag) ? prev : [...prev, tag].sort());
    setNewTagInput('');
    setAddingTag(false);
    setFilterTag(tag);
  }

  async function handleDeleteTag(tag) {
    openConfirm(t('oracle.deleteTagConfirm', { tag }), async () => {
      await apiFetch(`/api/oracle/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
      setSessions((prev) => prev.map((s) => s.tag === tag ? { ...s, tag: null } : s));
      if (currentSession?.tag === tag) {
        setCurrentSession((s) => s ? { ...s, tag: null } : s);
      }
      setOracleTags((prev) => prev.filter((t) => t !== tag));
      if (filterTag === tag) setFilterTag(ALL_TAG);
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

  async function handleSessionTagChange(tag) {
    if (!currentSession) return;
    const newTag = tag || null;
    await apiFetch(`/api/oracle/sessions/${currentSession.id}/tag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: newTag }),
    });
    setCurrentSession((s) => s ? { ...s, tag: newTag } : s);
    setSessions((prev) => prev.map((s) => s.id === currentSession.id ? { ...s, tag: newTag } : s));
    // Add to tags list if new
    if (newTag && !oracleTags.includes(newTag)) {
      setOracleTags((prev) => [...prev, newTag].sort());
    }
  }

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

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setPlayingMsgId(null);
  }

  async function handleSpeak(msg) {
    if (playingMsgId === msg.id) { stopAudio(); return; }
    stopAudio();

    if (ttsOnline) {
      try {
        setPlayingMsgId(msg.id);
        const res = await fetch('/api/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msg.content }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => { setPlayingMsgId(null); URL.revokeObjectURL(url); };
          audio.onerror = () => setPlayingMsgId(null);
          await audio.play();
          return;
        }
      } catch {}
    }
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(msg.content);
      utt.onend = () => setPlayingMsgId(null);
      utt.onerror = () => setPlayingMsgId(null);
      window.speechSynthesis.speak(utt);
      setPlayingMsgId(msg.id);
    }
  }

  async function handleSaveMessage(msg) {
    const title = (messages.find((m, i) => m.role === 'user' && messages[i + 1]?.id === msg.id)?.content || t('oracle.oracleConversation')).slice(0, 70);
    const body = `<p><em>${t('oracle.title')} — ${msg.archetype || archetype}</em></p><p>${msg.content.split('\n\n').join('</p><p>')}</p>`;
    try {
      await apiFetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      setSavedMsgIds((prev) => new Set([...prev, msg.id]));
    } catch {}
  }

  const showEmpty = !loading && messages.length === 0;

  const filteredSessions = filterTag === ALL_TAG
    ? sessions
    : sessions.filter((s) => s.tag === filterTag);

  return (
    <div style={s.root}>
      {/* History sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <span style={s.sidebarTitle}>{t('oracle.conversations')}</span>
          <button style={s.sidebarNew} onClick={handleNewConversation} title={t('oracle.newConversation')}>+</button>
        </div>
        <div style={s.sidebarList}>
          {filteredSessions.length === 0 ? (
            <div style={s.sidebarEmpty}>{t('oracle.noConversations')}</div>
          ) : filteredSessions.map((sess) => {
            const active = currentSession?.id === sess.id;
            return (
              <SidebarItem
                key={sess.id}
                sess={sess}
                active={active}
                onClick={() => loadSession(sess.id)}
                onDelete={() => handleDeleteSession(sess)}
              />
            );
          })}
        </div>
      </div>

      {/* Tag strip */}
      <TagStrip
        tags={oracleTags}
        filterTag={filterTag}
        onFilter={setFilterTag}
        addingTag={addingTag}
        newTagInput={newTagInput}
        onAddingTag={setAddingTag}
        onNewTagInput={setNewTagInput}
        onAddTag={handleAddTag}
        onDeleteTag={handleDeleteTag}
      />

      {/* Main chat area */}
      <div style={s.mainArea}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>{t('oracle.title')}</span>
        <div style={s.headerRight}>
          {currentSession && (
            <select
              style={s.sessionTagSelector}
              value={currentSession.tag || ''}
              onChange={(e) => handleSessionTagChange(e.target.value)}
              title={t('oracle.tagConversation')}
            >
              <option value="">{t('oracle.noTag')}</option>
              {oracleTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              {oracleTags.length === 0 && (
                <option disabled>{t('oracle.createTagsHint')}</option>
              )}
            </select>
          )}
          <select
            style={s.archetypeSelect}
            value={archetype}
            onChange={(e) => handleArchetypeChange(e.target.value)}
          >
            {archetypeOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
            <option value="__create__">{t('oracle.createArchetypeOption')}</option>
          </select>
          <button style={s.headerBtn} onClick={handleNewConversation}>
            {t('oracle.clear')}
          </button>
        </div>
      </div>

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
          {t('oracle.send')}
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

function TagStrip({ tags, filterTag, onFilter, addingTag, newTagInput, onAddingTag, onNewTagInput, onAddTag, onDeleteTag }) {
  const { t } = useLanguage();
  const inputRef = useRef(null);

  useEffect(() => {
    if (addingTag) inputRef.current?.focus();
  }, [addingTag]);

  return (
    <div style={s.tagStrip}>
      {/* "All" pill */}
      <TagFilterPill
        label={t('oracle.allTag')}
        active={filterTag === ALL_TAG}
        onClick={() => onFilter(ALL_TAG)}
      />

      {tags.length > 0 && (
        <div style={{ width: '100%', borderTop: 'var(--border-style)', margin: '6px 0' }} />
      )}

      {tags.map((tag) => (
        <TagCustomPill
          key={tag}
          label={tag}
          active={filterTag === tag}
          onClick={() => onFilter(tag)}
          onDelete={() => onDeleteTag(tag)}
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

function TagCustomPill({ label, active, onClick, onDelete }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '62px',
        borderRadius: '20px',
        border: active ? '1px solid var(--strong)' : '1px solid var(--border)',
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
          letterSpacing: '0.03em',
          background: 'none',
          border: 'none',
          color: active ? 'var(--white)' : 'var(--body)',
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
        {label}
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

function SidebarItem({ sess, active, onClick, onDelete }) {
  const { t } = useLanguage();
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        ...s.sidebarItem,
        ...(active ? s.sidebarItemActive : hover ? { background: 'var(--panel-bg)' } : {}),
        position: 'relative',
      }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...s.sidebarItemMeta, ...(active ? s.sidebarItemMetaActive : {}), paddingRight: '18px' }}>
        {sess.archetype} · {formatSessionDate(sess.created_at)}
      </div>
      <div style={{ ...s.sidebarItemTitle, ...(active ? s.sidebarItemTitleActive : {}) }}>
        {(sess.first_message || sess.title || t('oracle.newConversation')).slice(0, 60)}
      </div>
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
