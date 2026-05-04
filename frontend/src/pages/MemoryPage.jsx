import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { clearArchetypeVoiceCache } from '../utils/ttsStream';
import { useLanguage } from '../i18n/LanguageContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { BUILT_IN_ARCHETYPES, isBuiltIn } from '../constants/archetypes';
import ArchetypeAvatar from '../components/ArchetypeAvatar';
import { confirmUploadRights } from '../utils/confirmUploadRights';
import { useFirstTourTrigger } from '../components/TutorialContext';

// Inline icons for memory item actions (modern replacements for ✎/★/×).
function PencilIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M10 4l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function StarIcon({ filled = false, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'}>
      <path d="M8 1.6l1.96 4 4.42.64-3.2 3.12.76 4.4L8 11.7l-3.94 2.06.76-4.4-3.2-3.12 4.42-.64L8 1.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2.5 4h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 4V2.6c0-.3.2-.6.5-.6h3c.3 0 .5.3.5.6V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3.5 4l.7 9.4c0 .3.3.6.6.6h6.4c.3 0 .6-.3.6-.6L12.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const SLIDER_AXES = [
  { key: 'slider_rational_spiritual',      lowKey: 'context.sliderRational',       highKey: 'context.sliderSpiritual' },
  { key: 'slider_gentle_direct',           lowKey: 'context.sliderGentle',         highKey: 'context.sliderDirect' },
  { key: 'slider_reflective_action',       lowKey: 'context.sliderReflective',     highKey: 'context.sliderAction' },
  { key: 'slider_light_deep',              lowKey: 'context.sliderLight',          highKey: 'context.sliderDeep',
    tieredHint: (v) => v < 30 ? 'Light touch — gentle observations, no reach for shadow or unconscious patterns'
                    : v > 70 ? 'Deep dive — shadow work, unconscious patterns, psychological depth'
                    : null },
  { key: 'slider_conversational_poetic',   lowKey: 'context.sliderConversational', highKey: 'context.sliderPoetic' },
  { key: 'slider_candor',                  lowKey: 'context.sliderAgreeable',      highKey: 'context.sliderCandid', hintKey: 'context.sliderCandidHint' },
];

const TABS = ['style', 'archetypes', 'memory'];

const s = {
  root: {
    flex: 1,
    overflowY: 'auto',
    padding: '40px 48px 80px',
    minWidth: 0,
  },
  pageTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '32px',
    fontWeight: 700,
    color: 'var(--strong)',
    marginBottom: '6px',
    lineHeight: 1.1,
  },
  pageSubtitle: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginBottom: '24px',
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '16px',
    paddingBottom: '6px',
    borderBottom: 'var(--border-style)',
  },
  input: {
    fontSize: '13px',
    padding: '8px 10px',
    border: 'var(--border-style)',
    borderRadius: '2px',
    background: 'var(--white)',
    fontFamily: 'var(--font)',
    color: 'var(--body)',
    outline: 'none',
  },
  btn: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '500',
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    fontFamily: 'var(--font)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
  memoryItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 14px',
    border: 'var(--border-style)',
    borderRadius: '16px',
    background: 'var(--panel-bg)',
  },
  memoryItemCore: {
    border: '1px solid #d4a843',
    background: 'rgba(212, 168, 67, 0.08)',
    boxShadow: '0 0 0 1px rgba(212, 168, 67, 0.25) inset',
  },
  coreBtn: {
    fontSize: '14px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: '1',
    flexShrink: 0,
    fontFamily: 'var(--font)',
    transition: 'transform 0.1s, color 0.1s',
  },
  coreMarker: {
    fontSize: '10px',
    color: '#a27c1e',
    background: 'rgba(212, 168, 67, 0.15)',
    border: '1px solid #d4a843',
    borderRadius: '2px',
    padding: '1px 5px',
    fontFamily: 'var(--font)',
    fontWeight: '600',
  },
  memoryContent: {
    flex: 1,
    fontSize: '13px',
    color: 'var(--body)',
    lineHeight: '1.6',
  },
  memoryMeta: {
    fontSize: '11px',
    color: 'var(--muted)',
    marginTop: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  memoryDelete: {
    fontSize: '16px',
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: '1',
    flexShrink: 0,
    fontFamily: 'var(--font)',
    opacity: 0.6,
    transition: 'opacity 0.1s',
  },
  memoryPin: {
    fontSize: '10px',
    color: 'var(--muted)',
    background: 'var(--near-white)',
    border: 'var(--border-style)',
    borderRadius: '2px',
    padding: '1px 5px',
    fontFamily: 'var(--font)',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '14px',
  },
  sliderLabel: {
    fontSize: '11px',
    color: 'var(--muted)',
    width: '110px',
    flexShrink: 0,
    textAlign: 'right',
  },
  sliderLabelRight: {
    textAlign: 'left',
  },
  slider: {
    flex: 1,
    accentColor: 'var(--strong)',
    cursor: 'pointer',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    marginBottom: '28px',
    borderBottom: 'var(--border-style)',
    paddingBottom: '0',
  },
  tab: {
    padding: '8px 16px',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'color 0.12s, border-color 0.12s',
    marginBottom: '-1px',
  },
  tabActive: {
    color: 'var(--strong)',
    borderBottomColor: 'var(--strong)',
  },
  // Archetype styles
  archCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    border: 'var(--border-style)',
    borderRadius: '16px',
    background: 'var(--white)',
    transition: 'box-shadow 0.12s',
  },
  archInfo: {
    flex: 1,
    minWidth: 0,
  },
  archName: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--strong)',
  },
  archDesc: {
    fontSize: '11px',
    color: 'var(--muted)',
    lineHeight: '1.5',
    marginTop: '2px',
  },
  voiceSelect: {
    fontSize: '11px',
    padding: '5px 8px',
    border: 'var(--border-style)',
    borderRadius: '12px',
    background: 'var(--white)',
    fontFamily: 'var(--font)',
    color: 'var(--body)',
    outline: 'none',
    cursor: 'pointer',
    maxWidth: '150px',
    flexShrink: 0,
  },
};

const TAB_LABELS = { style: 'context.responseStyle', archetypes: 'Archetypes', memory: 'context.memory' };

export default function MemoryPage({ onNavigateToPortrait }) {
  const { t } = useLanguage();
  useFirstTourTrigger('context');
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('style');
  // Tutorial steps fire 'liminal:set-context-tab' so the tour can walk the
  // user across all three tabs without them clicking each one manually.
  useEffect(() => {
    function onSetTab(e) {
      const next = e.detail;
      if (next && TABS.includes(next)) setTab(next);
    }
    window.addEventListener('liminal:set-context-tab', onSetTab);
    return () => window.removeEventListener('liminal:set-context-tab', onSetTab);
  }, []);
  // Demo memory injected into the list while the Memory tour walks the user
  // through edit / mark-as-core / delete on a real-looking row. Pure UI; never
  // hits the backend, never appears outside the tour.
  const [tutorialMockOn, setTutorialMockOn] = useState(false);
  useEffect(() => {
    function on(e) { setTutorialMockOn(!!e.detail); }
    function off() { setTutorialMockOn(false); }
    window.addEventListener('liminal:tutorial-memory-mock', on);
    window.addEventListener('liminal:tutorial-closed', off);
    return () => {
      window.removeEventListener('liminal:tutorial-memory-mock', on);
      window.removeEventListener('liminal:tutorial-closed', off);
    };
  }, []);
  const TUTORIAL_MOCK_MEMORY = {
    id: 'tutorial-mock',
    content: 'I write best in the morning, before the day fills up.',
    is_core: false,
    pinned: 1,
    created_at: new Date().toISOString(),
    effective_date: new Date().toISOString(),
  };
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [clearStep, setClearStep] = useState(null);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState('');
  const [reindexing, setReindexing] = useState(false);
  const [memorySearch, setMemorySearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [extractJob, setExtractJob] = useState({ running: false, done: 0, total: 0 });
  const [sliders, setSliders] = useState({});
  const [slidersSaved, setSlidersSaved] = useState(false);
  const [portrait, setPortrait] = useState(null);
  const [savingSliders, setSavingSliders] = useState(false);
  // Auto-save state. styleToast is the floating "Saved" pill (mirrors the
  // Settings page pattern). sliderSaveTimer debounces rapid drags so we don't
  // hammer /api/portrait once per pixel. slidersLoadedRef guards against the
  // initial fetch's setSliders call triggering a save.
  const [styleToast, setStyleToast] = useState('');
  const sliderSaveTimer = useRef(null);
  const slidersLoadedRef = useRef(false);
  const styleToastTimer = useRef(null);

  // Archetypes
  const [customArchetypes, setCustomArchetypes] = useState([]);
  const [editingArch, setEditingArch] = useState(null); // null | { name, prompt, color, isNew }
  const [savingArch, setSavingArch] = useState(false);
  const [archetypeVoices, setArchetypeVoices] = useState({}); // { archetypeName: voiceFilename }
  const [availableVoices, setAvailableVoices] = useState([]); // [{ filename, name }]

  useEffect(() => {
    function loadMemories() {
      apiFetch('/api/memories')
        .then((r) => r.json())
        .then((data) => { setMemories(data); setLoading(false); })
        .catch(() => setLoading(false));
    }
    loadMemories();
    // Refetch when SelectionMenu's "Save to memory" creates a new row.
    window.addEventListener('liminal:memories-changed', loadMemories);
    return () => window.removeEventListener('liminal:memories-changed', loadMemories);
  }, []);

  useEffect(() => {

    apiFetch('/api/portrait')
      .then((r) => r.json())
      .then((p) => {
        const vals = {};
        for (const { key } of SLIDER_AXES) vals[key] = p[key] ?? 50;
        vals.slider_sky_weight = p.slider_sky_weight ?? 50;
        vals.slider_portrait_weight = p.slider_portrait_weight ?? 50;
        vals.slider_friend_stranger = p.slider_friend_stranger ?? 30;
        vals.swearing_enabled = p.swearing_enabled ?? 0;
        vals.slider_swearing = p.slider_swearing ?? 0;
        vals.sexual_content_enabled = p.sexual_content_enabled ?? 0;
        setSliders(vals);
        // Mark as loaded AFTER state set, so the next user-driven setSlider
        // is the first one that triggers an auto-save.
        slidersLoadedRef.current = true;
        setPortrait(p);
        setCustomArchetypes(Array.isArray(p.custom_archetypes) ? p.custom_archetypes : []);
        setArchetypeVoices(p.archetype_voices || {});
      })
      .catch(() => {});

    apiFetch('/api/tts/voices')
      .then((r) => r.json())
      .then((voices) => setAvailableVoices(Array.isArray(voices) ? voices : []))
      .catch(() => {});
  }, []);

  // ── Per-archetype voice helpers ──
  async function setArchetypeVoice(name, voiceFilename) {
    const updated = { ...archetypeVoices };
    if (voiceFilename) updated[name] = voiceFilename;
    else delete updated[name];
    setArchetypeVoices(updated);
    try {
      await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype_voices: updated }),
      });
      clearArchetypeVoiceCache();
    } catch {}
  }

  // ── Slider helpers ──
  // Auto-save: every slider change schedules a debounced PUT. The "Save style"
  // button is gone — confirmation is the floating "Saved" pill at the bottom
  // right (same UX pattern as the Settings page).
  function setSlider(key, val) {
    setSliders((prev) => {
      const next = { ...prev, [key]: val };
      // Skip auto-save during initial portrait load.
      if (slidersLoadedRef.current) {
        if (sliderSaveTimer.current) clearTimeout(sliderSaveTimer.current);
        sliderSaveTimer.current = setTimeout(() => { autoSaveSliders(next); }, 600);
      }
      return next;
    });
    setSlidersSaved(false);
  }

  async function autoSaveSliders(snapshot) {
    setSavingSliders(true);
    try {
      await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      setSlidersSaved(true);
      setStyleToast(t('common.saved') || 'Saved');
      if (styleToastTimer.current) clearTimeout(styleToastTimer.current);
      styleToastTimer.current = setTimeout(() => setStyleToast(''), 1800);
    } catch {}
    finally { setSavingSliders(false); }
  }

  // ── Memory helpers ──
  async function addMemory() {
    if (!newText.trim() || adding) return;
    setAdding(true);
    try {
      const res = await apiFetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newText.trim() }),
      });
      const item = await res.json();
      setMemories((prev) => [item, ...prev]);
      setNewText('');
    } catch {}
    finally { setAdding(false); }
  }

  function startEdit(m) {
    if (m.id === 'tutorial-mock') return;
    setEditingId(m.id);
    setEditingText(m.content || '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText('');
  }

  async function saveEdit(id) {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const prev = memories.find((m) => m.id === id);
    if (prev && prev.content === trimmed) { cancelEdit(); return; }
    setMemories((list) => list.map((m) => (m.id === id ? { ...m, content: trimmed } : m)));
    setEditingId(null);
    setEditingText('');
    try {
      await apiFetch(`/api/memories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
    } catch {
      if (prev) setMemories((list) => list.map((m) => (m.id === id ? prev : m)));
    }
  }

  function memoryDate(m) {
    return m.effective_date || m.created_at || '';
  }

  function sortMemories(list) {
    return [...list].sort((a, b) => {
      if ((b.is_core ? 1 : 0) !== (a.is_core ? 1 : 0)) return (b.is_core ? 1 : 0) - (a.is_core ? 1 : 0);
      return memoryDate(b).localeCompare(memoryDate(a));
    });
  }

  async function toggleCore(id, currentValue) {
    if (id === 'tutorial-mock') return;
    const next = currentValue ? 0 : 1;
    setMemories((prev) => sortMemories(prev.map((m) => (m.id === id ? { ...m, is_core: next } : m))));
    try {
      await apiFetch(`/api/memories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_core: next }),
      });
    } catch {
      setMemories((prev) => sortMemories(prev.map((m) => (m.id === id ? { ...m, is_core: currentValue } : m))));
    }
  }

  async function deleteMemory(id) {
    if (id === 'tutorial-mock') return;
    setMemories((prev) => prev.filter((m) => m.id !== id));
    await apiFetch(`/api/memories/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function clearAutoMemories() {
    setMemories((prev) => prev.filter((m) => m.pinned));
    setClearStep(null);
    await apiFetch('/api/memories', { method: 'DELETE' }).catch(() => {});
  }

  async function clearAllMemories() {
    if (!clearPassword) return;
    setClearError('');
    try {
      const res = await apiFetch('/api/memories?all=true', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: clearPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setMemories([]);
        setClearStep(null);
        setClearPassword('');
      } else {
        setClearError(data.error || 'Failed');
      }
    } catch { setClearError('Failed'); }
  }

  function resetClear() { setClearStep(null); setClearPassword(''); setClearError(''); }

  async function reindex() {
    setReindexing(true);
    await apiFetch('/api/settings/reindex', { method: 'POST' }).catch(() => {});
    setTimeout(() => setReindexing(false), 2000);
  }

  // Kick off memory extraction across all entries and poll for progress.
  async function extractAllMemories() {
    try {
      const res = await apiFetch('/api/memories/extract-all', { method: 'POST' });
      const data = await res.json();
      if (data.total === 0) {
        setExtractJob({ running: false, done: 0, total: 0, note: 'All entries already processed' });
        return;
      }
      setExtractJob({ running: true, done: 0, total: data.total });
    } catch { /* polling will reflect any server-side error */ }
  }

  // Poll for extraction progress while a job is running. Reload memories when
  // it finishes so the new items appear in the list.
  useEffect(() => {
    if (!extractJob.running) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiFetch('/api/memories/extract-status');
        const s = await res.json();
        if (cancelled) return;
        setExtractJob((prev) => ({ ...prev, ...s }));
        if (!s.running) {
          apiFetch('/api/memories')
            .then((r) => r.json())
            .then((data) => !cancelled && setMemories(data))
            .catch(() => {});
        }
      } catch {}
    };
    const handle = setInterval(tick, 2000);
    tick();
    return () => { cancelled = true; clearInterval(handle); };
  }, [extractJob.running]);

  // On mount, check whether a previous extraction is still running (e.g. user
  // navigated away and back). Keeps the progress bar visible across nav.
  useEffect(() => {
    apiFetch('/api/memories/extract-status')
      .then((r) => r.json())
      .then((s) => { if (s?.running) setExtractJob(s); })
      .catch(() => {});
  }, []);

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── Archetype helpers ──
  async function saveCustomArchetypes(list) {
    setSavingArch(true);
    try {
      await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_archetypes: list }),
      });
      setCustomArchetypes(list);
    } catch {}
    finally { setSavingArch(false); }
  }

  function handleSaveArch() {
    if (!editingArch || !editingArch.name.trim()) return;
    const entry = {
      name: editingArch.name.trim(),
      prompt: editingArch.prompt.trim(),
      color: editingArch.color || '#888',
      image: editingArch.image || '',
    };
    let updated;
    if (editingArch.isNew) {
      updated = [...customArchetypes, entry];
    } else {
      updated = customArchetypes.map((a) => a.name === editingArch.originalName ? entry : a);
    }
    saveCustomArchetypes(updated);
    setEditingArch(null);
  }

  function handleDeleteArch(name) {
    saveCustomArchetypes(customArchetypes.filter((a) => a.name !== name));
    if (archetypeVoices[name]) setArchetypeVoice(name, '');
  }

  // Read a File, center-crop to a square, resize to 128px, return a JPEG data
  // URL. Keeps the portrait.custom_archetypes JSON blob small (~10-20KB/image).
  function resizeImageToDataUrl(file, size = 128) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.onload = () => {
          const srcSize = Math.min(img.width, img.height);
          const sx = (img.width - srcSize) / 2;
          const sy = (img.height - srcSize) / 2;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleArchImagePick(file) {
    if (!file || !editingArch) return;
    const allowed = await confirmUploadRights(t);
    if (!allowed) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, 128);
      setEditingArch({ ...editingArch, image: dataUrl });
    } catch {}
  }

  const pinnedCount = memories.filter((m) => m.pinned).length;
  const autoCount = memories.length - pinnedCount;

  if (loading) return <div style={{ ...s.root, fontSize: '13px', color: 'var(--muted)' }}>{t('common.loading')}</div>;

  return (
    <div style={{ ...s.root, ...(isMobile ? { padding: '24px 16px 80px' } : {}) }}>
      <div style={s.pageTitle}>{t('context.title')}</div>
      <div style={s.pageSubtitle}>{t('context.subtitle')}</div>

      {/* Tab bar */}
      <div style={s.tabBar} data-tour-id="context-tabs">
        {TABS.map((t_) => (
          <button
            key={t_}
            style={{ ...s.tab, ...(tab === t_ ? s.tabActive : {}) }}
            onClick={() => setTab(t_)}
          >
            {t(TAB_LABELS[t_])}
          </button>
        ))}
      </div>

      {/* Response Style tab */}
      {tab === 'style' && (
        <div data-tour-id="context-sliders">
          {SLIDER_AXES.map(({ key, lowKey, highKey, hintKey, tieredHint }) => {
            const val = sliders[key] ?? 50;
            const tieredText = tieredHint ? tieredHint(val) : null;
            return (
              <div key={key}>
                <div style={s.sliderRow}>
                  <span style={s.sliderLabel}>{t(lowKey)}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    style={s.slider}
                    value={val}
                    onChange={(e) => setSlider(key, Number(e.target.value))}
                  />
                  <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>{t(highKey)}</span>
                </div>
                {hintKey && val > 65 && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '-6px', marginBottom: '8px', paddingLeft: '122px', lineHeight: 1.4 }}>
                    {t(hintKey)}
                  </div>
                )}
                {tieredText && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '-6px', marginBottom: '8px', paddingLeft: '122px', lineHeight: 1.4 }}>
                    {tieredText}
                  </div>
                )}
              </div>
            );
          })}
          {/* Friend / Stranger slider */}
          <div style={{ marginBottom: '20px' }}>
            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>{t('context.sliderFriend')}</span>
              <input
                type="range"
                min="0"
                max="100"
                style={s.slider}
                value={sliders.slider_friend_stranger ?? 30}
                onChange={(e) => setSlider('slider_friend_stranger', Number(e.target.value))}
              />
              <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>{t('context.sliderStranger')}</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', paddingLeft: '122px' }}>
              {(sliders.slider_friend_stranger ?? 30) < 25
                ? 'Close friend — casual, blunt, calls you out, knows you'
                : (sliders.slider_friend_stranger ?? 30) > 75
                  ? 'Professional guide — measured, considered, wise distance'
                  : 'Trusted friend — warm and direct, not clinical'}
            </div>
          </div>

          {/* Woo Woo section */}
          <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: '28px', marginBottom: '16px' }}>
            Woo Woo
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>{t('context.sliderWooOff')}</span>
              <input
                type="range"
                min="0"
                max="100"
                style={s.slider}
                value={sliders.slider_portrait_weight ?? 50}
                onChange={(e) => setSlider('slider_portrait_weight', Number(e.target.value))}
              />
              <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>{t('context.sliderWooFull')}</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', paddingLeft: '122px' }}>
              Portrait weight — how much your MBTI, enneagram, birth chart, and profile shape responses
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>{t('context.sliderSkyOff')}</span>
              <input
                type="range"
                min="0"
                max="100"
                style={s.slider}
                value={sliders.slider_sky_weight ?? 50}
                onChange={(e) => setSlider('slider_sky_weight', Number(e.target.value))}
              />
              <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>{t('context.sliderSkyFull')}</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', paddingLeft: '122px' }}>
              Sky weight — how much moon phase, planetary positions, and retrogrades colour reflections
            </div>
          </div>

          {/* Over 18 section — only renders when a verified DOB puts the user at 18+.
              Otherwise we surface a compact link to Portrait so they can set their
              birth date and unlock these response-style controls. */}
          {(() => {
            const bd = portrait?.birth_date;
            let isOver18 = false;
            if (bd) {
              const parts = bd.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
              const iso = bd.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
              let birthDate = null;
              if (parts) birthDate = new Date(parts[3], parts[2] - 1, parts[1]);
              else if (iso) birthDate = new Date(iso[1], iso[2] - 1, iso[3]);
              if (birthDate) isOver18 = (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000) >= 18;
            }

            if (!isOver18) return (
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', marginTop: '28px', marginBottom: '20px' }}>
                Age must be 18+ for additional response controls.{' '}
                {onNavigateToPortrait ? (
                  <button
                    type="button"
                    onClick={onNavigateToPortrait}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--body)', textDecoration: 'underline', cursor: 'pointer', fontStyle: 'italic', fontSize: 'inherit', fontFamily: 'inherit' }}
                  >
                    Set your birth date in Portrait →
                  </button>
                ) : 'Set your birth date in Portrait.'}
              </div>
            );

            return (
              <>
                <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: '28px', marginBottom: '16px' }}>
                  Over 18
                </div>
                {/* Swearing — collapsed from a 4-tier slider to a checkbox.
                    The model's RLHF training caps profanity in reflection
                    contexts; the four tiers produced almost identical output
                    in practice. Checkbox writes 60 ("heavy" tier) when on,
                    0 when off — the backend prompt logic is unchanged. */}
                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--body)' }}>
                    <input
                      type="checkbox"
                      checked={(sliders.slider_swearing ?? 0) > 0}
                      onChange={(e) => setSlider('slider_swearing', e.target.checked ? 60 : 0)}
                      style={{ width: 16, height: 16, accentColor: 'var(--body)' }}
                    />
                    Swearing
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Allows profanity where natural ("shit", "fuck", "damn")
                  </span>
                </div>

                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--body)' }}>
                    <input
                      type="checkbox"
                      checked={!!sliders.sexual_content_enabled}
                      onChange={(e) => setSlider('sexual_content_enabled', e.target.checked ? 1 : 0)}
                      style={{ width: 16, height: 16, accentColor: 'var(--body)' }}
                    />
                    Sexual content
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Allows frank discussion of sexuality, intimacy, and desire
                  </span>
                </div>
              </>
            );
          })()}

          {/* Save button removed — sliders auto-save with a debounced PUT and
              confirm via the floating toast at the bottom-right of the page. */}
        </div>
      )}

      {/* Archetypes tab */}
      {tab === 'archetypes' && (
        <div data-tour-id="context-archetypes">
          {/* Built-in archetypes */}
          <div style={s.sectionTitle}>Built-in</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
            {BUILT_IN_ARCHETYPES.filter(a => a.value !== 'Auto').map((arch, idx) => (
              <div key={arch.value} style={{ ...s.archCard, ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch', gap: '10px' } : {}) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                  <ArchetypeAvatar archetype={arch} size={36} color={arch.color} />
                  <div style={s.archInfo}>
                    <div style={s.archName}>{arch.value}</div>
                    <div style={s.archDesc}>{arch.description}</div>
                  </div>
                </div>
                <select
                  data-tour-id={idx === 0 ? 'archetype-voice' : undefined}
                  style={{ ...s.voiceSelect, ...(isMobile ? { maxWidth: 'none' } : {}) }}
                  value={archetypeVoices[arch.value] || ''}
                  onChange={(e) => setArchetypeVoice(arch.value, e.target.value)}
                  title="Voice for this archetype"
                >
                  <option value="">System default</option>
                  {availableVoices.map((v) => (
                    <option key={v.filename} value={v.filename}>{v.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Custom archetypes */}
          <div style={s.sectionTitle}>Custom</div>

          {customArchetypes.length === 0 && !editingArch && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', padding: '16px 0', textAlign: 'center' }}>
              No custom archetypes yet. Create one to use across all of Liminal.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {customArchetypes.map((arch) => (
              <div key={arch.name} style={{ ...s.archCard, ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch', gap: '10px' } : {}) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                  <ArchetypeAvatar archetype={{ value: arch.name, color: arch.color, image: arch.image }} size={36} color={arch.color} />
                  <div style={s.archInfo}>
                    <div style={s.archName}>{arch.name}</div>
                    <div style={s.archDesc}>{arch.prompt || 'No custom prompt'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, ...(isMobile ? { justifyContent: 'flex-end', flexWrap: 'wrap' } : {}) }}>
                  <select
                    style={{ ...s.voiceSelect, ...(isMobile ? { flex: 1, maxWidth: 'none' } : {}) }}
                    value={archetypeVoices[arch.name] || ''}
                    onChange={(e) => setArchetypeVoice(arch.name, e.target.value)}
                    title="Voice for this archetype"
                  >
                    <option value="">System default</option>
                    {availableVoices.map((v) => (
                      <option key={v.filename} value={v.filename}>{v.name}</option>
                    ))}
                  </select>
                  <button
                    style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '12px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                    onClick={() => setEditingArch({ ...arch, originalName: arch.name, isNew: false })}
                  >
                    Edit
                  </button>
                  <button
                    style={{ fontSize: '11px', color: '#b33', background: 'none', border: '1px solid #e0c0be', borderRadius: '12px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                    onClick={() => handleDeleteArch(arch.name)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Create / Edit form */}
          {editingArch ? (
            <div style={{ padding: '18px', border: 'var(--border-style)', borderRadius: '16px', background: 'var(--near-white)' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--strong)', marginBottom: '14px' }}>
                {editingArch.isNew ? 'New Archetype' : `Editing: ${editingArch.originalName}`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ArchetypeAvatar
                    archetype={{ value: editingArch.name || '?', color: editingArch.color, image: editingArch.image }}
                    size={56}
                    color={editingArch.color || '#888'}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '12px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)', display: 'inline-block' }}>
                      {editingArch.image ? 'Change image' : 'Upload image'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => handleArchImagePick(e.target.files?.[0])}
                      />
                    </label>
                    {editingArch.image && (
                      <button
                        type="button"
                        style={{ fontSize: '11px', color: '#b33', background: 'none', border: '1px solid #e0c0be', borderRadius: '12px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                        onClick={() => setEditingArch({ ...editingArch, image: '' })}
                      >
                        Remove image
                      </button>
                    )}
                    <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.5, maxWidth: '300px' }}>
                      {t('uploadRights.helper')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    style={{ ...s.input, flex: 1 }}
                    placeholder="Name (e.g. My Therapist)"
                    value={editingArch.name}
                    onChange={(e) => setEditingArch({ ...editingArch, name: e.target.value })}
                    autoFocus
                  />
                  <input
                    type="color"
                    value={editingArch.color || '#888888'}
                    onChange={(e) => setEditingArch({ ...editingArch, color: e.target.value })}
                    style={{ width: '36px', height: '36px', border: 'var(--border-style)', borderRadius: '4px', padding: '2px', cursor: 'pointer' }}
                    title="Pick a color"
                  />
                </div>
                <textarea
                  style={{ ...s.input, minHeight: '100px', resize: 'vertical', lineHeight: '1.6' }}
                  placeholder="Describe how this archetype should respond. This is the system prompt that defines their personality, tone, and perspective. For example: 'You are a warm, direct therapist who focuses on cognitive behavioral techniques...'"
                  value={editingArch.prompt}
                  onChange={(e) => setEditingArch({ ...editingArch, prompt: e.target.value })}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', opacity: !editingArch.name.trim() || savingArch ? 0.5 : 1 }}
                    onClick={handleSaveArch}
                    disabled={!editingArch.name.trim() || savingArch}
                  >
                    {savingArch ? t('common.saving') : 'Save'}
                  </button>
                  <button
                    style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                    onClick={() => setEditingArch(null)}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              data-tour-id="context-create-archetype"
              style={{ ...s.btn, padding: '8px 18px', fontSize: '12px' }}
              onClick={() => setEditingArch({ name: '', prompt: '', color: '#888', isNew: true })}
            >
              + Create Archetype
            </button>
          )}
        </div>
      )}

      {/* Memory tab */}
      {tab === 'memory' && (
        <div data-tour-id="context-memory">
          {/* Manual add + search */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              data-tour-id="memory-add-input"
              style={{ ...s.input, flex: 1 }}
              placeholder={t('context.addPlaceholder')}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMemory()}
            />
            <button
              data-tour-id="memory-add-btn"
              style={{ ...s.btn, opacity: adding || !newText.trim() ? 0.5 : 1 }}
              onClick={addMemory}
              disabled={adding || !newText.trim()}
            >
              {adding ? t('context.adding') : t('context.add')}
            </button>
            <input
              data-tour-id="memory-search"
              style={{ ...s.input, width: '180px' }}
              placeholder={t('common.search')}
              value={memorySearch}
              onChange={(e) => setMemorySearch(e.target.value)}
            />
          </div>

          {(() => {
            const q = memorySearch.trim().toLowerCase();
            const baseList = tutorialMockOn ? [TUTORIAL_MOCK_MEMORY, ...memories] : memories;
            const filtered = q
              ? baseList.filter((m) => (m.content || '').toLowerCase().includes(q))
              : baseList;

            // Age gradient across non-core memories: newest = fresh teal,
            // oldest = faded gray. Core memories keep their gold styling
            // and are excluded from the range calc. Use effective_date so
            // memories inherit the age of the entry they were extracted from.
            const nonCoreTimes = memories
              .filter((m) => !m.is_core && memoryDate(m))
              .map((m) => new Date(memoryDate(m)).getTime());
            const newestTs = nonCoreTimes.length ? Math.max(...nonCoreTimes) : 0;
            const oldestTs = nonCoreTimes.length ? Math.min(...nonCoreTimes) : 0;
            const range = Math.max(1, newestTs - oldestTs);

            function gradientStyle(createdAt) {
              if (!createdAt || !nonCoreTimes.length) return {};
              const ts = new Date(createdAt).getTime();
              const tt = Math.min(1, Math.max(0, (newestTs - ts) / range));
              // Wide hue sweep so the gradient reads as distinct bands:
              // teal (165) → blue (210) → indigo (255) → violet (290) → grey (320/low-sat).
              const hue = 165 + tt * 155;
              const sat = 65 - tt * 55;
              const light = 48 + tt * 32;
              return {
                border: `1px solid hsl(${hue}, ${sat}%, ${light}%)`,
                background: `hsla(${hue}, ${sat}%, ${light}%, 0.09)`,
              };
            }
          return (<>
          {/* Memory list */}
          {filtered.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', padding: '24px 0', textAlign: 'center' }}>
              {q ? t('journal.noMatch') : t('context.noMemories')}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '24px',
              maxHeight: '55vh',
              overflowY: 'auto',
              padding: '8px',
              border: 'var(--border-style)',
              borderRadius: '12px',
              background: 'var(--near-white)',
            }}>
              {filtered.map((m) => {
                const isEditing = editingId === m.id;
                return (
                <div key={m.id} data-tour-id={m.id === 'tutorial-mock' ? 'memory-row' : undefined} style={{ ...s.memoryItem, ...(m.is_core ? s.memoryItemCore : gradientStyle(memoryDate(m))) }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <textarea
                        style={{ ...s.input, width: '100%', minHeight: '60px', resize: 'vertical', lineHeight: '1.5', fontSize: '13px' }}
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') cancelEdit();
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(m.id);
                        }}
                        autoFocus
                      />
                    ) : (
                      <div
                        style={{ ...s.memoryContent, cursor: 'text' }}
                        onDoubleClick={() => startEdit(m)}
                        title="Double-click to edit"
                      >
                        {m.content}
                      </div>
                    )}
                    <div style={s.memoryMeta}>
                      {m.is_core ? <span style={s.coreMarker}>CORE</span> : null}
                      {m.pinned ? <span style={s.memoryPin}>{t('context.pinned')}</span> : null}
                      <span>{formatDate(memoryDate(m))}</span>
                      {isEditing && (
                        <>
                          <button
                            style={{ fontSize: '11px', color: 'var(--strong)', background: 'none', border: 'var(--border-style)', borderRadius: '10px', padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                            onClick={() => saveEdit(m.id)}
                          >
                            Save
                          </button>
                          <button
                            style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '10px', padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                            onClick={cancelEdit}
                          >
                            {t('common.cancel')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {!isEditing && (
                    <>
                      <button
                        data-tour-id={m.id === 'tutorial-mock' ? 'memory-edit' : undefined}
                        style={{ ...s.memoryDelete, fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                        onClick={() => startEdit(m)}
                        title="Edit memory"
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6; }}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        data-tour-id={m.id === 'tutorial-mock' ? 'memory-core' : undefined}
                        style={{ ...s.coreBtn, color: m.is_core ? '#d4a843' : 'var(--muted)', opacity: m.is_core ? 1 : 0.55, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                        onClick={() => toggleCore(m.id, m.is_core)}
                        title={m.is_core ? 'Unmark as core memory' : 'Mark as core memory (keeps full weight regardless of age)'}
                        onMouseEnter={(e) => { if (!m.is_core) e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={(e) => { if (!m.is_core) e.currentTarget.style.opacity = 0.55; }}
                      >
                        <StarIcon filled={!!m.is_core} />
                      </button>
                      <button
                        style={{ ...s.memoryDelete, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                        onClick={() => deleteMemory(m.id)}
                        title={t('context.removeMemory')}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6; }}
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
                );
              })}
            </div>
          )}
          </>);
          })()}

          {/* Footer: count */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: 'var(--border-style)', paddingTop: '16px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {t('context.memoryCount', { total: memories.length, pinned: pinnedCount, auto: autoCount })}
            </div>
          </div>

          {clearStep === 'choose' && (
            <div style={{ marginTop: '12px', padding: '14px', border: 'var(--border-style)', borderRadius: '2px', background: 'var(--near-white)' }}>
              <div style={{ fontSize: '12px', color: 'var(--body)', marginBottom: '10px' }}>
                {t('context.clearPrompt')}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', background: 'var(--body)' }}
                  onClick={clearAutoMemories}
                >
                  {t('context.clearAutoOnly')}
                </button>
                <button
                  style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', background: '#b33' }}
                  onClick={() => setClearStep('password')}
                >
                  {t('context.clearAll')}
                </button>
                <button
                  style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  onClick={resetClear}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {clearStep === 'password' && (
            <div style={{ marginTop: '12px', padding: '14px', border: 'var(--border-style)', borderRadius: '2px', background: 'var(--near-white)' }}>
              <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px', fontWeight: '500' }}>
                {t('context.clearPasswordPrompt')}
              </div>
              {clearError && <div style={{ fontSize: '11px', color: '#c0392b', marginBottom: '8px' }}>{clearError}</div>}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="password"
                  style={{ ...s.input, flex: 1, borderColor: '#e0c0be' }}
                  placeholder={t('settings.password')}
                  value={clearPassword}
                  onChange={(e) => setClearPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && clearAllMemories()}
                  autoFocus
                />
                <button
                  style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', background: '#b33', opacity: !clearPassword ? 0.5 : 1 }}
                  onClick={clearAllMemories}
                  disabled={!clearPassword}
                >
                  {t('common.delete')}
                </button>
                <button
                  style={{ fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'var(--border-style)', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font)' }}
                  onClick={resetClear}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Maintenance */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: 'var(--border-style)' }} data-tour-id="memory-maintenance">
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '10px' }}>
              {t('context.reindexDesc')}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                data-tour-id="memory-reindex"
                style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', background: 'var(--body)', opacity: reindexing ? 0.5 : 1 }}
                onClick={reindex}
                disabled={reindexing}
              >
                {reindexing ? t('context.reindexing') : t('context.reindex')}
              </button>
              <button
                data-tour-id="memory-extract"
                style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', background: 'var(--body)', opacity: extractJob.running ? 0.5 : 1 }}
                onClick={extractAllMemories}
                disabled={extractJob.running}
                title="Run LLM memory extraction across every journal entry. Slow — expect several minutes."
              >
                {extractJob.running
                  ? `Extracting… ${extractJob.done}/${extractJob.total}`
                  : 'Extract memories from entries'}
              </button>
              {!clearStep && (
                <button
                  data-tour-id="memory-delete-all"
                  style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', background: '#b33', opacity: memories.length === 0 ? 0.5 : 1 }}
                  onClick={() => setClearStep('choose')}
                  disabled={memories.length === 0}
                >
                  {t('context.deleteAll')}
                </button>
              )}
            </div>
            {extractJob.running && extractJob.total > 0 && (
              <div style={{ marginTop: '10px', height: '4px', background: 'var(--near-white)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round((extractJob.done / extractJob.total) * 100)}%`,
                  background: 'var(--strong)',
                  transition: 'width 0.3s',
                }} />
              </div>
            )}
            {!extractJob.running && extractJob.finishedAt && extractJob.total > 0 && (
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)' }}>
                Finished — processed {extractJob.done} {extractJob.done === 1 ? 'entry' : 'entries'}.
              </div>
            )}
            {!extractJob.running && extractJob.note && (
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)' }}>
                {extractJob.note}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating "Saved" toast — same visual as the Settings page. */}
      {styleToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '10px 18px',
          background: 'var(--strong)',
          color: 'var(--white)',
          borderRadius: '10px',
          fontSize: '13px',
          zIndex: 9999,
          pointerEvents: 'none',
          transition: 'opacity 0.3s',
        }}>{styleToast}</div>
      )}
    </div>
  );
}
