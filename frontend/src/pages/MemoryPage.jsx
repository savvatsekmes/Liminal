import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';
import { BUILT_IN_ARCHETYPES, isBuiltIn } from '../constants/archetypes';
import ArchetypeAvatar from '../components/ArchetypeAvatar';

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
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--strong)',
    marginBottom: '6px',
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
};

const TAB_LABELS = { style: 'context.responseStyle', archetypes: 'context.archetypes', memory: 'context.memory' };

export default function MemoryPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState('style');
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [clearStep, setClearStep] = useState(null);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState('');
  const [reindexing, setReindexing] = useState(false);
  const [sliders, setSliders] = useState({});
  const [slidersSaved, setSlidersSaved] = useState(false);
  const [savingSliders, setSavingSliders] = useState(false);

  // Archetypes
  const [customArchetypes, setCustomArchetypes] = useState([]);
  const [editingArch, setEditingArch] = useState(null); // null | { name, prompt, color, isNew }
  const [savingArch, setSavingArch] = useState(false);

  useEffect(() => {
    apiFetch('/api/memories')
      .then((r) => r.json())
      .then((data) => { setMemories(data); setLoading(false); })
      .catch(() => setLoading(false));

    apiFetch('/api/portrait')
      .then((r) => r.json())
      .then((p) => {
        const vals = {};
        for (const { key } of SLIDER_AXES) vals[key] = p[key] ?? 50;
        setSliders(vals);
        setCustomArchetypes(p.custom_archetypes || []);
      })
      .catch(() => {});
  }, []);

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
    const entry = { name: editingArch.name.trim(), prompt: editingArch.prompt.trim(), color: editingArch.color || '#888' };
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
  }

  const pinnedCount = memories.filter((m) => m.pinned).length;
  const autoCount = memories.length - pinnedCount;

  if (loading) return <div style={{ ...s.root, fontSize: '13px', color: 'var(--muted)' }}>{t('common.loading')}</div>;

  return (
    <div style={s.root}>
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
                <ArchetypeAvatar archetype={{ value: arch.name, color: arch.color }} size={36} color={arch.color} />
                <div style={s.archInfo}>
                  <div style={s.archName}>{arch.name}</div>
                  <div style={s.archDesc}>{arch.prompt || 'No custom prompt'}</div>
                </div>
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
          {/* Manual add */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
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
          </div>

          {/* Memory list */}
          {memories.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', padding: '24px 0', textAlign: 'center' }}>
              {t('context.noMemories')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              {memories.map((m) => (
                <div key={m.id} style={s.memoryItem}>
                  <div style={{ flex: 1 }}>
                    <div style={s.memoryContent}>{m.content}</div>
                    <div style={s.memoryMeta}>
                      {m.pinned ? <span style={s.memoryPin}>{t('context.pinned')}</span> : null}
                      <span>{formatDate(m.created_at)}</span>
                    </div>
                  </div>
                  <button
                    style={s.memoryDelete}
                    onClick={() => deleteMemory(m.id)}
                    title={t('context.removeMemory')}
                    onMouseEnter={(e) => { e.target.style.opacity = 1; }}
                    onMouseLeave={(e) => { e.target.style.opacity = 0.6; }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                style={{ ...s.btn, padding: '6px 14px', fontSize: '11px', background: 'var(--body)', opacity: reindexing ? 0.5 : 1 }}
                onClick={reindex}
                disabled={reindexing}
              >
                {reindexing ? t('context.reindexing') : t('context.reindex')}
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
          </div>
        </>
      )}
    </div>
  );
}
