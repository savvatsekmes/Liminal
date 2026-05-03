import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { useLanguage, LANGUAGES } from '../i18n/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../hooks/useTheme';
import { useFont } from '../hooks/useFont';
import { FONTS, needsGoogleFontsConsent, setGoogleFontsConsent, getFont } from '../utils/fontCatalog';
import { FONT_SCALE_OPTIONS, getFontScale, setFontScale as setFontScaleLocal } from '../utils/fontScale';
import FontConsentModal from '../components/FontConsentModal';
import TermsOfService from '../components/TermsOfService';
import { useIsMobile } from '../hooks/useIsMobile';
import { waitForChatterbox, withLoadingToast } from '../utils/ttsStatus';
import { TOUR_LABELS, TOUR_ORDER } from '../data/tutorials';
import { useTutorial } from '../components/TutorialContext';

// ── Shared styles ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'general',    labelKey: 'settings.tabGeneral' },
  { id: 'appearance', labelKey: 'settings.tabAppearance' },
  { id: 'account',    labelKey: 'settings.tabAccount' },
  { id: 'llm',        labelKey: 'settings.tabLLM' },
  { id: 'tts',        labelKey: 'settings.tabVoice' },
  { id: 'data',       labelKey: 'settings.tabData' },
];

const s = {
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    height: '100%',
    overflow: 'hidden',
  },
  tabStrip: {
    width: '160px',
    flexShrink: 0,
    borderRight: 'var(--border-style)',
    background: 'var(--near-white)',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 0 16px',
    overflowY: 'auto',
  },
  tabStripTitle: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    padding: '0 16px 16px',
  },
  tabItem: {
    padding: '8px 16px',
    fontSize: '13px',
    color: 'var(--body)',
    cursor: 'pointer',
    transition: 'background 0.1s, color 0.1s',
    borderRadius: '0',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    fontFamily: 'var(--font)',
    width: '100%',
  },
  tabItemActive: {
    background: 'var(--panel-bg)',
    color: 'var(--strong)',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '40px 48px 80px',
    maxWidth: '640px',
  },
  section: { marginBottom: '48px' },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '20px',
    paddingBottom: '8px',
    borderBottom: 'var(--border-style)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '14px',
  },
  col: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 },
  label: { fontSize: '12px', fontWeight: '500', color: 'var(--body)' },
  sublabel: { fontSize: '11px', color: 'var(--muted)', marginTop: '2px' },
  input: {
    fontSize: '13px',
    padding: '8px 10px',
    border: 'var(--border-style)',
    borderRadius: '10px',
    background: 'var(--white)',
    color: 'var(--strong)',
    outline: 'none',
    width: '100%',
    fontFamily: 'var(--font)',
    transition: 'border-color 0.15s',
  },
  inputFocus: { borderColor: 'var(--strong)' },
  select: {
    fontSize: '13px',
    padding: '8px 10px',
    border: 'var(--border-style)',
    borderRadius: '10px',
    background: 'var(--white)',
    color: 'var(--strong)',
    outline: 'none',
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    width: '100%',
  },
  segmented: {
    display: 'inline-flex',
    border: 'var(--border-style)',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  segBtn: {
    padding: '7px 18px',
    fontSize: '12px',
    fontWeight: '500',
    border: 'none',
    background: 'var(--white)',
    color: 'var(--muted)',
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
    borderRight: 'var(--border-style)',
  },
  segBtnLast: { borderRight: 'none' },
  segBtnActive: { background: 'var(--strong)', color: 'var(--white)' },
  btn: {
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: '500',
    border: 'var(--border-style)',
    borderRadius: '20px',
    background: 'var(--white)',
    color: 'var(--body)',
    cursor: 'pointer',
    transition: 'border-color 0.12s, color 0.12s',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font)',
  },
  btnPrimary: {
    background: 'var(--strong)',
    color: 'var(--white)',
    border: 'none',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
  },
  btnDanger: {
    color: '#c0392b',
    borderColor: '#e0c0be',
  },
  statusDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '1px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    marginTop: '6px',
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '10px',
  },
  sliderLabel: { fontSize: '11px', color: 'var(--muted)', width: '160px', flexShrink: 0 },
  sliderValue: { fontSize: '11px', color: 'var(--body)', width: '32px', textAlign: 'right', flexShrink: 0 },
  slider: { flex: 1, accentColor: 'var(--strong)', cursor: 'pointer' },
  keyIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    padding: '3px 8px',
    background: 'var(--panel-bg)',
    border: 'var(--border-style)',
    borderRadius: '10px',
    color: 'var(--body)',
  },
  memoryBox: {
    padding: '14px 16px',
    border: 'var(--border-style)',
    borderRadius: '16px',
    background: 'var(--near-white)',
    fontSize: '12px',
    color: 'var(--body)',
    lineHeight: '1.75',
    whiteSpace: 'pre-wrap',
    maxHeight: '220px',
    overflowY: 'auto',
    fontStyle: 'italic',
  },
  confirmBox: {
    padding: '16px',
    border: '1px solid #e0c0be',
    borderRadius: '16px',
    background: '#fff9f9',
    marginTop: '12px',
  },
  toast: {
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
    opacity: 1,
    transition: 'opacity 0.3s',
  },
  divider: { borderTop: 'var(--border-style)', margin: '20px 0' },
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  function show(msg, duration = 2500) {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }
  return { toast, show };
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ ...s.col, marginBottom: '14px' }}>
      <label style={s.label}>{label}</label>
      {hint && <span style={s.sublabel}>{hint}</span>}
      {children}
    </div>
  );
}

function Btn({ onClick, disabled, danger, primary, children, style: extra }) {
  return (
    <button
      style={{ ...s.btn, ...(primary ? s.btnPrimary : {}), ...(danger ? s.btnDanger : {}), ...(disabled ? { opacity: 0.45, cursor: 'default' } : {}), ...(extra || {}) }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function StatusIndicator({ ok, message }) {
  if (!message) return null;
  return (
    <div style={s.statusRow}>
      <div style={{ ...s.statusDot, background: ok ? '#2ecc71' : '#e74c3c' }} />
      <span style={{ color: ok ? 'var(--body)' : '#c0392b' }}>{message}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SettingsPage({ username, onLogout, avatarUrl, onAvatarChange, onNavigate }) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const [cfg, setCfg] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const { toast, show: showToast } = useToast();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/settings').then(r => r.json()).then(setCfg).catch(() => {});
  }, []);

  async function save(patch) {
    setSaving(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`PUT /api/settings returned ${res.status}`);
      const updated = await res.json();
      // Merge the patch on top of the response so the values the user just
      // saved always win, even if a racing save response arrives out of order.
      const merged = { ...updated, ...patch };
      setCfg(merged);
      window.dispatchEvent(new CustomEvent('liminal:settings-changed', { detail: merged }));
      showToast(t('common.saved'));
    } catch { showToast(t('settings.saveFailed')); }
    finally { setSaving(false); }
  }

  function set(key, value) {
    setCfg(c => ({ ...c, [key]: value }));
  }

  if (!cfg) {
    return <div style={{ padding: '40px 48px', color: 'var(--muted)', fontSize: '13px' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ ...s.root, ...(isMobile ? { flexDirection: 'column' } : {}) }}>
      {/* Tab strip — vertical sidebar on desktop, horizontal scroll on mobile */}
      <div style={isMobile ? {
        display: 'flex', flexDirection: 'row', overflowX: 'auto', flexShrink: 0,
        borderBottom: 'var(--border-style)', background: 'var(--near-white)',
        padding: '0 8px', gap: '0', WebkitOverflowScrolling: 'touch',
      } : s.tabStrip}>
        {!isMobile && (
          <>
            <div style={{ padding: '0 16px 14px', display: 'flex', justifyContent: 'flex-start' }}>
              <img src="/liminal-wordmark.png" alt="Liminal." style={{ width: '72px', objectFit: 'contain', opacity: 0.7, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
            </div>
            <div style={s.tabStripTitle}>{t('settings.title')}</div>
          </>
        )}
        {TABS.map(tab => (
          <button
            key={tab.id}
            style={isMobile ? {
              ...s.tabItem, width: 'auto', whiteSpace: 'nowrap', padding: '12px 14px',
              fontSize: '12px', flexShrink: 0,
              ...(activeTab === tab.id ? { color: 'var(--strong)', fontWeight: '600', borderBottom: '2px solid var(--strong)' } : {}),
            } : { ...s.tabItem, ...(activeTab === tab.id ? s.tabItemActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ ...s.tabContent, ...(isMobile ? { padding: '24px 16px 80px', maxWidth: '100%' } : {}) }}>
        {activeTab === 'llm'     && <LLMSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} />}
        {activeTab === 'tts'     && (<>
          <TTSSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} onNavigate={onNavigate} />
          <DictateSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} />
        </>)}
        {activeTab === 'account' && <AccountSection cfg={cfg} set={set} save={save} showToast={showToast} username={username} onLogout={onLogout} avatarUrl={avatarUrl} onAvatarChange={onAvatarChange} />}
        {activeTab === 'data'    && <DataSection showToast={showToast} />}
        {activeTab === 'general'    && <GeneralSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} />}
        {activeTab === 'appearance' && <AppearanceSection />}
      </div>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}

// ── Ollama Model Browser ──────────────────────────────────────────────────────

const RECOMMENDED_MODELS = [
  // Lightweight — 4-6 GB VRAM (GTX 1060, RTX 2060, M1/M2).
  // qwen3.5:2b removed — comprehension errors + invented aphorisms make
  // reflect output unrepresentative of the product. 4b is the floor.
  { name: 'qwen3.5:4b',   desc: 'Lightweight · 3.4GB · great balance' },
  { name: 'llama3.2:3b',  desc: 'Lightweight · 4GB VRAM · solid all-rounder' },
  { name: 'gemma3:4b',    desc: 'Lightweight · 5GB VRAM · Google · very capable' },
  // Mid-range — 6-10 GB VRAM (RTX 3060, RTX 4060, M1 Pro/M2 Pro)
  { name: 'qwen3.5:9b',   desc: 'Mid-range · 6.6GB · strong multilingual + vision' },
  { name: 'mistral:7b',   desc: 'Mid-range · 7GB VRAM · excellent reasoning' },
  { name: 'llama3.1:8b',  desc: 'Mid-range · 8GB VRAM · high quality' },
  // High-end — 12+ GB VRAM (RTX 3080, RTX 4070+, M2 Max/Ultra)
  { name: 'qwen3.5:27b',  desc: 'High-end · 17GB · near-frontier quality' },
  { name: 'qwen3.5:35b',  desc: 'High-end · 24GB · exceptional quality' },
  { name: 'gemma4:e4b',   desc: 'High-end · 20GB+ VRAM · Google · expert MoE' },
  { name: 'llama3.1:70b',  desc: 'High-end · 40GB+ VRAM · best open-source' },
];

function OllamaModelBrowser({ installedNames, ollamaOnline, onDownloaded }) {
  const { t } = useLanguage();
  const [pulling, setPulling] = useState({});
  const [selected, setSelected] = useState('');

  async function downloadModel(name) {
    setPulling(p => ({ ...p, [name]: { status: 'Starting…', progress: 0, total: 0 } }));
    try {
      const res = await apiFetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.error) {
              setPulling(p => ({ ...p, [name]: { status: `Error: ${msg.error}`, progress: 0, total: 0 } }));
            } else if (msg.status === 'done' || msg.status === 'success') {
              setPulling(p => { const n = { ...p }; delete n[name]; return n; });
              onDownloaded?.();
            } else {
              setPulling(p => ({
                ...p,
                [name]: { status: msg.status, progress: msg.completed || 0, total: msg.total || 0 },
              }));
            }
          } catch {}
        }
      }
    } catch (err) {
      setPulling(p => ({ ...p, [name]: { status: `Failed: ${err.message}`, progress: 0, total: 0 } }));
    }
  }

  if (!ollamaOnline) return null;

  const m = RECOMMENDED_MODELS.find(x => x.name === selected);
  const installed = m && installedNames.has(m.name);
  const pull = m && pulling[m.name];

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '8px' }}>
        {t('settings.recommendedModels')}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{ flex: 1, fontSize: '12px', padding: '6px 8px', border: 'var(--border-style)', borderRadius: '10px', background: 'var(--white)', color: 'var(--strong)', outline: 'none', fontFamily: 'var(--font)' }}
        >
          <option value=''>{t('settings.selectModel')}</option>
          {RECOMMENDED_MODELS.map(x => (
            <option key={x.name} value={x.name}>{x.name} — {x.desc}</option>
          ))}
        </select>
        {m && (
          installed ? (
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', flexShrink: 0 }}>{t('settings.installed')}</span>
          ) : pull ? (
            <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>{t('settings.downloading')}</span>
          ) : (
            <button
              onClick={() => downloadModel(m.name)}
              style={{ fontSize: '11px', color: 'var(--body)', padding: '5px 12px', border: 'var(--border-style)', borderRadius: '10px', flexShrink: 0, background: 'var(--white)', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              {t('settings.download')}
            </button>
          )
        )}
      </div>
      {pull && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{pull.status}</div>
          {pull.total > 0 && (
            <div style={{ height: '3px', background: 'var(--panel-bg)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--strong)', width: `${Math.round((pull.progress / pull.total) * 100)}%`, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ollama Install Guide ─────────────────────────────────────────────────────
function OllamaInstallGuide({ onRecheck }) {
  const { t } = useLanguage();
  return (
    <div style={{
      marginTop: '12px',
      padding: '16px 18px',
      border: 'var(--border-style)',
      borderRadius: '16px',
      background: 'var(--near-white)',
      fontSize: '12px',
      color: 'var(--body)',
      lineHeight: '1.8',
    }}>
      <div style={{ fontWeight: '600', color: 'var(--strong)', marginBottom: '8px' }}>
        {t('settings.ollamaInstallTitle')}
      </div>
      <div>1. {t('settings.ollamaInstallStep1')}</div>
      <div style={{ marginLeft: '16px', marginBottom: '4px' }}>
        <a
          href="https://ollama.com/download"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--strong)', textDecoration: 'underline' }}
        >
          ollama.com/download
        </a>
      </div>
      <div>2. {t('settings.ollamaInstallStep2')}</div>
      <div>3. {t('settings.ollamaInstallStep3')}</div>
      <button
        onClick={onRecheck}
        style={{
          marginTop: '12px',
          padding: '7px 16px',
          fontSize: '12px',
          fontWeight: '500',
          border: 'var(--border-style)',
          borderRadius: '20px',
          background: 'var(--white)',
          color: 'var(--body)',
          cursor: 'pointer',
          fontFamily: 'var(--font)',
          transition: 'border-color 0.12s, color 0.12s',
        }}
      >
        {t('settings.ollamaRecheck')}
      </button>
    </div>
  );
}

// ── LLM Section ───────────────────────────────────────────────────────────────
function LLMSection({ cfg, set, save, saving, showToast }) {
  const { t } = useLanguage();
  const provider = cfg.llm_provider || 'claude';
  const [testStatus, setTestStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [ollamaData, setOllamaData] = useState(null); // { online, models }
  const [gpus, setGpus] = useState(null);
  const [pendingGpu, setPendingGpu] = useState(null); // dropdown local state (unsaved)
  const [pinStatus, setPinStatus] = useState(null);   // { ok, message } | 'applying' | null

  useEffect(() => {
    apiFetch('/api/settings/gpus').then(r => r.json()).then(setGpus).catch(() => {});
  }, []);

  useEffect(() => {
    if (provider !== 'ollama') return;
    apiFetch('/api/ollama/models')
      .then(r => r.json())
      .then(data => {
        setOllamaData(data);
        // Auto-select the first installed model if nothing is saved yet
        if (data.online && data.models?.length && !cfg.ollama_model) {
          const first = data.models[0].name;
          set('ollama_model', first);
          save({ ollama_model: first });
        }
      })
      .catch(() => setOllamaData({ online: false, models: [] }));
  }, [provider]);

  async function testConnection() {
    setTesting(true);
    setTestStatus(null);
    try {
      const body = { provider };
      if (provider === 'claude' && anthropicKey && !anthropicKey.includes('••••')) {
        body.api_key = anthropicKey;
      }
      if (provider === 'openai' && openaiKey && !openaiKey.includes('••••')) {
        body.api_key = openaiKey;
      }
      if (provider === 'ollama') {
        body.ollama_url = cfg.ollama_url;
        body.model = cfg.ollama_model;
      }

      const res = await apiFetch('/api/settings/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTestStatus(data);
    } catch { setTestStatus({ ok: false, error: 'Request failed' }); }
    finally { setTesting(false); }
  }

  async function saveKeys() {
    const patch = { llm_provider: provider };
    if (anthropicKey && !anthropicKey.includes('••••')) patch.anthropic_api_key = anthropicKey;
    if (openaiKey && !openaiKey.includes('••••')) patch.openai_api_key = openaiKey;
    if (provider === 'openai') patch.openai_model = cfg.openai_model;
    if (provider === 'ollama') { patch.ollama_url = cfg.ollama_url; patch.ollama_model = cfg.ollama_model; }
    await save(patch);
  }

  return (
    <Section title={t('settings.tabLLM')}>
      <Field label={t('settings.llmProvider')}>
        <div style={s.segmented}>
          {['claude', 'openai', 'ollama'].map((p, i, arr) => (
            <button
              key={p}
              style={{
                ...s.segBtn,
                ...(i === arr.length - 1 ? s.segBtnLast : {}),
                ...(provider === p ? s.segBtnActive : {}),
              }}
              onClick={() => { set('llm_provider', p); save({ llm_provider: p }); }}
            >
              {p === 'claude' ? 'Claude' : p === 'openai' ? 'OpenAI' : t('settings.ollamaLocal')}
            </button>
          ))}
        </div>
      </Field>

      {provider === 'claude' && (
        <>
        <Field
          label={t('settings.anthropicApiKey')}
          hint={cfg.has_anthropic_key ? t('settings.keyIsSet') : t('settings.anthropicKeyHint')}
        >
          <div style={s.row}>
            <input
              style={s.input}
              type="password"
              placeholder={cfg.has_anthropic_key ? '••••••••••••••••' : 'sk-ant-...'}
              value={anthropicKey}
              onChange={e => setAnthropicKey(e.target.value)}
              autoComplete="off"
            />
            <Btn primary onClick={saveKeys} disabled={saving}>{t('common.save')}</Btn>
          </div>
        </Field>
        <Field label={t('settings.model')}>
          <select
            style={s.select}
            value={cfg.claude_model || 'claude-opus-4-6'}
            onChange={e => { set('claude_model', e.target.value); save({ claude_model: e.target.value }); }}
          >
            <optgroup label="Claude 4 (latest)">
              <option value="claude-opus-4-6">claude-opus-4-6 — most capable</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6 — fast + smart</option>
              <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 — fastest</option>
            </optgroup>
            <optgroup label="Claude 3.7">
              <option value="claude-3-7-sonnet-20250219">claude-3-7-sonnet — reasoning</option>
            </optgroup>
            <optgroup label="Claude 3.5">
              <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
              <option value="claude-3-5-haiku-20241022">claude-3-5-haiku</option>
            </optgroup>
          </select>
        </Field>
        </>
      )}

      {provider === 'openai' && (
        <>
          <Field
            label={t('settings.openaiApiKey')}
            hint={cfg.has_openai_key ? t('settings.keyIsSet') : t('settings.openaiKeyHint')}
          >
            <div style={s.row}>
              <input
                style={s.input}
                type="password"
                placeholder={cfg.has_openai_key ? '••••••••••••••••' : 'sk-...'}
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                autoComplete="off"
              />
              <Btn primary onClick={saveKeys} disabled={saving}>{t('common.save')}</Btn>
            </div>
          </Field>
          <Field label={t('settings.model')}>
            <select
              style={s.select}
              value={cfg.openai_model || 'gpt-4.1'}
              onChange={e => { set('openai_model', e.target.value); save({ openai_model: e.target.value }); }}
            >
              <optgroup label="GPT-5">
                <option value="gpt-5-chat-latest">gpt-5-chat-latest</option>
                <option value="gpt-5-nano">gpt-5-nano</option>
              </optgroup>
              <optgroup label="GPT-4.1">
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4.1-nano">gpt-4.1-nano</option>
              </optgroup>
              <optgroup label="GPT-4.5">
                <option value="gpt-4.5-preview">gpt-4.5-preview</option>
              </optgroup>
              <optgroup label="GPT-4o">
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4o-mini">gpt-4o-mini</option>
              </optgroup>
              <optgroup label="Reasoning">
                <option value="o4-mini">o4-mini</option>
                <option value="o3">o3</option>
                <option value="o3-mini">o3-mini</option>
                <option value="o1">o1</option>
                <option value="o1-mini">o1-mini</option>
              </optgroup>
              <optgroup label="Legacy">
                <option value="gpt-4-turbo">gpt-4-turbo</option>
              </optgroup>
            </select>
          </Field>
        </>
      )}

      {provider === 'ollama' && (
        <>
          <Field label={t('settings.ollamaUrl')} hint={t('settings.ollamaUrlHint')}>
            <input
              style={s.input}
              value={cfg.ollama_url || 'http://localhost:11434'}
              onChange={e => set('ollama_url', e.target.value)}
              onBlur={() => save({ ollama_url: cfg.ollama_url })}
              placeholder="http://localhost:11434"
            />
          </Field>

          <Field label={t('settings.activeModel')}>
            {!ollamaData && (
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{t('settings.checkingOllama')}</div>
            )}
            {ollamaData && !ollamaData.online && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 10px', border: 'var(--border-style)', borderRadius: '10px', background: 'var(--near-white)' }}>
                {t('settings.ollamaOffline')}
              </div>
            )}
            {ollamaData && !ollamaData.online && (
              <OllamaInstallGuide onRecheck={() => {
                setOllamaData(null);
                apiFetch('/api/ollama/models').then(r => r.json()).then(setOllamaData).catch(() => setOllamaData({ online: false, models: [] }));
              }} />
            )}
            {ollamaData?.online && ollamaData.models?.length > 0 && (
              <select
                style={s.select}
                value={cfg.ollama_model || ''}
                onChange={e => { set('ollama_model', e.target.value); save({ ollama_model: e.target.value }); }}
              >
                {ollamaData.models.map(m => {
                  const rec = RECOMMENDED_MODELS.find(r => r.name === m.name);
                  return <option key={m.name} value={m.name}>{m.name}{rec ? ` — ${rec.desc}` : ''}</option>;
                })}
              </select>
            )}
            {ollamaData?.online && ollamaData.models?.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 10px', border: 'var(--border-style)', borderRadius: '10px', background: 'var(--near-white)' }}>
                {t('settings.noModelsInstalled')}
              </div>
            )}
          </Field>

          <Field label={t('settings.visionModel')} hint={t('settings.visionModelHint')}>
            {ollamaData?.online && ollamaData.models?.length > 0 ? (
              <select
                style={s.select}
                value={cfg.vision_model || 'llama3.2-vision'}
                onChange={e => { set('vision_model', e.target.value); save({ vision_model: e.target.value }); }}
              >
                <option value="llama3.2-vision">llama3.2-vision (default)</option>
                {ollamaData.models
                  .filter(m => !m.name.includes('llama3.2-vision'))
                  .map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))
                }
              </select>
            ) : (
              <input style={s.input} value={cfg.vision_model || 'llama3.2-vision'} onChange={e => set('vision_model', e.target.value)} onBlur={() => save({ vision_model: cfg.vision_model })} placeholder="llama3.2-vision" />
            )}
          </Field>

          {/* Thinking Mode toggle hidden for now — confused users on small models
              where reasoning bursts the token budget before any visible output
              lands. Default value stays 'false' (the existing fallback when
              ollama_think is unset), so behaviour is unchanged for fresh accounts.
              Restore by uncommenting when we're ready to surface this again.
          <Field label="Thinking Mode" hint="Let reasoning models think before responding. Better quality but slower.">
            <div style={s.segmented}>
              {['off', 'on'].map((v, i, arr) => (
                <button
                  key={v}
                  style={{
                    ...s.segBtn,
                    ...(i === arr.length - 1 ? s.segBtnLast : {}),
                    ...(cfg.ollama_think === 'true' ? (v === 'on' ? s.segBtnActive : {}) : (v === 'off' ? s.segBtnActive : {})),
                  }}
                  onClick={() => { set('ollama_think', v === 'on' ? 'true' : 'false'); save({ ollama_think: v === 'on' ? 'true' : 'false' }); }}
                >
                  {v === 'on' ? 'Enabled' : 'Disabled'}
                </button>
              ))}
            </div>
          </Field>
          */}

          <OllamaModelBrowser
            installedNames={new Set((ollamaData?.models || []).map(m => m.name))}
            ollamaOnline={ollamaData?.online ?? false}
            onDownloaded={() => {
              apiFetch('/api/ollama/models').then(r => r.json()).then(data => {
                setOllamaData(data);
                if (data.online && data.models?.length && !cfg.ollama_model) {
                  set('ollama_model', data.models[0].name);
                  save({ ollama_model: data.models[0].name });
                }
              });
            }}
          />

          {gpus?.cuda && (
            <Field label={t('settings.gpuForOllama')} hint="Click Set to apply. Pins Ollama via CUDA_VISIBLE_DEVICES and restarts it.">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  style={{ ...s.select, flex: 1 }}
                  value={pendingGpu ?? (cfg.llm_device || 'auto')}
                  onChange={e => setPendingGpu(e.target.value)}
                  disabled={pinStatus === 'applying'}
                >
                  <option value="auto">Auto (Ollama manages its own GPU)</option>
                  {gpus.gpus?.map(g => (
                    <option key={g.id} value={g.name}>
                      {g.name} ({g.vram_gb} GB)
                    </option>
                  ))}
                </select>
                <Btn
                  disabled={pinStatus === 'applying'}
                  onClick={async () => {
                    const chosen = pendingGpu ?? (cfg.llm_device || 'auto');
                    setPinStatus('applying');
                    try {
                      const r = await apiFetch('/api/ollama/pin-gpu', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ gpuName: chosen }),
                      });
                      const data = await r.json();
                      if (!r.ok) {
                        setPinStatus({ ok: false, message: data.error || `HTTP ${r.status}` });
                        return;
                      }
                      set('llm_device', chosen);
                      await save({ llm_device: chosen });
                      setPinStatus({ ok: true, message: data.message || 'Applied.' });
                      setPendingGpu(null);
                    } catch (err) {
                      setPinStatus({ ok: false, message: err.message });
                    }
                  }}
                >
                  {pinStatus === 'applying' ? 'Applying…' : 'Set'}
                </Btn>
              </div>
              {pinStatus && pinStatus !== 'applying' && (
                <div style={{ ...s.sublabel, color: pinStatus.ok ? 'var(--muted)' : '#c54' }}>
                  {pinStatus.message}
                </div>
              )}
            </Field>
          )}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
        <Btn onClick={testConnection} disabled={testing}>
          {testing ? t('settings.testing') : t('settings.testConnection')}
        </Btn>
        {testStatus && (
          <StatusIndicator
            ok={testStatus.ok}
            message={testStatus.ok ? `Connected — response: "${testStatus.response}"` : testStatus.error}
          />
        )}
      </div>

    </Section>
  );
}

// ── Weather Location Field ───────────────────────────────────────────────────
function WeatherLocationField() {
  const { t } = useLanguage();
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch('/api/portrait').then(r => r.json()).then(p => {
      if (p.weather_city) setCity(p.weather_city);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function saveCity() {
    if (!city.trim()) return;
    setStatus('Looking up…');
    try {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1`);
      const geoData = await geoRes.json();
      if (!geoData.results?.length) { setStatus('City not found'); return; }
      const { latitude, longitude, name } = geoData.results[0];
      await apiFetch('/api/portrait', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather_city: name, weather_lat: latitude, weather_lng: longitude }),
      });
      setCity(name);
      setStatus(`Set to ${name} (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);
    } catch { setStatus('Failed to look up city'); }
  }

  if (!loaded) return null;

  return (
    <Section title={t('settings.weatherLocation') || 'Weather Location'}>
      <Field hint={t('settings.weatherLocationHint') || 'City for weather on the home screen and AI context. Uses Open-Meteo — no API key needed.'}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            style={{ ...s.input, flex: 1, marginBottom: 0 }}
            value={city}
            onChange={e => { setCity(e.target.value); setStatus(''); }}
            onKeyDown={e => { if (e.key === 'Enter') saveCity(); }}
            placeholder="e.g. Melbourne"
          />
          <Btn primary onClick={saveCity}>Set</Btn>
        </div>
        {status && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>{status}</div>}
      </Field>
    </Section>
  );
}

// ── TTS Section ───────────────────────────────────────────────────────────────
function TTSSection({ cfg, set, save, saving, showToast, onNavigate }) {
  const { t, lang } = useLanguage();
  // Non-English UI language → multilingual model is mandatory regardless of
  // the user's English-mode preference. Used to grey out Turbo/Original.
  const isNonEnglish = lang && lang !== 'en';
  const mode = cfg.tts_mode || 'chatterbox';
  const [voices, setVoices] = useState([]);
  const [ttsStatus, setTtsStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [gpus, setGpus] = useState(null);
  const [pendingTtsGpu, setPendingTtsGpu] = useState(null);
  const [ttsPinStatus, setTtsPinStatus] = useState(null);
  const [pendingTtsModel, setPendingTtsModel] = useState(null);
  const [ttsModelPinStatus, setTtsModelPinStatus] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/tts/voices').then(r => r.json()).then(setVoices).catch(() => {});
    apiFetch('/api/tts/status').then(r => r.json()).then(d => setTtsStatus(d)).catch(() => {});
    apiFetch('/api/settings/gpus').then(r => r.json()).then(setGpus).catch(() => {});
  }, []);

  async function testTts() {
    setTesting(true);
    try {
      // Show the "Loading Chatterbox into VRAM…" toast if the server needs
      // warming up. Matches the flow used by the read-aloud buttons.
      const ready = await waitForChatterbox(60000);
      if (!ready) {
        showToast(t('settings.chatterboxNotReachable'));
        return;
      }
      const res = await apiFetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Liminal is listening. Your voice is ready and working.',
          provider: 'chatterbox',
          voice: cfg.chatterbox_voice,
          exaggeration: parseFloat(cfg.chatterbox_exaggeration ?? 0.6),
          cfg_weight: parseFloat(cfg.chatterbox_cfg_weight ?? 0.10),
          temperature: parseFloat(cfg.chatterbox_temperature ?? 1.3),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
    } catch (err) {
      showToast(t('settings.chatterboxNotReachable'));
    } finally {
      setTesting(false);
    }
  }

  const selectedVoice = cfg.chatterbox_voice || 'Imogen.wav';

  return (
    <Section title={t('settings.voiceAndTts')}>
      <Field label={t('settings.llmProvider')}>
        <div style={s.segmented}>
          {[['chatterbox', t('settings.chatterboxLocal')], ['openai', t('settings.openaiTts')], ['webspeech', t('settings.browserBuiltIn')]].map(([val, label], i, arr) => (
            <button
              key={val}
              style={{
                ...s.segBtn,
                ...(i === arr.length - 1 ? s.segBtnLast : {}),
                ...(mode === val ? s.segBtnActive : {}),
              }}
              onClick={() => { set('tts_mode', val); save({ tts_mode: val }); }}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      {mode === 'chatterbox' && (
        <>
          <div style={{ ...s.row, alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div style={{ ...s.statusDot, background: ttsStatus?.online ? '#2ecc71' : '#e0e0e0' }} />
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {ttsStatus?.online ? t('settings.chatterboxOnline') : t('settings.chatterboxOffline')}
            </span>
          </div>

          <Field label={t('settings.serverUrl')}>
            <input
              style={s.input}
              value={cfg.chatterbox_url || 'http://localhost:8500'}
              onChange={e => set('chatterbox_url', e.target.value)}
              onBlur={() => save({ chatterbox_url: cfg.chatterbox_url })}
              placeholder="http://localhost:8500"
            />
          </Field>

          {gpus && (
            <Field
              label={t('settings.gpuForTts')}
              hint="Click Set to apply. Restarts the TTS server on the chosen device."
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  style={{ ...s.select, flex: 1 }}
                  value={pendingTtsGpu ?? (cfg.tts_device || 'auto')}
                  onChange={e => setPendingTtsGpu(e.target.value)}
                  disabled={ttsPinStatus === 'applying'}
                >
                  <option value="auto">{t('settings.gpuAuto') || 'Auto (first available GPU)'}</option>
                  <option value="cpu">{t('settings.gpuCpu') || 'CPU (slow)'}</option>
                  {gpus.mps && (
                    <option value="mps">{t('settings.gpuMetal') || 'Apple Silicon GPU (Metal)'}</option>
                  )}
                  {gpus.gpus?.map(g => (
                    <option key={g.id} value={g.name}>
                      {g.name}{typeof g.vram_gb === 'number' ? ` (${g.vram_gb} GB)` : ''}
                    </option>
                  ))}
                </select>
                <Btn
                  disabled={ttsPinStatus === 'applying'}
                  onClick={async () => {
                    const chosen = pendingTtsGpu ?? (cfg.tts_device || 'auto');
                    setTtsPinStatus('applying');
                    try {
                      const r = await apiFetch('/api/tts/pin-gpu', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ gpuName: chosen }),
                      });
                      const data = await r.json();
                      if (!r.ok) {
                        setTtsPinStatus({ ok: false, message: data.error || `HTTP ${r.status}` });
                        return;
                      }
                      set('tts_device', chosen);
                      await save({ tts_device: chosen });
                      setTtsPinStatus({ ok: true, message: data.message || 'Applied.' });
                      setPendingTtsGpu(null);
                    } catch (err) {
                      setTtsPinStatus({ ok: false, message: err.message });
                    }
                  }}
                >
                  {ttsPinStatus === 'applying' ? 'Applying…' : 'Set'}
                </Btn>
              </div>
              {ttsPinStatus && ttsPinStatus !== 'applying' && (
                <div style={{ ...s.sublabel, color: ttsPinStatus.ok ? 'var(--muted)' : '#c54' }}>
                  {ttsPinStatus.message}
                </div>
              )}
              {ttsStatus?.compat_mode && (
                <div style={{ marginTop: '6px', padding: '6px 10px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', fontSize: '11px', color: '#856404', lineHeight: '1.4' }}>
                  ⚠ Compatibility mode active — {ttsStatus.gpu_name || 'this GPU'} (compute {ttsStatus.compute_capability}) lacks fast attention kernels (requires 8.0+). TTS will work but generation is slower.
                </div>
              )}
            </Field>
          )}

          <Field
            label={t('settings.chatterboxVersion') || 'Chatterbox Version'}
            hint={isNonEnglish
              ? 'Multilingual is the only valid model for non-English text. Switch the UI language to English to choose Turbo or Original.'
              : 'Used when reading English text. Multilingual is automatically used for other languages — pick it here to also use it for English.'}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                style={{ ...s.select, flex: 1 }}
                value={isNonEnglish ? 'multilingual' : (pendingTtsModel ?? (cfg.tts_model || 'turbo'))}
                onChange={e => setPendingTtsModel(e.target.value)}
                disabled={isNonEnglish || ttsModelPinStatus === 'applying'}
              >
                <option value="turbo" disabled={isNonEnglish}>Chatterbox Turbo — faster, English only</option>
                <option value="original" disabled={isNonEnglish}>Chatterbox — full quality, English only</option>
                <option value="multilingual">Chatterbox Multilingual — 23 languages</option>
              </select>
              <Btn
                disabled={isNonEnglish || ttsModelPinStatus === 'applying'}
                onClick={async () => {
                  const chosen = pendingTtsModel ?? (cfg.tts_model || 'turbo');
                  setTtsModelPinStatus('applying');
                  try {
                    const r = await apiFetch('/api/tts/pin-model', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ model: chosen }),
                    });
                    const data = await r.json();
                    if (!r.ok) {
                      setTtsModelPinStatus({ ok: false, message: data.error || `HTTP ${r.status}` });
                      return;
                    }
                    set('tts_model', chosen);
                    await save({ tts_model: chosen });
                    // pin-model only writes the setting; the actual model
                    // swap happens here, on the running server. Toast stays
                    // up for the full ensure_model() duration (~5-30s).
                    withLoadingToast(() =>
                      apiFetch('/api/tts/preload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ kind: chosen }),
                      })
                    ).catch(() => {});
                    setTtsModelPinStatus({ ok: true, message: data.message || 'Applied.' });
                    setPendingTtsModel(null);
                  } catch (err) {
                    setTtsModelPinStatus({ ok: false, message: err.message });
                  }
                }}
              >
                {ttsModelPinStatus === 'applying' ? 'Applying…' : 'Set'}
              </Btn>
            </div>
            {ttsModelPinStatus && ttsModelPinStatus !== 'applying' && (
              <div style={{ ...s.sublabel, color: ttsModelPinStatus.ok ? 'var(--muted)' : '#c54' }}>
                {ttsModelPinStatus.message}
              </div>
            )}
          </Field>

          <Field label={t('settings.voiceModel') || 'Voice Model'}>
            <select
              style={s.input}
              value={selectedVoice}
              onChange={e => { set('chatterbox_voice', e.target.value); save({ chatterbox_voice: e.target.value }); }}
            >
              {voices.length === 0 && <option value="">{t('settings.noVoicesFound')}</option>}
              {voices.map(v => (
                <option key={v.filename} value={v.filename}>{v.name || v.filename}</option>
              ))}
            </select>
            {onNavigate && (
              <div style={{ ...s.sublabel, marginTop: '6px' }}>
                Want a different voice per archetype?{' '}
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onNavigate('memory'); }}
                  style={{ color: 'var(--strong)', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Set them in Context → Archetypes
                </a>
              </div>
            )}
          </Field>

          <div style={s.divider} />

          <Field label={t('settings.emotionExpression')}>
            <TtsSlider
              label={t('settings.exaggeration')}
              hint={t('settings.exaggerationHint')}
              min={0} max={2} step={0.05}
              value={parseFloat(cfg.chatterbox_exaggeration ?? 0.6)}
              onChange={v => { set('chatterbox_exaggeration', v); save({ chatterbox_exaggeration: v }); }}
            />
            <TtsSlider
              label={t('settings.voiceFidelity')}
              hint={t('settings.voiceFidelityHint')}
              min={0.05} max={0.95} step={0.05}
              value={parseFloat(cfg.chatterbox_cfg_weight ?? 0.10)}
              onChange={v => { set('chatterbox_cfg_weight', v); save({ chatterbox_cfg_weight: v }); }}
            />
            <TtsSlider
              label={t('settings.variation')}
              hint={t('settings.variationHint')}
              min={0} max={2} step={0.05}
              value={parseFloat(cfg.chatterbox_temperature ?? 1.3)}
              onChange={v => { set('chatterbox_temperature', v); save({ chatterbox_temperature: v }); }}
            />
          </Field>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Btn onClick={testTts} disabled={testing}>
              {testing ? t('settings.speaking') : t('settings.testVoice')}
            </Btn>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {t('settings.testVoiceHint')}
            </span>
          </div>
        </>
      )}

      {mode === 'openai' && (
        <OpenAITtsSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} />
      )}

      {mode === 'webspeech' && (
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.7', padding: '12px 0' }}>
          {t('settings.webspeechDesc')}
        </div>
      )}
    </Section>
  );
}

// ── Dictate (Whisper STT) section ────────────────────────────────────────────
// Whisper model picker + microphone selection. Sits next to Voice & TTS in the
// same tab — both are audio I/O settings, just opposite directions.
function DictateSection({ cfg, set, save, showToast }) {
  const { t } = useLanguage();
  const [pendingModel, setPendingModel] = useState(null);
  const [pinStatus, setPinStatus] = useState(null);
  const [mics, setMics] = useState([]);

  // Enumerate microphones once. The labels are empty strings until the user
  // has granted mic permission to ANY page on this origin, so on first run we
  // fall back to "Microphone 1 / 2 / …" until they've used dictate at least
  // once and we can re-enumerate with real names.
  useEffect(() => {
    async function loadMics() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMics(devices.filter(d => d.kind === 'audioinput'));
      } catch {
        setMics([]);
      }
    }
    loadMics();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadMics);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', loadMics);
  }, []);

  return (
    <Section title={t('settings.dictate') || 'Dictate'}>
      <Field
        label={t('settings.whisperModel') || 'Whisper Model'}
        hint="Larger = more accurate, slower, more VRAM. base is the floor for journaling; tiny saves VRAM but mishears common words."
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            style={{ ...s.select, flex: 1 }}
            value={pendingModel ?? (cfg.whisper_model || 'base')}
            onChange={e => setPendingModel(e.target.value)}
            disabled={pinStatus === 'applying'}
          >
            <option value="tiny">tiny — fastest, ~75 MB, lowest accuracy</option>
            <option value="base">base — recommended floor, ~150 MB</option>
            <option value="small">small — better accuracy, ~500 MB</option>
            <option value="medium">medium — high accuracy, ~1.5 GB</option>
            <option value="large-v3">large-v3 — best accuracy, ~3 GB</option>
          </select>
          <Btn
            disabled={pinStatus === 'applying'}
            onClick={async () => {
              const chosen = pendingModel ?? (cfg.whisper_model || 'base');
              setPinStatus('applying');
              try {
                // Toast covers the model swap on the running server (~5-30s
                // depending on size + whether it's been loaded before).
                const { r, data } = await withLoadingToast(
                  async () => {
                    const r = await apiFetch('/api/stt/pin-model', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ model: chosen }),
                    });
                    const data = await r.json();
                    return { r, data };
                  },
                  `Loading Whisper ${chosen}…`
                );
                if (!r.ok) {
                  setPinStatus({ ok: false, message: data.error || `HTTP ${r.status}` });
                  return;
                }
                set('whisper_model', chosen);
                await save({ whisper_model: chosen });
                try { localStorage.setItem('liminal_whisper_model', chosen); } catch {}
                setPinStatus({ ok: true, message: data.preloaded ? 'Loaded.' : 'Saved (will load on next dictation).' });
                setPendingModel(null);
              } catch (err) {
                setPinStatus({ ok: false, message: err.message });
              }
            }}
          >
            {pinStatus === 'applying' ? 'Applying…' : 'Set'}
          </Btn>
        </div>
        {pinStatus && pinStatus !== 'applying' && (
          <div style={{ ...s.sublabel, color: pinStatus.ok ? 'var(--muted)' : '#c54' }}>
            {pinStatus.message}
          </div>
        )}
      </Field>

      <Field
        label={t('settings.microphone') || 'Microphone'}
        hint={mics.length === 0
          ? 'No microphones detected — grant mic permission via the dictate button first, then reopen Settings.'
          : 'Used for the dictate button.'}
      >
        <select
          style={s.input}
          value={cfg.dictate_mic || 'default'}
          onChange={e => {
            set('dictate_mic', e.target.value);
            save({ dictate_mic: e.target.value });
            // Mirror to localStorage so useDictation can read synchronously
            // without waiting on a /api/settings round-trip.
            try { localStorage.setItem('liminal_dictate_mic', e.target.value); } catch {}
          }}
        >
          <option value="default">System default</option>
          {mics.map((m, i) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
      </Field>
    </Section>
  );
}

// ── OpenAI TTS sub-section ────────────────────────────────────────────────────
function OpenAITtsSection({ cfg, set, save, saving, showToast }) {
  const { t } = useLanguage();
  const [testing, setTesting] = useState(false);

  async function testOpenAITts() {
    setTesting(true);
    try {
      const res = await apiFetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Liminal is listening.',
          provider: 'openai',
          voice: cfg.openai_tts_voice || 'nova',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      new Audio(URL.createObjectURL(blob)).play();
    } catch { showToast(t('settings.openaiTtsFailed')); }
    finally { setTesting(false); }
  }

  return (
    <>
      <Field
        label={t('settings.openaiApiKey')}
        hint={cfg.has_openai_key ? t('settings.openaiKeySetShared') : t('settings.required')}
      >
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
          {t('settings.openaiKeySharedHint')}
        </div>
      </Field>

      <Field label={t('settings.voiceModel') || 'Voice Model'}>
        <select
          style={s.select}
          value={cfg.openai_tts_voice || 'nova'}
          onChange={e => { set('openai_tts_voice', e.target.value); save({ openai_tts_voice: e.target.value }); }}
        >
          {['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <div style={{ ...s.sublabel, marginTop: '4px' }}>
          {t('settings.ttsApiNote')}
        </div>
      </Field>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Btn onClick={testOpenAITts} disabled={testing || !cfg.has_openai_key}>
          {testing ? t('settings.speaking') : t('settings.testVoice')}
        </Btn>
        {!cfg.has_openai_key && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('settings.setOpenaiKeyFirst')}</span>}
      </div>
    </>
  );
}

function TtsSlider({ label, hint, min, max, step, value, onChange }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ ...s.row, marginBottom: '4px' }}>
        <span style={{ ...s.label, flex: 1 }}>{label}</span>
        <span style={{ fontSize: '12px', color: 'var(--strong)', fontWeight: '500', minWidth: '30px', textAlign: 'right' }}>
          {value.toFixed(2)}
        </span>
      </div>
      {hint && <div style={{ ...s.sublabel, marginBottom: '6px' }}>{hint}</div>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ ...s.slider, width: '100%' }}
      />
    </div>
  );
}


// ── Account Section ───────────────────────────────────────────────────────────
function AccountSection({ cfg, set, save, showToast, username, onLogout, avatarUrl, onAvatarChange }) {
  const { t, lang, setLanguage: setLanguageFn } = useLanguage();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [deleteStep, setDeleteStep] = useState(null); // null → 'confirm' → 'password'
  const [deletePw, setDeletePw] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const avatarInputRef = useRef(null);

  // Recovery-key section state
  const [rkMode, setRkMode] = useState(null); // null | 'view' | 'regenerate'
  const [rkPassword, setRkPassword] = useState('');
  const [rkError, setRkError] = useState('');
  const [rkBusy, setRkBusy] = useState(false);
  const [rkRevealed, setRkRevealed] = useState(null); // string when shown

  async function submitRecoveryKey() {
    setRkError('');
    if (!rkPassword) { setRkError(t('settings.passwordRequired') || 'Password required'); return; }
    setRkBusy(true);
    try {
      const path = rkMode === 'regenerate' ? '/api/auth/recovery-key/regenerate' : '/api/auth/recovery-key/view';
      const res = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: rkPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setRkError(data.error || 'Failed.'); return; }
      setRkRevealed(data.recovery_key);
      setRkPassword('');
    } catch {
      setRkError(t('settings.requestFailed'));
    } finally { setRkBusy(false); }
  }

  function closeRk() {
    setRkMode(null); setRkPassword(''); setRkError(''); setRkRevealed(null);
  }

  async function changePassword() {
    setPwError('');
    if (!currentPw || !newPw) { setPwError(t('settings.allFieldsRequired')); return; }
    if (newPw !== confirmPw) { setPwError(t('settings.passwordsDoNotMatch')); return; }
    if (newPw.length < 4) { setPwError(t('settings.passwordTooShort')); return; }

    setSavingPw(true);
    try {
      const res = await apiFetch('/api/auth/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(t('settings.passwordChanged'));
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
      } else {
        setPwError(data.error || 'Failed.');
      }
    } catch { setPwError(t('settings.requestFailed')); }
    finally { setSavingPw(false); }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await apiFetch('/api/auth/avatar', { method: 'POST', body: form });
      const data = await res.json();
      if (data.avatar_url) {
        onAvatarChange(data.avatar_url);
        showToast(t('settings.profilePictureUpdated'));
      } else {
        showToast(t('settings.uploadFailed'));
      }
    } catch (err) {
      console.error('Avatar upload failed:', err);
      showToast(t('settings.uploadFailed'));
    }
    finally { setUploadingAvatar(false); e.target.value = ''; }
  }

  return (
    <Section title={t('settings.tabAccount')}>
      {/* Profile picture */}
      <Field label={t('settings.profilePicture')} hint={t('settings.profilePictureHint')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src={avatarUrl || ''}
            alt="Avatar"
            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: 'var(--border-style)', display: avatarUrl ? 'block' : 'none' }}
            onError={e => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}
            onLoad={e => { e.target.style.display = 'block'; e.target.nextElementSibling.style.display = 'none'; }}
          />
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--panel-bg)', border: 'var(--border-style)', display: avatarUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '600', color: 'var(--muted)' }}>
            {(username || '?')[0].toUpperCase()}
          </div>
          <div>
            <Btn primary onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
              {uploadingAvatar ? t('settings.uploading') : t('settings.uploadPhoto')}
            </Btn>
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </div>
        </div>
      </Field>

      <div style={s.divider} />

      <Field label={t('settings.displayName')} hint={t('settings.displayNameHint')}>
        <div style={s.row}>
          <input
            style={s.input}
            value={cfg.display_name || ''}
            onChange={e => set('display_name', e.target.value)}
            placeholder="Your name"
          />
          <Btn primary onClick={() => save({ display_name: cfg.display_name })}>{t('common.save')}</Btn>
        </div>
      </Field>

      <Field label={t('settings.language')} hint={t('settings.languageHint')}>
        <select
          style={s.input}
          value={lang}
          onChange={(e) => setLanguageFn(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </Field>

      <div style={s.divider} />

      <div style={{ ...s.label, marginBottom: '14px' }}>{t('settings.changePassword')}</div>
      <Field label={t('settings.currentPassword')}>
        <input style={s.input} type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label={t('settings.newPassword')}>
        <input style={s.input} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label={t('settings.confirmNewPassword')}>
        <input style={s.input} type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} autoComplete="new-password" />
      </Field>
      {pwError && <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px' }}>{pwError}</div>}
      <Btn primary onClick={changePassword} disabled={savingPw}>
        {savingPw ? t('settings.updatingPassword') : t('settings.updatePassword')}
      </Btn>

      <div style={s.divider} />

      {/* Recovery key */}
      <div style={{ ...s.label, marginBottom: '14px' }}>Recovery key</div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '12px' }}>
        The recovery key unlocks your journal if you forget your password. View it to write it down again, or regenerate it if you think the old one has been seen by someone else.
      </div>

      {!rkMode && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Btn onClick={() => { setRkMode('view'); setRkError(''); setRkRevealed(null); }}>View key</Btn>
          <Btn onClick={() => { setRkMode('regenerate'); setRkError(''); setRkRevealed(null); }}>Regenerate</Btn>
        </div>
      )}

      {rkMode && !rkRevealed && (
        <div style={{ padding: '14px', border: 'var(--border-style)', borderRadius: '16px', background: 'var(--panel-bg)' }}>
          <div style={{ fontSize: '12px', color: 'var(--body)', marginBottom: '10px' }}>
            {rkMode === 'regenerate'
              ? 'Regenerating replaces your existing recovery key. The old key will stop working — save the new one immediately.'
              : 'Enter your password to view your recovery key.'}
          </div>
          <input
            style={{ ...s.input, marginBottom: '10px' }}
            type="password"
            placeholder={t('settings.password') || 'Password'}
            value={rkPassword}
            onChange={(e) => setRkPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && submitRecoveryKey()}
          />
          {rkError && <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px' }}>{rkError}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn primary onClick={submitRecoveryKey} disabled={rkBusy || !rkPassword}>
              {rkBusy ? '…' : rkMode === 'regenerate' ? 'Regenerate' : 'Show key'}
            </Btn>
            <Btn onClick={closeRk}>{t('common.cancel')}</Btn>
          </div>
        </div>
      )}

      {rkRevealed && (
        <div style={{ padding: '14px', border: 'var(--border-style)', borderRadius: '16px', background: 'var(--panel-bg)' }}>
          <div style={{ fontSize: '12px', color: 'var(--body)', marginBottom: '10px' }}>
            {rkMode === 'regenerate' ? 'Your new recovery key:' : 'Your recovery key:'}
          </div>
          <div style={{
            padding: '14px',
            background: 'var(--white)',
            border: 'var(--border-style)',
            borderRadius: '10px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '15px',
            letterSpacing: '0.1em',
            color: 'var(--strong)',
            textAlign: 'center',
            userSelect: 'all',
            marginBottom: '10px',
          }}>
            {rkRevealed}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn onClick={async () => {
              try { await navigator.clipboard.writeText(rkRevealed); showToast('Copied'); } catch {}
            }}>Copy</Btn>
            <Btn primary onClick={closeRk}>Done</Btn>
          </div>
        </div>
      )}

      <div style={s.divider} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {t('settings.loggedInAs')} <strong style={{ color: 'var(--body)' }}>{username}</strong>
        </span>
        <Btn danger onClick={onLogout}>{t('settings.logOut')}</Btn>
      </div>

      <div style={s.divider} />

      <button
        onClick={() => setShowTerms(true)}
        style={{
          background: 'none',
          border: 'none',
          fontSize: '12px',
          color: 'var(--muted)',
          cursor: 'pointer',
          fontFamily: 'var(--font)',
          padding: 0,
          textDecoration: 'underline',
          marginBottom: '8px',
        }}
      >
        {t('settings.viewTerms')}
      </button>

      {showTerms && <TermsOfService onBack={() => setShowTerms(false)} />}

      <div style={s.divider} />

      <div style={{ ...s.label, marginBottom: '10px', color: '#c0392b' }}>{t('settings.dangerZone')}</div>
      {!deleteStep && (
        <Btn danger onClick={() => setDeleteStep('confirm')}>{t('settings.deleteAccount')}</Btn>
      )}

      {deleteStep === 'confirm' && (
        <div style={{ padding: '14px', border: '1px solid #e0c0be', borderRadius: '16px', background: 'var(--near-white)' }}>
          <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px', fontWeight: '500' }}>
            {t('settings.deleteAccountConfirm')}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn danger onClick={() => setDeleteStep('password')}>{t('settings.deleteAccountYes')}</Btn>
            <Btn onClick={() => { setDeleteStep(null); setDeletePw(''); setDeleteError(''); }}>{t('common.cancel')}</Btn>
          </div>
        </div>
      )}

      {deleteStep === 'password' && (
        <div style={{ padding: '14px', border: '1px solid #e0c0be', borderRadius: '16px', background: 'var(--near-white)' }}>
          <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px', fontWeight: '500' }}>
            {t('settings.deleteAccountPassword')}
          </div>
          {deleteError && <div style={{ fontSize: '11px', color: '#c0392b', marginBottom: '8px' }}>{deleteError}</div>}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="password"
              style={{ ...s.input, flex: 1, borderColor: '#e0c0be' }}
              placeholder={t('settings.password')}
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDeleteAccount()}
              autoFocus
            />
            <Btn danger onClick={handleDeleteAccount} disabled={!deletePw}>{t('common.delete')}</Btn>
            <Btn onClick={() => { setDeleteStep(null); setDeletePw(''); setDeleteError(''); }}>{t('common.cancel')}</Btn>
          </div>
        </div>
      )}
    </Section>
  );

  async function handleDeleteAccount() {
    if (!deletePw) return;
    setDeleteError('');
    try {
      const res = await apiFetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePw }),
      });
      const data = await res.json();
      if (data.success) {
        onLogout();
      } else {
        setDeleteError(data.error || 'Failed');
      }
    } catch { setDeleteError(t('settings.requestFailed')); }
  }
}

function RestartButton() {
  const { t } = useLanguage();
  const [state, setState] = useState('idle'); // idle | restarting
  const [countdown, setCountdown] = useState(10);

  async function handleRestart() {
    setState('restarting');
    let t = 10;
    setCountdown(t);
    const iv = setInterval(() => {
      t -= 1;
      setCountdown(t);
      if (t <= 0) {
        clearInterval(iv);
        window.location.reload();
      }
    }, 1000);
    try {
      await apiFetch('/api/settings/restart', { method: 'POST' });
    } catch {
      // Expected — backend is shutting down
    }
  }

  if (state === 'restarting') {
    return (
      <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
        {t('settings.restartingCountdown', { countdown })}
      </div>
    );
  }

  return (
    <Btn onClick={handleRestart}>{t('settings.restart')}</Btn>
  );
}

// ── Life Context Section ───────────────────────────────────────────────────────

// ── Data Section ──────────────────────────────────────────────────────────────
// ── Notion Import Section ─────────────────────────────────────────────────────

// ── Data Section ──────────────────────────────────────────────────────────────

function DataSection({ showToast }) {
  const { t } = useLanguage();
  const [deleteTarget, setDeleteTarget] = useState(null); // 'entries' | 'notes' | 'conversations' | 'all'
  const [deleteStep, setDeleteStep] = useState(null); // null | 'confirm' | 'password'
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const deleteEndpoints = {
    entries: { url: '/api/settings/data/entries', toast: 'settings.journalEntriesDeleted' },
    notes: { url: '/api/settings/data/notes', toast: 'settings.notesDeleted' },
    conversations: { url: '/api/settings/data/conversations', toast: 'settings.conversationsDeleted' },
    all: { url: '/api/settings/data', toast: 'settings.allDataDeleted' },
  };

  async function performDelete() {
    if (!password || !deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const { url, toast } = deleteEndpoints[deleteTarget];
      const res = await apiFetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(t(toast));
        resetDelete();
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(data.error || 'Deletion failed');
      }
    } catch { setError(t('settings.deletionFailed')); }
    finally { setDeleting(false); }
  }

  function startDelete(target) { setDeleteTarget(target); setDeleteStep('confirm'); }
  function resetDelete() { setDeleteTarget(null); setDeleteStep(null); setPassword(''); setError(''); }

  // ── Backup config state ──────────────────────────────────────────────────
  const [backupLocation, setBackupLocation] = useState('');
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [maxBackups, setMaxBackups] = useState('10');
  const [backingUp, setBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [lastBackupTime, setLastBackupTime] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoringBackup, setRestoringBackup] = useState(false);
  const restoreInputRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/settings').then(r => r.json()).then(data => {
      setBackupLocation(data.backup_location || '');
      setAutoBackupEnabled(data.auto_backup_enabled === 'true');
      setMaxBackups(data.max_backups || '10');
      setLastBackupTime(data.last_backup_time || '');
    }).catch(() => {});
  }, []);

  async function handleBrowseBackupFolder() {
    if (!window.liminal?.pickBackupFolder) {
      showToast(t('settings.backupBrowseUnavailable'));
      return;
    }
    const folder = await window.liminal.pickBackupFolder();
    if (folder) {
      setBackupLocation(folder);
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup_location: folder,
          auto_backup_enabled: autoBackupEnabled ? 'true' : 'false',
          max_backups: maxBackups,
        }),
      });
      showToast(t('settings.backupSettingsSaved'));
    }
  }

  async function saveBackupSettings() {
    await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backup_location: backupLocation,
        auto_backup_enabled: autoBackupEnabled ? 'true' : 'false',
        max_backups: maxBackups,
      }),
    });
    showToast(t('settings.backupSettingsSaved'));
  }

  async function handleManualBackup() {
    if (!window.liminal?.triggerBackup) {
      showToast(t('settings.backupUnavailable'));
      return;
    }
    setBackingUp(true);
    setBackupStatus(null);
    try {
      const result = await window.liminal.triggerBackup();
      setBackupStatus(result);
      if (result.success) setLastBackupTime(new Date().toISOString());
      showToast(result.success ? t('settings.backupSuccess') : t('settings.backupFailed'));
    } finally {
      setBackingUp(false);
    }
  }

  const [restoreFile, setRestoreFile] = useState(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  function handleRestoreFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) setRestoreFile(file);
    e.target.value = '';
  }

  function handleRestoreClick() {
    if (!restoreFile) return;
    // .liminal files need password — show dialog; .json files go straight through
    if (restoreFile.name.endsWith('.liminal')) {
      setRestorePassword('');
      setShowRestoreDialog(true);
    } else {
      doRestore('');
    }
  }

  async function doRestore(pw) {
    setShowRestoreDialog(false);
    setRestoringBackup(true);
    try {
      const formData = new FormData();
      formData.append('backup', restoreFile);
      if (pw) formData.append('password', pw);
      const res = await apiFetch('/api/settings/restore-backup', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (result.success) {
        const parts = [];
        if (result.entries) parts.push(`${result.entries} entries`);
        if (result.notes) parts.push(`${result.notes} notes`);
        if (result.oracle_sessions) parts.push(`${result.oracle_sessions} conversations`);
        if (result.settings) parts.push(`${result.settings} settings`);
        showToast(`Restored: ${parts.join(', ') || 'backup restored'}`);
        setRestoreFile(null);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(result.error || t('settings.restoreFailed'));
      }
    } catch {
      showToast(t('settings.restoreFailed'));
    } finally {
      setRestoringBackup(false);
    }
  }

  return (
    <>
      {/* Backup Configuration */}
      <Section title={t('settings.backupConfig')}>
        <Field label={t('settings.backupLocation')} hint={t('settings.backupLocationHint')}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              style={{ ...s.input, flex: 1 }}
              value={backupLocation}
              onChange={e => setBackupLocation(e.target.value)}
              placeholder={t('settings.backupLocationPlaceholder')}
            />
            <Btn onClick={handleBrowseBackupFolder}>{t('settings.browse')}</Btn>
          </div>
        </Field>

        <Field label={t('settings.autoBackup')} hint={t('settings.autoBackupHint')}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: backupLocation ? 'pointer' : 'not-allowed', opacity: backupLocation ? 1 : 0.5 }}>
            <input
              type="checkbox"
              checked={autoBackupEnabled}
              onChange={e => setAutoBackupEnabled(e.target.checked)}
              disabled={!backupLocation}
            />
            <span style={{ fontSize: '13px', color: 'var(--body)' }}>{t('settings.autoBackupLabel')}</span>
          </label>
        </Field>

        <Field label={t('settings.maxBackups')} hint={t('settings.maxBackupsHint')}>
          <select style={s.input} value={maxBackups} onChange={e => setMaxBackups(e.target.value)}>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="20">20</option>
          </select>
        </Field>

        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          <Btn primary onClick={saveBackupSettings}>{t('common.save')}</Btn>
          <Btn onClick={handleManualBackup} disabled={backingUp || !backupLocation}>
            {backingUp ? t('settings.working') : t('settings.backupNow')}
          </Btn>
        </div>

        {backupStatus && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: backupStatus.success ? 'var(--body)' : '#c0392b', lineHeight: '1.5' }}>
            {backupStatus.success
              ? `${t('settings.backupSuccess')} — ${backupStatus.path}`
              : `${t('settings.backupFailed')}: ${backupStatus.error}`}
          </div>
        )}

        <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--muted)' }}>
          {t('settings.lastBackupTime')}:{' '}
          {lastBackupTime
            ? new Date(lastBackupTime).toLocaleString()
            : t('settings.lastBackupNever')}
        </div>

      </Section>

      {/* Restore from backup */}
      <Section title={t('settings.restoreBackup')}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px', lineHeight: '1.6' }}>
          {t('settings.restoreBackupDesc')}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Btn onClick={() => restoreInputRef.current?.click()}>
            {restoreFile ? restoreFile.name : t('settings.chooseBackupFile')}
          </Btn>
          <input ref={restoreInputRef} type="file" accept=".liminal,.json" style={{ display: 'none' }} onChange={handleRestoreFileSelect} />
          <Btn primary onClick={handleRestoreClick} disabled={restoringBackup || !restoreFile}>
            {restoringBackup ? t('settings.working') : t('settings.restoreBackupBtn')}
          </Btn>
        </div>
      </Section>

      {/* Password dialog for encrypted restore */}
      {showRestoreDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowRestoreDialog(false)}>
          <div style={{
            background: 'var(--white)', borderRadius: '14px', padding: '28px 32px',
            border: 'var(--border-style)', maxWidth: '380px', width: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--strong)', marginBottom: '6px' }}>
              {t('settings.restoreBackup')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.6' }}>
              {t('settings.restorePasswordDesc')}
            </div>
            <input
              style={{ ...s.input, marginBottom: '16px' }}
              type="password"
              autoFocus
              value={restorePassword}
              onChange={e => setRestorePassword(e.target.value)}
              placeholder={t('settings.restorePasswordPlaceholder')}
              onKeyDown={e => { if (e.key === 'Enter' && restorePassword) doRestore(restorePassword); }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowRestoreDialog(false)}>{t('common.cancel')}</Btn>
              <Btn primary onClick={() => doRestore(restorePassword)} disabled={!restorePassword}>
                {t('settings.restoreBackupBtn')}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Danger zone */}
      <Section title={t('settings.dangerZone')}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px', lineHeight: '1.6' }}>
          {t('settings.deleteEntriesFullDesc')}
        </div>

        {!deleteStep && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Btn danger onClick={() => startDelete('entries')}>{t('settings.deleteJournalEntries')}</Btn>
            <Btn danger onClick={() => startDelete('notes')}>{t('settings.deleteNotes')}</Btn>
            <Btn danger onClick={() => startDelete('conversations')}>{t('settings.deleteConversations')}</Btn>
            <Btn danger onClick={() => startDelete('all')}>{t('settings.deleteAllData')}</Btn>
          </div>
        )}

        {deleteStep === 'confirm' && (
          <div style={s.confirmBox}>
            <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px', fontWeight: '500' }}>
              {t('settings.deleteEntriesConfirm')}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Btn danger onClick={() => setDeleteStep('password')}>{t('settings.yesContinue')}</Btn>
              <Btn onClick={resetDelete}>{t('common.cancel')}</Btn>
            </div>
          </div>
        )}

        {deleteStep === 'password' && (
          <div style={s.confirmBox}>
            <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px', fontWeight: '500' }}>
              {t('settings.enterPasswordToConfirm')}
            </div>
            {error && <div style={{ fontSize: '11px', color: '#c0392b', marginBottom: '8px' }}>{error}</div>}
            <div style={s.row}>
              <input
                type="password"
                style={{ ...s.input, borderColor: '#e0c0be' }}
                placeholder={t('settings.password')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && performDelete()}
                autoFocus
              />
              <Btn danger onClick={performDelete} disabled={deleting || !password}>
                {deleting ? '…' : t('common.delete')}
              </Btn>
              <Btn onClick={resetDelete}>{t('common.cancel')}</Btn>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

// ── Appearance ───────────────────────────────────────────────────────────────

function AppearanceSection() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { fontId, setFont, headingFontId, setHeadingFont } = useFont();
  // Pending Google-font pick that's waiting on consent. { id, kind: 'body' | 'heading' } | null
  const [pendingFont, setPendingFont] = useState(null);
  // Font scale (UI zoom). Read once from localStorage; updates land via the
  // Ctrl+/Ctrl- shortcuts in App.jsx too, so we re-read on each render via
  // controlled input + a refresh tick driven by the settings-changed event.
  const [fontScale, setFontScaleState] = useState(getFontScale());
  useEffect(() => {
    function refresh() { setFontScaleState(getFontScale()); }
    window.addEventListener('liminal:settings-changed', refresh);
    return () => window.removeEventListener('liminal:settings-changed', refresh);
  }, []);
  function changeFontScale(value) {
    setFontScaleLocal(value);
    setFontScaleState(value);
    apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_font_scale: value }),
    }).catch(() => {});
  }

  function handlePick(kind, id) {
    if (needsGoogleFontsConsent(id)) {
      setPendingFont({ id, kind });
      return;
    }
    if (kind === 'body') setFont(id); else setHeadingFont(id);
  }

  function grantAndApply() {
    if (!pendingFont) return;
    setGoogleFontsConsent('granted');
    if (pendingFont.kind === 'body') setFont(pendingFont.id);
    else setHeadingFont(pendingFont.id);
    setPendingFont(null);
  }

  function denyConsent() {
    // We do NOT persist a 'denied' flag — the user might change their mind on
    // a different font later. We just dismiss the modal and leave the picker
    // pinned to its current value.
    setPendingFont(null);
  }

  return (
    <Section title={t('settings.sectionAppearance') || 'Appearance'}>
      <Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ThemeToggle />
          <span style={{ fontSize: '13px', color: 'var(--body)' }}>
            {theme === 'dark' ? (t('settings.darkMode') || 'Dark mode') : (t('settings.lightMode') || 'Light mode')}
          </span>
        </div>
      </Field>
      <Field label={t('settings.fontSize') || 'Font Size'} hint={t('settings.fontSizeHint') || 'Scales the entire app. Ctrl + / Ctrl - / Ctrl 0 also work.'}>
        <select style={s.input} value={fontScale} onChange={(e) => changeFontScale(e.target.value)}>
          {FONT_SCALE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      <Field label={t('settings.fontHeading') || 'Heading font'} hint={t('settings.fontHeadingHint') || 'Used on page titles. Cormorant Garamond is the default.'}>
        <select style={s.input} value={headingFontId} onChange={(e) => handlePick('heading', e.target.value)}>
          {FONTS.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>{f.label}</option>
          ))}
        </select>
      </Field>
      <Field label={t('settings.font') || 'Body font'} hint={t('settings.fontHint') || 'Used for paragraphs, entries, and UI chrome. Segoe UI is the default.'}>
        <select style={s.input} value={fontId} onChange={(e) => handlePick('body', e.target.value)}>
          {FONTS.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>{f.label}</option>
          ))}
        </select>
      </Field>
      {pendingFont && (
        <FontConsentModal
          fontLabel={getFont(pendingFont.id).label}
          onGrant={grantAndApply}
          onDeny={denyConsent}
        />
      )}
    </Section>
  );
}

// ── Replay tutorials ─────────────────────────────────────────────────────────
// Lets the user re-trigger any tour. Show again navigates to the host page
// and starts the tour fresh. Reset all clears the seen flags without firing
// any tour now (next first-visit will auto-trigger).

function ReplayTutorialsSection() {
  const { t } = useLanguage();
  const { resetTour } = useTutorial();
  const [flashed, setFlashed] = useState({});

  function flash(key, label) {
    setFlashed((prev) => ({ ...prev, [key]: label }));
    setTimeout(() => setFlashed((prev) => { const n = { ...prev }; delete n[key]; return n; }), 1400);
  }

  function replayTour(id) {
    window.dispatchEvent(new CustomEvent('liminal:replay-tour', { detail: { id } }));
    flash(id, t('common.saved') || 'Started');
  }

  function handleResetAll() {
    resetTour('all');
    flash('__all', t('common.saved') || 'Reset');
  }

  return (
    <Section title={t('settings.replayTutorials') || 'Replay tutorials'}>
      <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '12px' }}>
        {t('settings.replayTutorialsHint') ||
          'Show again replays the tour now. Reset all clears the seen flags so the tours auto-fire next time you visit each page.'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
        {TOUR_ORDER.map((id) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--strong)' }}>{t(TOUR_LABELS[id])}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {flashed[id] && (
                <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>{flashed[id]} ✓</span>
              )}
              <button
                onClick={() => replayTour(id)}
                style={{
                  fontSize: '12px',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  background: 'transparent',
                  color: 'var(--strong)',
                  border: 'var(--border-style)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                {t('settings.showAgain') || 'Show again'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
        {flashed.__all && (
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>{flashed.__all} ✓</span>
        )}
        <button
          onClick={handleResetAll}
          style={{
            fontSize: '12px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'transparent',
            color: 'var(--muted)',
            border: 'var(--border-style)',
            cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          {t('settings.resetAllTutorials') || 'Reset all'}
        </button>
      </div>
    </Section>
  );
}

// ── General Section ──────────────────────────────────────────────────────────

function GeneralSection({ cfg, set, save, saving, showToast }) {
  const { t } = useLanguage();
  const { theme } = useTheme();

  // ── Version / updates ───────────────────────────────────────────────────
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    apiFetch('/api/version/check')
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {
        apiFetch('/api/version').then(r => r.json()).then(d => setInfo({ current: d.current })).catch(() => {});
      });
  }, []);

  async function checkNow() {
    setChecking(true);
    try {
      const res = await apiFetch('/api/version/check?refresh=1');
      const data = await res.json();
      setInfo(data);
      if (data.error === 'offline') {
        showToast(t('settings.aboutOffline') || 'Could not reach update server');
      } else if (data.hasUpdate) {
        showToast(t('settings.aboutUpdateAvailable') || 'Update available');
      } else {
        showToast(t('settings.aboutUpToDate') || 'You are up to date');
      }
    } catch {
      showToast(t('settings.aboutOffline') || 'Could not reach update server');
    } finally {
      setChecking(false);
    }
  }

  const current = info?.current || '…';
  const checkedLabel = info?.checkedAt
    ? new Date(info.checkedAt).toLocaleString()
    : null;

  // ── Open on startup ─────────────────────────────────────────────────────
  const [openOnStartup, setOpenOnStartup] = useState(false);
  useEffect(() => {
    if (window.liminal?.getLoginItem) {
      window.liminal.getLoginItem().then(s => setOpenOnStartup(!!s?.openAtLogin)).catch(() => {});
    }
  }, []);

  // ── GitHub token (for update checks on private repos) ────────────────────

  // ── Web search / Tavily ─────────────────────────────────────────────────
  const [tavilyKey, setTavilyKey] = useState('');

  async function saveTavily() {
    const patch = {};
    if (tavilyKey && !tavilyKey.includes('••••')) patch.tavily_api_key = tavilyKey;
    if (Object.keys(patch).length) await save(patch);
  }

  return (
    <>
      {/* Open on startup */}
      <Section title={t('settings.openOnStartup')}>
        <Field hint={t('settings.openOnStartupHint')}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: window.liminal?.setLoginItem ? 'pointer' : 'not-allowed', opacity: window.liminal?.setLoginItem ? 1 : 0.5 }}>
            <input
              type="checkbox"
              checked={openOnStartup}
              onChange={async e => {
                const enabled = e.target.checked;
                setOpenOnStartup(enabled);
                if (window.liminal?.setLoginItem) {
                  await window.liminal.setLoginItem(enabled);
                }
              }}
              disabled={!window.liminal?.setLoginItem}
            />
            <span style={{ fontSize: '13px', color: 'var(--body)' }}>{t('settings.openOnStartupLabel')}</span>
          </label>
        </Field>
      </Section>

      {/* Restart Liminal */}
      <Section title={t('settings.restart')}>
        <RestartButton />
      </Section>

      {/* Weather location */}
      <WeatherLocationField />

      {/* Auto-lock */}
      <Section title={t('settings.lockTimeout')}>
        <Field hint={t('settings.lockTimeoutHint')}>
          <select
            style={s.input}
            value={cfg.lock_timeout_minutes || '30'}
            onChange={(e) => { set('lock_timeout_minutes', e.target.value); save({ lock_timeout_minutes: e.target.value }); }}
          >
            <option value="1">{t('settings.lockTimeout1')}</option>
            <option value="5">{t('settings.lockTimeout5')}</option>
            <option value="15">{t('settings.lockTimeout15')}</option>
            <option value="30">{t('settings.lockTimeout30')}</option>
            <option value="60">{t('settings.lockTimeout60')}</option>
            <option value="120">{t('settings.lockTimeout120')}</option>
            <option value="0">{t('settings.lockTimeoutNever')}</option>
          </select>
        </Field>
      </Section>

      {/* Web search */}
      <Section title={t('settings.webSearch')}>
        <Field hint={t('settings.webSearchHint')}>
          <div style={s.segmented}>
            {['off', 'on'].map((v, i, arr) => (
              <button
                key={v}
                style={{
                  ...s.segBtn,
                  ...(i === arr.length - 1 ? s.segBtnLast : {}),
                  ...(cfg.web_search_enabled === 'true' ? (v === 'on' ? s.segBtnActive : {}) : (v === 'off' ? s.segBtnActive : {})),
                }}
                onClick={() => { set('web_search_enabled', v === 'on' ? 'true' : 'false'); save({ web_search_enabled: v === 'on' ? 'true' : 'false' }); }}
              >
                {v === 'on' ? 'Enabled' : 'Disabled'}
              </button>
            ))}
          </div>
        </Field>

        {cfg.web_search_enabled === 'true' && (
          <Field
            label={t('settings.tavilyKey')}
            hint={cfg.has_tavily_key ? t('settings.tavilyKeySet') : t('settings.tavilyKeyHint')}
          >
            <div style={s.row}>
              <input
                style={s.input}
                type="password"
                placeholder={cfg.has_tavily_key ? '••••••••••••••••' : 'tvly-...'}
                value={tavilyKey}
                onChange={e => setTavilyKey(e.target.value)}
                autoComplete="off"
              />
              <Btn primary onClick={saveTavily} disabled={saving}>{t('common.save')}</Btn>
            </div>
          </Field>
        )}
      </Section>

      {/* Replay tutorials */}
      <ReplayTutorialsSection />

      {/* Version & updates */}
      <Section title={t('settings.aboutVersion')}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '20px' }}>
          <img src="/liminal-wordmark.png" alt="Liminal" style={{ height: '22px', objectFit: 'contain', opacity: 0.8, filter: theme === 'dark' ? 'invert(1)' : 'none' }} />
          <div style={{
            fontSize: '11px',
            padding: '3px 10px',
            borderRadius: '12px',
            background: 'var(--near-white)',
            border: 'var(--border-style)',
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            v{current}
          </div>
        </div>

        {info?.hasUpdate && info?.latest && (
          <div style={{
            padding: '14px 16px',
            border: 'var(--border-style)',
            borderRadius: '12px',
            background: 'var(--near-white)',
            marginBottom: '20px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--strong)', marginBottom: '4px' }}>
              {t('settings.aboutUpdateAvailable') || 'Update available'}: v{info.latest}
            </div>
            {info.releaseName && info.releaseName !== `v${info.latest}` && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>{info.releaseName}</div>
            )}
            {(info.installerUrl || info.releaseUrl) && (
              <a
                href={info.installerUrl || info.releaseUrl}
                {...(info.installerUrl ? { download: '' } : { target: '_blank', rel: 'noreferrer' })}
                style={{
                  display: 'inline-block',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: '500',
                  borderRadius: '20px',
                  background: 'var(--strong)',
                  color: 'var(--white)',
                  textDecoration: 'none',
                }}
              >
                {t('settings.aboutDownload') || 'Download'}
              </a>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Btn onClick={checkNow} disabled={checking}>
            {checking ? '…' : (t('settings.aboutCheck') || 'Check for updates')}
          </Btn>
          {!info?.hasUpdate && info?.latest && !info?.error && (
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              ✓ {t('settings.aboutUpToDate') || 'Up to date'}
            </span>
          )}
          {info?.error === 'offline' && (
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {t('settings.aboutOffline') || 'Offline'}
            </span>
          )}
        </div>
        {checkedLabel && (
          <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
            {(t('settings.aboutCheckedAt') || 'Last checked')}: {checkedLabel}
          </div>
        )}

        <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--muted)' }}>
          <a
            href="/THIRD_PARTY_LICENSES.txt"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--muted)', textDecoration: 'underline' }}
          >
            {t('settings.aboutOpenSourceNotices') || 'Open-source notices'}
          </a>
        </div>

        <div style={{ marginTop: '32px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
          Liminal — a personal AI journaling space.<br />
          Crafted by Savva Tsekmes.
        </div>
      </Section>
    </>
  );
}
