import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';
import { useLanguage, LANGUAGES } from '../i18n/LanguageContext';
import TermsOfService from '../components/TermsOfService';

// ── Shared styles ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'account', labelKey: 'settings.tabAccount' },
  { id: 'llm',     labelKey: 'settings.tabLLM' },
  { id: 'tts',     labelKey: 'settings.tabVoice' },
  { id: 'data',    labelKey: 'settings.tabData' },
  { id: 'about',   labelKey: 'settings.tabAbout' },
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
  const [cfg, setCfg] = useState(null);
  const [activeTab, setActiveTab] = useState('account');
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
      const updated = await res.json();
      setCfg(updated);
      window.dispatchEvent(new CustomEvent('liminal:settings-changed', { detail: updated }));
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
    <div style={s.root}>
      {/* Left tab strip */}
      <div style={s.tabStrip}>
        <div style={s.tabStripTitle}>{t('settings.title')}</div>
        {TABS.map(tab => (
          <button
            key={tab.id}
            style={{ ...s.tabItem, ...(activeTab === tab.id ? s.tabItemActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={s.tabContent}>
        {activeTab === 'llm'     && <LLMSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} />}
        {activeTab === 'tts'     && <TTSSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} onNavigate={onNavigate} />}
        {activeTab === 'account' && <AccountSection cfg={cfg} set={set} save={save} showToast={showToast} username={username} onLogout={onLogout} avatarUrl={avatarUrl} onAvatarChange={onAvatarChange} />}
        {activeTab === 'data'    && <DataSection showToast={showToast} />}
        {activeTab === 'about'   && <AboutSection showToast={showToast} />}
      </div>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}

// ── Ollama Model Browser ──────────────────────────────────────────────────────

const RECOMMENDED_MODELS = [
  // Lightweight — 4-6 GB VRAM (GTX 1060, RTX 2060, M1/M2)
  { name: 'qwen3.5:2b',   desc: 'Lightweight · 2.7GB · fast daily use' },
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
  const [tavilyKey, setTavilyKey] = useState('');
  const [ollamaData, setOllamaData] = useState(null); // { online, models }
  const [gpus, setGpus] = useState(null);

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
    if (tavilyKey && !tavilyKey.includes('••••')) patch.tavily_api_key = tavilyKey;
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
            <Field label={t('settings.gpuForOllama')} hint="Restart Ollama after changing. Uses CUDA_VISIBLE_DEVICES.">
              <select
                style={s.select}
                value={cfg.llm_device || 'auto'}
                onChange={e => { set('llm_device', e.target.value); save({ llm_device: e.target.value }); }}
              >
                <option value="auto">Auto (Ollama manages its own GPU)</option>
                {gpus.gpus?.map(g => (
                  <option key={g.id} value={g.name}>
                    {g.name} ({g.vram_gb} GB)
                  </option>
                ))}
              </select>
              {cfg.llm_device && cfg.llm_device !== 'auto' && (
                <div style={s.sublabel}>
                  Set CUDA_VISIBLE_DEVICES for the matching GPU when starting Ollama.
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

      <div style={{ borderTop: 'var(--border-style)', marginTop: '16px', paddingTop: '16px' }}>
        <Field label="Web Search" hint="Let the Oracle search the web via DuckDuckGo — no account needed">
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
            label="Tavily API Key (optional upgrade)"
            hint={cfg.has_tavily_key ? 'Key is set — using Tavily for higher quality results' : 'Uses DuckDuckGo by default. Add a Tavily key for richer results (free at tavily.com)'}
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
              <Btn primary onClick={saveKeys} disabled={saving}>{t('common.save')}</Btn>
            </div>
          </Field>
        )}

      </div>
    </Section>
  );
}

// ── Weather Location Field ───────────────────────────────────────────────────
function WeatherLocationField() {
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
    <div style={{ borderTop: 'var(--border-style)', marginTop: '16px', paddingTop: '16px' }}>
      <Field label="Weather Location" hint="City for weather on the home screen and AI context. Uses Open-Meteo — no API key needed.">
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
    </div>
  );
}

// ── TTS Section ───────────────────────────────────────────────────────────────
function TTSSection({ cfg, set, save, saving, showToast, onNavigate }) {
  const { t } = useLanguage();
  const mode = cfg.tts_mode || 'chatterbox';
  const [voices, setVoices] = useState([]);
  const [ttsStatus, setTtsStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [gpus, setGpus] = useState(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/tts/voices').then(r => r.json()).then(setVoices).catch(() => {});
    apiFetch('/api/tts/status').then(r => r.json()).then(d => setTtsStatus(d)).catch(() => {});
    apiFetch('/api/settings/gpus').then(r => r.json()).then(setGpus).catch(() => {});
  }, []);

  async function testTts() {
    setTesting(true);
    try {
      const res = await apiFetch('/api/settings/test-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatterbox_url: cfg.chatterbox_url, voice: cfg.chatterbox_voice }),
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

  async function uploadVoice(file) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('voice', file);
      const res = await apiFetch('/api/tts/voices', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        showToast(t('settings.voiceUploaded', { name: data.filename }));
        const updated = await apiFetch('/api/tts/voices').then(r => r.json());
        setVoices(updated);
        save({ chatterbox_voice: data.filename });
      }
    } catch { showToast(t('settings.uploadFailed')); }
    finally { setUploading(false); }
  }

  async function deleteVoice(filename, e) {
    e.stopPropagation();
    await apiFetch(`/api/tts/voices/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    setVoices(prev => prev.filter(v => v.filename !== filename));
    if (cfg.chatterbox_voice === filename) save({ chatterbox_voice: '' });
    showToast(t('settings.voiceDeleted', { name: filename }));
  }

  const selectedVoice = cfg.chatterbox_voice || 'Abigail.wav';

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
              hint={gpus.mps
                ? "Restart TTS server after changing."
                : "Restart TTS server after changing. Use GPU name to survive index changes."}
            >
              <select
                style={s.select}
                value={cfg.tts_device || 'auto'}
                onChange={e => { set('tts_device', e.target.value); save({ tts_device: e.target.value }); }}
              >
                <option value="auto">Auto (first available GPU)</option>
                <option value="cpu">CPU (slow)</option>
                {gpus.mps && (
                  <option value="mps">Apple Silicon GPU (Metal)</option>
                )}
                {gpus.gpus?.map(g => (
                  <option key={g.id} value={g.name}>
                    {g.name}{typeof g.vram_gb === 'number' ? ` (${g.vram_gb} GB)` : ''}
                  </option>
                ))}
              </select>
              {ttsStatus?.compat_mode && (
                <div style={{ marginTop: '6px', padding: '6px 10px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', fontSize: '11px', color: '#856404', lineHeight: '1.4' }}>
                  ⚠ Compatibility mode active — {ttsStatus.gpu_name || 'this GPU'} (compute {ttsStatus.compute_capability}) lacks fast attention kernels (requires 8.0+). TTS will work but generation is slower.
                </div>
              )}
            </Field>
          )}

          <Field label={t('settings.voice')}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                style={{ ...s.input, flex: 1 }}
                value={selectedVoice}
                onChange={e => { set('chatterbox_voice', e.target.value); save({ chatterbox_voice: e.target.value }); }}
              >
                {voices.length === 0 && <option value="">{t('settings.noVoicesFound')}</option>}
                {voices.map(v => (
                  <option key={v.filename} value={v.filename}>{v.name || v.filename}</option>
                ))}
              </select>
              <button
                style={{ ...s.saveBtn, whiteSpace: 'nowrap' }}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? '…' : t('settings.uploadVoice')}
              </button>
              {selectedVoice && voices.find(v => v.filename === selectedVoice)?.local && (
                <button
                  style={{ ...s.saveBtn, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}
                  onClick={() => deleteVoice(selectedVoice, { stopPropagation: () => {} })}
                  title={t('settings.deleteVoice')}
                >
                  {t('common.delete')}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3"
              style={{ display: 'none' }}
              onChange={e => e.target.files[0] && uploadVoice(e.target.files[0])}
            />
            <div style={{ ...s.sublabel, marginTop: '6px' }}>
              {t('settings.voiceFileHint')}
            </div>
            {onNavigate && (
              <div style={{ ...s.sublabel, marginTop: '4px' }}>
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

          <Field label={t('settings.voicesFolderPath')} hint={t('settings.voicesFolderHint')}>
            <input
              style={s.input}
              value={cfg.voices_path || ''}
              onChange={e => set('voices_path', e.target.value)}
              onBlur={() => save({ voices_path: cfg.voices_path })}
              placeholder="C:\Chatterbox\voices  (optional)"
            />
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
              min={0} max={1} step={0.05}
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

      <Field label={t('settings.voice')}>
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

      <WeatherLocationField />

      <Field label={t('settings.lockTimeout')} hint={t('settings.lockTimeoutHint')}>
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {t('settings.loggedInAs')} <strong style={{ color: 'var(--body)' }}>{username}</strong>
        </span>
        <Btn danger onClick={onLogout}>{t('settings.logOut')}</Btn>
      </div>

      <RestartButton />

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
  const [step, setStep] = useState(null);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');


  async function deleteAllEntries() {
    if (!password) return;
    setDeleting(true);
    setError('');
    try {
      const res = await apiFetch('/api/settings/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(t('settings.allEntriesDeleted'));
        setStep(null);
        setPassword('');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(data.error || 'Deletion failed');
      }
    } catch { setError(t('settings.deletionFailed')); }
    finally { setDeleting(false); }
  }

  function reset() { setStep(null); setPassword(''); setError(''); }

  // ── Backup config state ──────────────────────────────────────────────────
  const [backupLocation, setBackupLocation] = useState('');
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [maxBackups, setMaxBackups] = useState('10');
  const [backingUp, setBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoringBackup, setRestoringBackup] = useState(false);
  const restoreInputRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/settings').then(r => r.json()).then(data => {
      setBackupLocation(data.backup_location || '');
      setAutoBackupEnabled(data.auto_backup_enabled === 'true');
      setMaxBackups(data.max_backups || '10');
    }).catch(() => {});
  }, []);

  async function handleBrowseBackupFolder() {
    if (!window.liminal?.pickBackupFolder) {
      showToast(t('settings.backupBrowseUnavailable'));
      return;
    }
    const folder = await window.liminal.pickBackupFolder();
    if (folder) setBackupLocation(folder);
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
        <div style={{ ...s.label, marginBottom: '6px' }}>{t('settings.deleteAllEntries')}</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', lineHeight: '1.6' }}>
          {t('settings.deleteEntriesFullDesc')}
        </div>

        {!step && (
          <Btn danger onClick={() => setStep('confirm')}>{t('settings.deleteAllEntries')}</Btn>
        )}

        {step === 'confirm' && (
          <div style={s.confirmBox}>
            <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px', fontWeight: '500' }}>
              {t('settings.deleteEntriesConfirm')}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Btn danger onClick={() => setStep('password')}>{t('settings.yesContinue')}</Btn>
              <Btn onClick={reset}>{t('common.cancel')}</Btn>
            </div>
          </div>
        )}

        {step === 'password' && (
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
                onKeyDown={e => e.key === 'Enter' && deleteAllEntries()}
                autoFocus
              />
              <Btn danger onClick={deleteAllEntries} disabled={deleting || !password}>
                {deleting ? '…' : t('common.delete')}
              </Btn>
              <Btn onClick={reset}>{t('common.cancel')}</Btn>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

// ── About Section ─────────────────────────────────────────────────────────────

function AboutSection({ showToast }) {
  const { t } = useLanguage();
  const [info, setInfo] = useState(null);   // { current, latest, hasUpdate, releaseUrl, releaseName, checkedAt, error }
  const [checking, setChecking] = useState(false);

  // On mount: cached check (no network unless cache is stale)
  useEffect(() => {
    apiFetch('/api/version/check')
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {
        // Fall back to just the current version
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

  return (
    <>
      <Section title={t('settings.tabAbout') || 'About'}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '20px' }}>
          <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--strong)' }}>Liminal</div>
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
            {info.releaseUrl && (
              <a
                href={info.releaseUrl}
                target="_blank"
                rel="noreferrer"
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

        <div style={{ marginTop: '32px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
          Liminal — a personal AI journaling space.<br />
          Crafted by Savva Tsekmes.
        </div>
      </Section>
    </>
  );
}
