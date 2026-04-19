import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { clearArchetypeVoiceCache } from '../utils/ttsStream';
import { useLanguage } from '../i18n/LanguageContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { BUILT_IN_ARCHETYPES, isBuiltIn } from '../constants/archetypes';
import ArchetypeAvatar from '../components/ArchetypeAvatar';
import { confirmUploadRights } from '../utils/confirmUploadRights';

const SLIDER_AXES = [
  { key: 'slider_rational_spiritual',      lowKey: 'context.sliderRational',       highKey: 'context.sliderSpiritual' },
  { key: 'slider_gentle_direct',           lowKey: 'context.sliderGentle',         highKey: 'context.sliderDirect' },
  { key: 'slider_reflective_action',       lowKey: 'context.sliderReflective',     highKey: 'context.sliderAction' },
  { key: 'slider_light_deep',              lowKey: 'context.sliderLight',          highKey: 'context.sliderDeep' },
  { key: 'slider_conversational_poetic',   lowKey: 'context.sliderConversational', highKey: 'context.sliderPoetic' },
  { key: 'slider_encouraging_challenging', lowKey: 'context.sliderEncouraging',    highKey: 'context.sliderChallenging' },
  { key: 'slider_candor',                  lowKey: 'context.sliderAgreeable',      highKey: 'context.sliderCandid', hintKey: 'context.sliderCandidHint' },
  { key: 'slider_character_influence',     lowKey: 'context.sliderSubtle',         highKey: 'context.sliderFullCharacter' },
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
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('style');
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
  function setSlider(key, val) {
    setSliders((prev) => ({ ...prev, [key]: val }));
    setSlidersSaved(false);
  }

  async function saveSliders() {
    setSavingSliders(true);
    try {
      await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sliders),
      });
      setSlidersSaved(true);
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
      <div style={s.tabBar}>
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
        <>
          {SLIDER_AXES.map(({ key, lowKey, highKey, hintKey }) => (
            <div key={key}>
              <div style={s.sliderRow}>
                <span style={s.sliderLabel}>{t(lowKey)}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={s.slider}
                  value={sliders[key] ?? 50}
                  onChange={(e) => setSlider(key, Number(e.target.value))}
                />
                <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>{t(highKey)}</span>
              </div>
              {hintKey && (sliders[key] ?? 50) > 65 && (
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '-6px', marginBottom: '8px', paddingLeft: '2px', lineHeight: 1.4 }}>
                  {t(hintKey)}
                </div>
              )}
            </div>
          ))}
          {/* Friend / Stranger slider */}
          <div style={{ marginBottom: '20px' }}>
            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>Friend</span>
              <input
                type="range"
                min="0"
                max="100"
                style={s.slider}
                value={sliders.slider_friend_stranger ?? 30}
                onChange={(e) => setSlider('slider_friend_stranger', Number(e.target.value))}
              />
              <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>Stranger</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', paddingLeft: '2px' }}>
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
              <span style={s.sliderLabel}>Off</span>
              <input
                type="range"
                min="0"
                max="100"
                style={s.slider}
                value={sliders.slider_portrait_weight ?? 50}
                onChange={(e) => setSlider('slider_portrait_weight', Number(e.target.value))}
              />
              <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>Full</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', paddingLeft: '2px' }}>
              Portrait weight — how much your MBTI, enneagram, birth chart, and profile shape responses
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={s.sliderRow}>
              <span style={s.sliderLabel}>Off</span>
              <input
                type="range"
                min="0"
                max="100"
                style={s.slider}
                value={sliders.slider_sky_weight ?? 50}
                onChange={(e) => setSlider('slider_sky_weight', Number(e.target.value))}
              />
              <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>Full</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', paddingLeft: '2px' }}>
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
                <div style={{ marginBottom: '20px' }}>
                  <div style={s.sliderRow}>
                    <span style={s.sliderLabel}>None</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      style={s.slider}
                      value={sliders.slider_swearing ?? 0}
                      onChange={(e) => setSlider('slider_swearing', Number(e.target.value))}
                    />
                    <span style={{ ...s.sliderLabel, ...s.sliderLabelRight }}>Heavy</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', paddingLeft: '2px' }}>
                    {(sliders.slider_swearing ?? 0) === 0
                      ? 'Swearing — off'
                      : (sliders.slider_swearing ?? 0) < 30
                        ? 'Swearing — mild ("damn", "hell", "crap")'
                        : (sliders.slider_swearing ?? 0) < 60
                          ? 'Swearing — moderate ("shit", "fuck" where natural)'
                          : 'Swearing — heavy (unrestricted, matches your energy)'}
                  </div>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
            <button
              style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', opacity: savingSliders ? 0.5 : 1 }}
              onClick={saveSliders}
              disabled={savingSliders}
            >
              {savingSliders ? t('common.saving') : t('context.saveStyle')}
            </button>
            {slidersSaved && <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>{t('common.saved')}</span>}
          </div>
        </>
      )}

      {/* Archetypes tab */}
      {tab === 'archetypes' && (
        <>
          {/* Built-in archetypes */}
          <div style={s.sectionTitle}>Built-in</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
            {BUILT_IN_ARCHETYPES.filter(a => a.value !== 'Auto').map((arch) => (
              <div key={arch.value} style={s.archCard}>
                <ArchetypeAvatar archetype={arch} size={36} color={arch.color} />
                <div style={s.archInfo}>
                  <div style={s.archName}>{arch.value}</div>
                  <div style={s.archDesc}>{arch.description}</div>
                </div>
                <select
                  style={s.voiceSelect}
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
              <div key={arch.name} style={s.archCard}>
                <ArchetypeAvatar archetype={{ value: arch.name, color: arch.color, image: arch.image }} size={36} color={arch.color} />
                <div style={s.archInfo}>
                  <div style={s.archName}>{arch.name}</div>
                  <div style={s.archDesc}>{arch.prompt || 'No custom prompt'}</div>
                </div>
                <select
                  style={s.voiceSelect}
                  value={archetypeVoices[arch.name] || ''}
                  onChange={(e) => setArchetypeVoice(arch.name, e.target.value)}
                  title="Voice for this archetype"
                >
                  <option value="">System default</option>
                  {availableVoices.map((v) => (
                    <option key={v.filename} value={v.filename}>{v.name}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
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
              style={{ ...s.btn, padding: '8px 18px', fontSize: '12px' }}
              onClick={() => setEditingArch({ name: '', prompt: '', color: '#888', isNew: true })}
            >
              + Create Archetype
            </button>
          )}
        </>
      )}

      {/* Memory tab */}
      {tab === 'memory' && (
        <>
          {/* Manual add + search */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder={t('context.addPlaceholder')}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMemory()}
            />
            <button
              style={{ ...s.btn, opacity: adding || !newText.trim() ? 0.5 : 1 }}
              onClick={addMemory}
              disabled={adding || !newText.trim()}
            >
              {adding ? t('context.adding') : t('context.add')}
            </button>
            <input
              style={{ ...s.input, width: '180px' }}
              placeholder={t('common.search')}
              value={memorySearch}
              onChange={(e) => setMemorySearch(e.target.value)}
            />
          </div>

          {(() => {
            const q = memorySearch.trim().toLowerCase();
            const filtered = q
              ? memories.filter((m) => (m.content || '').toLowerCase().includes(q))
              : memories;

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
                <div key={m.id} style={{ ...s.memoryItem, ...(m.is_core ? s.memoryItemCore : gradientStyle(memoryDate(m))) }}>
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
                        style={{ ...s.memoryDelete, fontSize: '13px' }}
                        onClick={() => startEdit(m)}
                        title="Edit memory"
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6; }}
                      >
                        ✎
                      </button>
                      <button
                        style={{ ...s.coreBtn, color: m.is_core ? '#d4a843' : 'var(--muted)', opacity: m.is_core ? 1 : 0.5 }}
                        onClick={() => toggleCore(m.id, m.is_core)}
                        title={m.is_core ? 'Unmark as core memory' : 'Mark as core memory (keeps full weight regardless of age)'}
                        onMouseEnter={(e) => { if (!m.is_core) e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={(e) => { if (!m.is_core) e.currentTarget.style.opacity = 0.5; }}
                      >
                        {m.is_core ? '★' : '☆'}
                      </button>
                      <button
                        style={s.memoryDelete}
                        onClick={() => deleteMemory(m.id)}
                        title={t('context.removeMemory')}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6; }}
                      >
                        ×
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
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: 'var(--border-style)' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '10px' }}>
              {t('context.reindexDesc')}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', background: 'var(--body)', opacity: reindexing ? 0.5 : 1 }}
                onClick={reindex}
                disabled={reindexing}
              >
                {reindexing ? t('context.reindexing') : t('context.reindex')}
              </button>
              <button
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
        </>
      )}
    </div>
  );
}
