import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSwipeNav } from '../hooks/useSwipeNav';
import { streamSpeak, stopSpeak } from '../utils/ttsStream';
import { useFirstTourTrigger } from '../components/TutorialContext';

const s = {
  root: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    background: 'var(--white)',
    fontFamily: 'var(--font)',
    color: 'var(--strong)',
  },
  sidebar: {
    width: '260px',
    flexShrink: 0,
    borderRight: 'var(--border-style)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  sidebarHeader: {
    padding: '14px 16px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    borderBottom: 'var(--border-style)',
  },
  sidebarTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: 700,
    lineHeight: 1.1,
    color: 'var(--strong)',
  },
  sidebarTagline: {
    fontSize: '11px',
    color: 'var(--muted)',
    fontStyle: 'italic',
  },
  detectRow: {
    padding: '10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flexShrink: 0,
  },
  detectBtn: {
    padding: '7px 0',
    fontSize: '11px',
    fontFamily: 'var(--font)',
    color: 'var(--muted)',
    background: 'transparent',
    border: '1.5px dashed var(--border)',
    borderRadius: '10px',
    width: '100%',
    cursor: 'pointer',
    letterSpacing: '0.03em',
    transition: 'background 0.15s, color 0.15s',
  },
  detectBtnDisabled: {
    cursor: 'default',
    color: 'var(--muted)',
  },
  detectStatus: {
    fontSize: '11px',
    color: 'var(--muted)',
    textAlign: 'center',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  listItem: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: '10px',
    margin: '1px 6px',
    transition: 'background 0.1s',
    outline: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    position: 'relative',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  listItemActive: {
    background: 'var(--panel-bg)',
  },
  listItemName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--strong)',
    lineHeight: 1.3,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  listItemCount: {
    fontSize: '10.5px',
    color: 'var(--muted)',
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  sectionDivider: {
    height: '1px',
    background: 'var(--border)',
    margin: '10px 14px 6px',
    opacity: 0.7,
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    padding: '4px 14px 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addThreadBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
    padding: '0 4px',
    fontFamily: 'var(--font)',
  },
  customForm: {
    margin: '4px 8px 6px',
    padding: '8px 10px',
    background: 'var(--panel-bg)',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  customInput: {
    fontSize: '12px',
    fontFamily: 'var(--font)',
    color: 'var(--strong)',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '6px',
    padding: '5px 7px',
    outline: 'none',
  },
  customActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  customBtn: {
    fontSize: '11px',
    fontFamily: 'var(--font)',
    padding: '4px 9px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: 'var(--border-style)',
    background: 'transparent',
    color: 'var(--strong)',
  },
  customBtnPrimary: {
    background: 'var(--strong)',
    color: 'var(--white)',
    borderColor: 'transparent',
  },
  ctxMenu: {
    position: 'fixed',
    background: 'var(--white)',
    border: 'var(--border-style)',
    borderRadius: '8px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
    padding: '4px 0',
    minWidth: '160px',
    zIndex: 50,
    fontSize: '12px',
    fontFamily: 'var(--font)',
  },
  ctxItem: {
    padding: '7px 12px',
    cursor: 'pointer',
    color: 'var(--strong)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  ctxItemDanger: {
    color: '#b94a48',
  },
  detail: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
  },
  detailEmpty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted)',
    fontSize: '13px',
    fontStyle: 'italic',
    padding: '24px',
    textAlign: 'center',
  },
  detailScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 36px 60px',
  },
  detailHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '20px',
  },
  detailName: {
    fontSize: '22px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    color: 'var(--strong)',
  },
  detailDescription: {
    fontSize: '13px',
    color: 'var(--muted)',
    fontStyle: 'italic',
    lineHeight: 1.5,
  },
  detailMetaRow: {
    display: 'flex',
    gap: '14px',
    alignItems: 'center',
    fontSize: '11px',
    color: 'var(--muted)',
    marginTop: '4px',
  },
  statusSelect: {
    fontSize: '11px',
    fontFamily: 'var(--font)',
    color: 'var(--strong)',
    background: 'transparent',
    border: 'var(--border-style)',
    padding: '2px 6px',
    cursor: 'pointer',
  },
  section: {
    marginTop: '26px',
  },
  sectionHeading: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  insightBody: {
    fontSize: '14px',
    lineHeight: 1.65,
    color: 'var(--strong)',
    whiteSpace: 'pre-wrap',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    padding: '2px 4px',
    cursor: 'pointer',
    color: 'var(--muted)',
    fontSize: '11px',
    fontFamily: 'var(--font)',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    borderLeft: '1px solid var(--border)',
    paddingLeft: '16px',
    marginLeft: '4px',
  },
  timelineItem: {
    padding: '10px 0',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  timelineRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  timelineTitle: {
    fontSize: '13px',
    color: 'var(--strong)',
  },
  timelineDate: {
    fontSize: '10px',
    color: 'var(--muted)',
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
  },
  timelineExcerpt: {
    fontSize: '12px',
    color: 'var(--muted)',
    lineHeight: 1.5,
  },
  badge: {
    fontSize: '9px',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    padding: '1px 6px',
    borderRadius: '2px',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
  },
  badgeNote: {
    background: 'rgba(167, 139, 250, 0.08)',
    color: 'var(--strong)',
  },
  badgeOracle: {
    background: 'var(--strong)',
    color: 'var(--white)',
    borderColor: 'transparent',
  },
};

const STATUS_DOTS = {
  active:    '●',
  resolving: '◐',
  complete:  '○',
};

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(String(iso).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  } catch { return ''; }
}

function formatDateRange(firstIso, lastIso) {
  const a = formatDate(firstIso);
  const b = formatDate(lastIso);
  if (!a && !b) return '';
  if (a === b) return a;
  return `${a} → ${b}`;
}

function WaveformIcon({ playing }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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

function LoadingDots() {
  // Three pulsing dots — matches the "· · ·" pattern used elsewhere in the app
  // (see MirrorPanel LoadingState) but animated so the user can see progress.
  return (
    <span style={{ display: 'inline-flex', gap: '3px', marginLeft: '6px', verticalAlign: 'middle' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'currentColor',
            opacity: 0.4,
            animation: `threadsDotPulse 1.1s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`@keyframes threadsDotPulse { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.9); } 40% { opacity: 1; transform: scale(1.15); } }`}</style>
    </span>
  );
}

function NodeBadge({ type, t }) {
  if (type === 'entry') {
    return <span style={{ ...s.badge }}>{type}</span>;
  }
  if (type === 'note') {
    return <span style={{ ...s.badge, ...s.badgeNote }}>{t('threads.nodeBadge.note') || 'note'}</span>;
  }
  return <span style={{ ...s.badge, ...s.badgeOracle }}>{t('threads.nodeBadge.oracle') || 'oracle'}</span>;
}

export default function ThreadsPage({ onNavigateToEntry, onNavigateToNote, onNavigateToOracle, initialThreadId, onThreadSelected }) {
  useFirstTourTrigger('threads');
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'detail'
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [detectJob, setDetectJob] = useState({ running: false, phase: 'idle', done: 0, total: 0 });
  const [regeneratingInsight, setRegeneratingInsight] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [rematchingId, setRematchingId] = useState(null);
  const [editingThread, setEditingThread] = useState(null); // { id, name, description }
  const [savingEdit, setSavingEdit] = useState(false);
  const audioRef = useRef(null);
  const cancelRef = useRef(false);

  const mobileOpenThread = useCallback((id) => {
    setActiveThreadId(id);
    if (isMobile) setMobileView('detail');
  }, [isMobile]);

  const swipe = useSwipeNav({
    enabled: isMobile,
    onLeft: () => { if (mobileView === 'list' && activeThreadId) setMobileView('detail'); },
    onRight: () => { if (mobileView === 'detail') setMobileView('list'); },
  });

  // Wall-clock ticker during a running detect job. The theme stage is a
  // single ~30-90s LLM call with no natural counter, so without this the UI
  // just shows dots for a minute. Ticking every second gives the user
  // something visibly moving.
  useEffect(() => {
    if (!detectJob.running) { setElapsed(0); return; }
    const started = detectJob.startedAt ? new Date(detectJob.startedAt).getTime() : Date.now();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [detectJob.running, detectJob.startedAt]);

  function formatElapsed(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const loadThreads = useCallback(async () => {
    try {
      const res = await apiFetch('/api/threads');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setThreads(list);
      setLoading(false);
      setActiveThreadId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      setLoading(false);
    }
  }, []);

  const loadTotals = useCallback(async () => {
    try {
      const [e, n, o] = await Promise.all([
        apiFetch('/api/entries').then((r) => r.json()).catch(() => []),
        apiFetch('/api/notes').then((r) => r.json()).catch(() => []),
        apiFetch('/api/oracle/sessions').then((r) => r.json()).catch(() => []),
      ]);
      setTotalItems((Array.isArray(e) ? e.length : 0) + (Array.isArray(n) ? n.length : 0) + (Array.isArray(o) ? o.length : 0));
    } catch {}
  }, []);

  useEffect(() => {
    loadThreads();
    loadTotals();
  }, [loadThreads, loadTotals]);

  // Honour an incoming preselect (e.g. from the Home page Threads widget).
  // Waits for the threads list to be loaded, then sets activeThreadId if the
  // target exists. Clears the pending flag via onThreadSelected so reopening
  // the page doesn't keep re-selecting the same thread.
  useEffect(() => {
    if (!initialThreadId || !threads.length) return;
    const target = threads.find((t) => t.id === initialThreadId);
    if (target) {
      setActiveThreadId(target.id);
      if (isMobile) setMobileView('detail');
    }
    onThreadSelected?.();
  }, [initialThreadId, threads]);

  // Keep the list live while the page is visible. Beads land 5-15s after
  // Reflect / chat / note save as the background threading call completes,
  // so without this the user would have to refresh to see the new bead.
  // Also refresh on window focus (covers app-switching back to Liminal).
  useEffect(() => {
    const onFocus = () => loadThreads();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadThreads();
    }, 5000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [loadThreads]);

  // Resume poll on mount if a detect job is already running.
  useEffect(() => {
    apiFetch('/api/threads/detect-status')
      .then((r) => r.json())
      .then((job) => { if (job?.running) setDetectJob(job); })
      .catch(() => {});
  }, []);

  // Poll while detect job is running.
  useEffect(() => {
    if (!detectJob.running) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiFetch('/api/threads/detect-status');
        const job = await res.json();
        if (cancelled) return;
        setDetectJob(job);
        if (!job.running) {
          loadThreads();
        }
      } catch {}
    };
    const handle = setInterval(tick, 2000);
    tick();
    return () => { cancelled = true; clearInterval(handle); };
  }, [detectJob.running, loadThreads]);

  // Fetch active thread detail when selection changes.
  useEffect(() => {
    if (!activeThreadId) { setActiveThread(null); return; }
    let cancelled = false;
    setActiveLoading(true);
    apiFetch(`/api/threads/${activeThreadId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) { setActiveThread(data); setActiveLoading(false); } })
      .catch(() => { if (!cancelled) setActiveLoading(false); });
    return () => { cancelled = true; };
  }, [activeThreadId]);

  // Stop any in-flight TTS when the user navigates away or changes threads.
  useEffect(() => {
    return () => {
      cancelRef.current = true;
      stopSpeak(audioRef, cancelRef);
    };
  }, []);
  useEffect(() => {
    cancelRef.current = true;
    stopSpeak(audioRef, cancelRef);
    setSpeaking(false);
  }, [activeThreadId]);

  async function startDetect() {
    if (detectJob.running) return;
    try {
      await apiFetch('/api/threads/detect', { method: 'POST' });
      setDetectJob({ running: true, phase: 'detecting', done: 0, total: 0 });
    } catch {}
  }

  async function updateStatus(next) {
    if (!activeThread) return;
    const prev = activeThread.status;
    setActiveThread({ ...activeThread, status: next });
    setThreads((list) => list.map((x) => x.id === activeThread.id ? { ...x, status: next } : x));
    try {
      await apiFetch(`/api/threads/${activeThread.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
    } catch {
      setActiveThread((t0) => t0 ? { ...t0, status: prev } : t0);
    }
  }

  async function refreshInsight() {
    if (!activeThread || regeneratingInsight) return;
    setRegeneratingInsight(true);
    try {
      const res = await apiFetch(`/api/threads/${activeThread.id}/insight`, { method: 'POST' });
      const data = await res.json();
      setActiveThread((prev) => prev ? { ...prev, insight: data.insight || '' } : prev);
    } catch {}
    finally { setRegeneratingInsight(false); }
  }

  async function toggleSpeak() {
    if (speaking) {
      cancelRef.current = true;
      stopSpeak(audioRef, cancelRef);
      setSpeaking(false);
      return;
    }
    if (!activeThread?.insight?.trim()) return;
    cancelRef.current = false;
    setSpeaking(true);
    try {
      await streamSpeak(activeThread.insight, audioRef, cancelRef);
    } catch {}
    finally { setSpeaking(false); }
  }

  async function createCustom() {
    if (creatingCustom) return;
    const name = customName.trim();
    if (!name) return;
    setCreatingCustom(true);
    try {
      const res = await apiFetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: customDesc.trim() }),
      });
      const created = await res.json();
      setShowCustomForm(false);
      setCustomName('');
      setCustomDesc('');
      await loadThreads();
      if (created?.id) { setActiveThreadId(created.id); if (isMobile) setMobileView('detail'); }
    } catch {}
    finally { setCreatingCustom(false); }
  }

  async function rematchThread(threadId) {
    if (rematchingId) return;
    setRematchingId(threadId);
    try {
      await apiFetch(`/api/threads/${threadId}/rematch`, { method: 'POST' });
      await loadThreads();
      if (threadId === activeThreadId) {
        const r = await apiFetch(`/api/threads/${threadId}`);
        setActiveThread(await r.json());
      }
    } catch {}
    finally { setRematchingId(null); }
  }

  function beginEdit(threadId) {
    const th = threads.find((x) => x.id === threadId);
    if (!th) return;
    setEditingThread({ id: th.id, name: th.name || '', description: th.description || '' });
  }

  async function saveEdit() {
    if (!editingThread || savingEdit) return;
    const name = editingThread.name.trim();
    if (!name) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/api/threads/${editingThread.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: editingThread.description.trim() }),
      });
      setEditingThread(null);
      await loadThreads();
      if (editingThread.id === activeThreadId) {
        const r = await apiFetch(`/api/threads/${editingThread.id}`);
        setActiveThread(await r.json());
      }
    } catch {}
    finally { setSavingEdit(false); }
  }

  async function deleteThread(threadId) {
    if (!window.confirm(t('threads.confirmDelete') || 'Delete this thread?')) return;
    try {
      await apiFetch(`/api/threads/${threadId}`, { method: 'DELETE' });
      if (threadId === activeThreadId) {
        setActiveThreadId(null);
        setActiveThread(null);
      }
      await loadThreads();
    } catch {}
  }

  // Listen for thread-action events fired by the global SelectionMenu. This is
  // how the unified right-click popup (which owns the menu UI) calls back into
  // page-specific actions like rename / delete / regenerate.
  useEffect(() => {
    const onRematch = (e) => rematchThread(e.detail.threadId);
    const onEdit = (e) => beginEdit(e.detail.threadId);
    const onDelete = (e) => deleteThread(e.detail.threadId);
    window.addEventListener('liminal:thread-rematch', onRematch);
    window.addEventListener('liminal:thread-edit', onEdit);
    window.addEventListener('liminal:thread-delete', onDelete);
    return () => {
      window.removeEventListener('liminal:thread-rematch', onRematch);
      window.removeEventListener('liminal:thread-edit', onEdit);
      window.removeEventListener('liminal:thread-delete', onDelete);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, activeThreadId]);

  function navigateNode(node) {
    if (!node) return;
    if (node.type === 'entry' && onNavigateToEntry) onNavigateToEntry(node.id);
    else if (node.type === 'note' && onNavigateToNote) onNavigateToNote(node.id);
    else if (node.type === 'conversation' && onNavigateToOracle) onNavigateToOracle(node.id);
  }

  const grouped = useMemo(() => {
    const canonical = [];
    const novel = [];
    for (const th of threads) {
      if (th.kind === 'canonical') {
        // Canonical seeds are the user's expected core arcs — always visible,
        // even if thinly matched, so they don't vanish and can keep collecting
        // beads as new interactions land.
        canonical.push(th);
      } else {
        // Novel + custom threads stay hidden until they've accumulated at
        // least 2 beads. Below that, they exist in the DB (and new items can
        // still match into them) but don't clutter the list.
        if ((th.node_count || 0) >= 2) novel.push(th);
      }
    }
    return { canonical, novel };
  }, [threads]);

  const phaseLabel = useMemo(() => {
    if (!detectJob.running) return '';
    if (detectJob.phase === 'matching') {
      return `${t('threads.matching') || 'Matching items'} ${detectJob.done}/${detectJob.total}`;
    }
    if (detectJob.phase === 'generating-insights') {
      return `${t('threads.generatingInsights') || 'Generating insights'} ${detectJob.done}/${detectJob.total}`;
    }
    return t('threads.detecting') || 'Detecting themes…';
  }, [detectJob, t]);

  return (
    <div style={s.root} onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
      <aside style={{ ...s.sidebar, ...(isMobile ? { width: 'auto', flex: 1, minWidth: 0, borderRight: 'none', display: mobileView === 'list' ? 'flex' : 'none' } : {}) }}>
        <div data-tour-id="threads-intro" style={s.sidebarHeader}>
          <div style={s.sidebarTitle}>{t('threads.title') || 'Threads'}</div>
          <div style={s.sidebarTagline}>{t('threads.tagline') || 'The arcs weaving through your life'}</div>
        </div>
        <div style={s.detectRow}>
          <button
            data-tour-id="threads-rethread"
            style={{ ...s.detectBtn, ...(detectJob.running ? s.detectBtnDisabled : {}) }}
            onClick={startDetect}
            disabled={detectJob.running}
          >
            {detectJob.running ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span>{phaseLabel || '…'}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{formatElapsed(elapsed)}</span>
                <LoadingDots />
              </span>
            ) : (t('threads.reDetect') || 'Re-thread the Needle')}
          </button>
          {detectJob.running && detectJob.phase === 'matching' && detectJob.currentTheme && (
            <div style={s.detectStatus} title={detectJob.currentTheme}>
              {detectJob.currentTheme.length > 34 ? detectJob.currentTheme.slice(0, 34) + '…' : detectJob.currentTheme}
            </div>
          )}
          {detectJob.running && (
            <div style={{ ...s.detectStatus, fontStyle: 'italic', opacity: 0.8 }}>
              {t('threads.slowWarning') || 'This may take several minutes.'}
            </div>
          )}
        </div>
        <div style={s.list}>
          {loading ? null : (
            <>
              {grouped.canonical.length > 0 && (
                <>
                  <div style={s.sectionLabel}><span>{t('threads.sectionCore') || 'Core'}</span></div>
                  {grouped.canonical.map((thread) => (
                    <ThreadListItem
                      key={thread.id}
                      thread={thread}
                      active={thread.id === activeThreadId}
                      busy={rematchingId === thread.id}
                      onClick={() => mobileOpenThread(thread.id)}
                    />
                  ))}
                </>
              )}

              {(grouped.canonical.length > 0 || grouped.novel.length > 0) && <div style={s.sectionDivider} />}

              <div data-tour-id="threads-novel" style={s.sectionLabel}>
                <span>{t('threads.sectionNovel') || 'Novel'}</span>
                <button
                  data-tour-id="threads-add-novel"
                  style={s.addThreadBtn}
                  onClick={() => setShowCustomForm((v) => !v)}
                  title={t('threads.addCustom') || 'Add custom thread'}
                >+</button>
              </div>

              {showCustomForm && (
                <div style={s.customForm}>
                  <input
                    style={s.customInput}
                    placeholder={t('threads.customNamePlaceholder') || 'Thread name'}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    autoFocus
                  />
                  <input
                    style={s.customInput}
                    placeholder={t('threads.customDescPlaceholder') || 'One-line description (optional)'}
                    value={customDesc}
                    onChange={(e) => setCustomDesc(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && customName.trim()) createCustom(); }}
                  />
                  <div style={s.customActions}>
                    <button
                      style={s.customBtn}
                      onClick={() => { setShowCustomForm(false); setCustomName(''); setCustomDesc(''); }}
                    >{t('common.cancel') || 'Cancel'}</button>
                    <button
                      style={{ ...s.customBtn, ...s.customBtnPrimary, opacity: (creatingCustom || !customName.trim()) ? 0.5 : 1 }}
                      onClick={createCustom}
                      disabled={creatingCustom || !customName.trim()}
                    >{creatingCustom ? '…' : (t('threads.createAndMatch') || 'Create')}</button>
                  </div>
                </div>
              )}

              {grouped.novel.map((thread) => (
                <ThreadListItem
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeThreadId}
                  busy={rematchingId === thread.id}
                  onClick={() => setActiveThreadId(thread.id)}
                />
              ))}

              {grouped.novel.length === 0 && !showCustomForm && grouped.canonical.length > 0 && (
                <div style={{ padding: '6px 14px 12px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                  {t('threads.novelEmpty') || 'Run detection or add your own.'}
                </div>
              )}
            </>
          )}

          {!loading && threads.length === 0 && !detectJob.running && (
            <div style={{ padding: '16px', fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
              {totalItems < 5
                ? (t('threads.emptyEarly') || 'Threads appear as your journal grows. Write a few more entries and come back.')
                : (t('threads.emptyAfterRun') || 'No threads yet. Run detection to find the arcs in your work.')}
            </div>
          )}
        </div>
      </aside>

      <section style={{ ...s.detail, ...(isMobile && mobileView === 'list' ? { display: 'none' } : {}) }}>
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: 'var(--border-style)', flexShrink: 0 }}>
            <button
              onClick={() => setMobileView('list')}
              style={{ background: 'none', border: 'none', fontSize: '13px', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font)', padding: '4px 0' }}
            >
              ‹ {t('threads.title') || 'Threads'}
            </button>
          </div>
        )}
        {!activeThread ? (
          <div style={s.detailEmpty}>
            {threads.length === 0
              ? (totalItems < 5
                  ? (t('threads.emptyEarly') || 'Threads appear as your journal grows.')
                  : (t('threads.emptyAfterRun') || 'No threads detected yet. Re-detect to begin.'))
              : (t('common.loading') || 'Loading…')}
          </div>
        ) : (
          <div style={{ ...s.detailScroll, ...(isMobile ? { padding: '16px 16px 60px' } : {}) }}>
            <div style={s.detailHeader}>
              <div style={s.detailName}>{activeThread.name}</div>
              {activeThread.description && (
                <div style={s.detailDescription}>{activeThread.description}</div>
              )}
              <div style={s.detailMetaRow}>
                <select
                  value={activeThread.status}
                  onChange={(e) => updateStatus(e.target.value)}
                  style={s.statusSelect}
                >
                  <option value="active">{t('threads.status.active') || 'active'}</option>
                  <option value="resolving">{t('threads.status.resolving') || 'resolving'}</option>
                  <option value="complete">{t('threads.status.complete') || 'complete'}</option>
                </select>
                <span>
                  {(activeThread.nodes || []).length} items
                </span>
              </div>
            </div>

            <div style={s.section}>
              <div style={s.sectionHeading}>
                <span>{t('threads.insight.heading') || 'Insight'}</span>
                {activeThread.insight && (
                  <button onClick={toggleSpeak} style={{ ...s.iconBtn, display: 'inline-flex', alignItems: 'center', color: speaking ? 'var(--strong)' : 'var(--muted)' }} title={speaking ? (t('common.stop') || 'Stop') : (t('threads.insight.listen') || 'Listen')}>
                    <WaveformIcon playing={speaking} />
                  </button>
                )}
                <button onClick={refreshInsight} style={s.iconBtn} disabled={regeneratingInsight} title={t('threads.insight.refresh') || 'Refresh insight'}>
                  {regeneratingInsight ? '…' : '↻'}
                </button>
              </div>
              <div style={s.insightBody}>
                {activeLoading && !activeThread.insight ? (t('common.loading') || 'Loading…') :
                  activeThread.insight || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>}
              </div>
            </div>

            <div style={s.section}>
              <div style={s.sectionHeading}>Timeline</div>
              <div style={s.timeline}>
                {(activeThread.nodes || []).map((node) => (
                  <div
                    key={`${node.type}-${node.id}-${node.node_id}`}
                    style={s.timelineItem}
                    onClick={() => navigateNode(node)}
                  >
                    <div style={s.timelineRow}>
                      <NodeBadge type={node.type} t={t} />
                      <span style={s.timelineDate}>{formatDate(node.date)}</span>
                    </div>
                    <div style={s.timelineTitle}>{node.title || 'Untitled'}</div>
                    {node.excerpt && <div style={s.timelineExcerpt}>{node.excerpt}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {editingThread && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={() => !savingEdit && setEditingThread(null)}
        >
          <div
            style={{
              background: 'var(--white)', border: 'var(--border-style)', borderRadius: '10px',
              padding: '14px 14px 12px', minWidth: '320px', maxWidth: '420px',
              display: 'flex', flexDirection: 'column', gap: '8px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {t('common.edit') || 'Edit'}
            </div>
            <input
              style={s.customInput}
              placeholder={t('threads.customNamePlaceholder') || 'Thread name'}
              value={editingThread.name}
              onChange={(e) => setEditingThread((ed) => ({ ...ed, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && editingThread.name.trim()) saveEdit(); if (e.key === 'Escape') setEditingThread(null); }}
              autoFocus
            />
            <input
              style={s.customInput}
              placeholder={t('threads.customDescPlaceholder') || 'One-line description (optional)'}
              value={editingThread.description}
              onChange={(e) => setEditingThread((ed) => ({ ...ed, description: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && editingThread.name.trim()) saveEdit(); if (e.key === 'Escape') setEditingThread(null); }}
            />
            <div style={s.customActions}>
              <button style={s.customBtn} onClick={() => setEditingThread(null)} disabled={savingEdit}>
                {t('common.cancel') || 'Cancel'}
              </button>
              <button
                style={{ ...s.customBtn, ...s.customBtnPrimary, opacity: (savingEdit || !editingThread.name.trim()) ? 0.5 : 1 }}
                onClick={saveEdit}
                disabled={savingEdit || !editingThread.name.trim()}
              >
                {savingEdit ? '…' : (t('common.save') || 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ThreadListItem({ thread, active, onClick, busy }) {
  const [hover, setHover] = useState(false);
  const dot = STATUS_DOTS[thread.status] || STATUS_DOTS.active;
  const count = thread.node_count || 0;
  return (
    <div
      style={{
        ...s.listItem,
        ...(active ? s.listItemActive : hover ? { background: 'var(--panel-bg)' } : {}),
        opacity: busy ? 0.55 : 1,
      }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      data-thread-id={thread.id}
      data-thread-kind={thread.kind || ''}
    >
      <div style={s.listItemName}>{thread.name}</div>
      <div style={s.listItemCount}>
        <span style={{ color: 'var(--muted)' }}>{dot}</span>
        <span>{count} {count === 1 ? 'item' : 'items'}</span>
        {busy && <span style={{ fontStyle: 'italic' }}>· matching…</span>}
      </div>
    </div>
  );
}
