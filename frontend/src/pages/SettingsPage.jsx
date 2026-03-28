import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';

// ── Shared styles ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'llm',     label: 'Language Model' },
  { id: 'tts',     label: 'Voice' },
  { id: 'context', label: 'Life Context' },
  { id: 'memory',  label: 'Memory' },
  { id: 'account', label: 'Account' },
  { id: 'import',  label: 'Import' },
  { id: 'data',    label: 'Data' },
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
    color: 'var(--body)',
  },
  memoryBox: {
    padding: '14px 16px',
    border: 'var(--border-style)',
    borderRadius: '2px',
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
    borderRadius: '2px',
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
    borderRadius: '2px',
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
export default function SettingsPage({ username, onLogout }) {
  const [cfg, setCfg] = useState(null);
  const [activeTab, setActiveTab] = useState('llm');
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
      showToast('Saved');
    } catch { showToast('Save failed'); }
    finally { setSaving(false); }
  }

  function set(key, value) {
    setCfg(c => ({ ...c, [key]: value }));
  }

  if (!cfg) {
    return <div style={{ padding: '40px 48px', color: 'var(--muted)', fontSize: '13px' }}>Loading…</div>;
  }

  return (
    <div style={s.root}>
      {/* Left tab strip */}
      <div style={s.tabStrip}>
        <div style={s.tabStripTitle}>Settings</div>
        {TABS.map(tab => (
          <button
            key={tab.id}
            style={{ ...s.tabItem, ...(activeTab === tab.id ? s.tabItemActive : {}) }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={s.tabContent}>
        {activeTab === 'llm'     && <LLMSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} />}
        {activeTab === 'tts'     && <TTSSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} />}
        {activeTab === 'context' && <LifeContextSection showToast={showToast} />}
        {activeTab === 'memory'  && <MemorySection showToast={showToast} />}
        {activeTab === 'account' && <AccountSection cfg={cfg} set={set} save={save} showToast={showToast} username={username} onLogout={onLogout} />}
        {activeTab === 'import'  && <NotionImportSection />}
        {activeTab === 'data'    && <DataSection showToast={showToast} />}
      </div>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}

// ── Ollama Model Browser ──────────────────────────────────────────────────────

const RECOMMENDED_MODELS = [
  { name: 'llama3.2:3b',  desc: 'Fast · good for daily use' },
  { name: 'llama3.1:8b',  desc: 'Better quality · needs more RAM' },
  { name: 'mistral:7b',   desc: 'Excellent reasoning' },
  { name: 'qwen2.5:7b',   desc: 'Strong multilingual' },
  { name: 'gemma3:4b',    desc: 'Google · very capable' },
];

function OllamaModelBrowser({ installedNames, ollamaOnline, onDownloaded }) {
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
        Recommended models
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{ flex: 1, fontSize: '12px', padding: '6px 8px', border: 'var(--border-style)', borderRadius: '2px', background: 'var(--white)', color: 'var(--strong)', outline: 'none', fontFamily: 'var(--font)' }}
        >
          <option value=''>Select a model…</option>
          {RECOMMENDED_MODELS.map(x => (
            <option key={x.name} value={x.name}>{x.name} — {x.desc}</option>
          ))}
        </select>
        {m && (
          installed ? (
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', flexShrink: 0 }}>Installed</span>
          ) : pull ? (
            <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>Downloading…</span>
          ) : (
            <button
              onClick={() => downloadModel(m.name)}
              style={{ fontSize: '11px', color: 'var(--body)', padding: '5px 12px', border: 'var(--border-style)', borderRadius: '2px', flexShrink: 0, background: 'var(--white)', cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              Download
            </button>
          )
        )}
      </div>
      {pull && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{pull.status}</div>
          {pull.total > 0 && (
            <div style={{ height: '3px', background: 'var(--panel-bg)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--strong)', width: `${Math.round((pull.progress / pull.total) * 100)}%`, transition: 'width 0.3s' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── LLM Section ───────────────────────────────────────────────────────────────
function LLMSection({ cfg, set, save, saving, showToast }) {
  const provider = cfg.llm_provider || 'claude';
  const [testStatus, setTestStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
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
    if (provider === 'openai') patch.openai_model = cfg.openai_model;
    if (provider === 'ollama') { patch.ollama_url = cfg.ollama_url; patch.ollama_model = cfg.ollama_model; }
    await save(patch);
  }

  return (
    <Section title="Language Model">
      <Field label="Provider">
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
              {p === 'claude' ? 'Claude' : p === 'openai' ? 'OpenAI' : 'Ollama (local)'}
            </button>
          ))}
        </div>
      </Field>

      {provider === 'claude' && (
        <>
        <Field
          label="Anthropic API key"
          hint={cfg.has_anthropic_key ? '✓ Key is set' : 'Required — get one at console.anthropic.com'}
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
            <Btn primary onClick={saveKeys} disabled={saving}>Save</Btn>
          </div>
        </Field>
        <Field label="Model">
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
            label="OpenAI API key"
            hint={cfg.has_openai_key ? '✓ Key is set' : 'Required — get one at platform.openai.com'}
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
              <Btn primary onClick={saveKeys} disabled={saving}>Save</Btn>
            </div>
          </Field>
          <Field label="Model">
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
          <Field label="Ollama URL" hint="Default: http://localhost:11434">
            <input
              style={s.input}
              value={cfg.ollama_url || 'http://localhost:11434'}
              onChange={e => set('ollama_url', e.target.value)}
              onBlur={() => save({ ollama_url: cfg.ollama_url })}
              placeholder="http://localhost:11434"
            />
          </Field>

          <Field label="Active model">
            {!ollamaData && (
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Checking Ollama…</div>
            )}
            {ollamaData && !ollamaData.online && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 10px', border: 'var(--border-style)', borderRadius: '2px', background: 'var(--near-white)' }}>
                Ollama is not running. Start Ollama to see installed models.
              </div>
            )}
            {ollamaData?.online && ollamaData.models?.length > 0 && (
              <select
                style={s.select}
                value={cfg.ollama_model || ''}
                onChange={e => { set('ollama_model', e.target.value); save({ ollama_model: e.target.value }); }}
              >
                {ollamaData.models.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            )}
            {ollamaData?.online && ollamaData.models?.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 10px', border: 'var(--border-style)', borderRadius: '2px', background: 'var(--near-white)' }}>
                No models installed. Download one below.
              </div>
            )}
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
            <Field label="GPU for Ollama" hint="Set CUDA_VISIBLE_DEVICES before starting Ollama to restrict it to a specific GPU.">
              <select
                style={s.select}
                value={cfg.llm_device || 'auto'}
                onChange={e => { set('llm_device', e.target.value); save({ llm_device: e.target.value }); }}
              >
                <option value="auto">Auto (Ollama manages its own GPU)</option>
                {gpus.gpus?.map(g => (
                  <option key={g.id} value={`cuda:${g.id}`}>
                    cuda:{g.id} — {g.name} ({g.vram_gb} GB)
                  </option>
                ))}
              </select>
              {cfg.llm_device && cfg.llm_device !== 'auto' && (
                <div style={s.sublabel}>
                  Set CUDA_VISIBLE_DEVICES={cfg.llm_device.replace('cuda:', '')} when starting Ollama to use this GPU.
                </div>
              )}
            </Field>
          )}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
        <Btn onClick={testConnection} disabled={testing}>
          {testing ? 'Testing…' : 'Test connection'}
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

// ── TTS Section ───────────────────────────────────────────────────────────────
function TTSSection({ cfg, set, save, saving, showToast }) {
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
      showToast('Chatterbox not reachable');
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
        showToast(`Voice "${data.filename}" uploaded`);
        const updated = await apiFetch('/api/tts/voices').then(r => r.json());
        setVoices(updated);
        save({ chatterbox_voice: data.filename });
      }
    } catch { showToast('Upload failed'); }
    finally { setUploading(false); }
  }

  async function deleteVoice(filename, e) {
    e.stopPropagation();
    await apiFetch(`/api/tts/voices/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    setVoices(prev => prev.filter(v => v.filename !== filename));
    if (cfg.chatterbox_voice === filename) save({ chatterbox_voice: '' });
    showToast(`Voice "${filename}" deleted`);
  }

  const selectedVoice = cfg.chatterbox_voice || 'Abigail.wav';

  return (
    <Section title="Voice & Text-to-Speech">
      <Field label="Provider">
        <div style={s.segmented}>
          {[['chatterbox', 'Chatterbox (local)'], ['openai', 'OpenAI TTS'], ['webspeech', 'Browser built-in']].map(([val, label], i, arr) => (
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
              {ttsStatus?.online ? 'Chatterbox server online' : 'Chatterbox server offline — start it to enable voice'}
            </span>
          </div>

          <Field label="Server URL">
            <input
              style={s.input}
              value={cfg.chatterbox_url || 'http://localhost:8500'}
              onChange={e => set('chatterbox_url', e.target.value)}
              onBlur={() => save({ chatterbox_url: cfg.chatterbox_url })}
              placeholder="http://localhost:8500"
            />
          </Field>

          {gpus && (
            <Field label="GPU for TTS" hint="Which device Chatterbox runs on. Restart TTS server after changing.">
              <select
                style={s.select}
                value={cfg.tts_device || 'auto'}
                onChange={e => { set('tts_device', e.target.value); save({ tts_device: e.target.value }); }}
              >
                <option value="auto">Auto (first available GPU)</option>
                <option value="cpu">CPU (slow)</option>
                {gpus.gpus?.map(g => (
                  <option key={g.id} value={`cuda:${g.id}`}>
                    cuda:{g.id} — {g.name} ({g.vram_gb} GB)
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Voice">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                style={{ ...s.input, flex: 1 }}
                value={selectedVoice}
                onChange={e => { set('chatterbox_voice', e.target.value); save({ chatterbox_voice: e.target.value }); }}
              >
                {voices.length === 0 && <option value="">No voices found</option>}
                {voices.map(v => (
                  <option key={v.filename} value={v.filename}>{v.name || v.filename}</option>
                ))}
              </select>
              <button
                style={{ ...s.saveBtn, whiteSpace: 'nowrap' }}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? '…' : '+ Upload'}
              </button>
              {selectedVoice && voices.find(v => v.filename === selectedVoice)?.local && (
                <button
                  style={{ ...s.saveBtn, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)' }}
                  onClick={() => deleteVoice(selectedVoice, { stopPropagation: () => {} })}
                  title="Delete selected voice"
                >
                  Delete
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
              .wav or .mp3 — uploaded to the voices folder Chatterbox reads from
            </div>
          </Field>

          <Field label="Voices folder path" hint="Where Chatterbox looks for voice files. Leave blank to use Liminal's built-in folder.">
            <input
              style={s.input}
              value={cfg.voices_path || ''}
              onChange={e => set('voices_path', e.target.value)}
              onBlur={() => save({ voices_path: cfg.voices_path })}
              placeholder="C:\Chatterbox\voices  (optional)"
            />
          </Field>

          <div style={s.divider} />

          <Field label="Emotion / Expression">
            <TtsSlider
              label="Exaggeration"
              hint="0 = flat, 0.6 = natural, 2.0 = very expressive"
              min={0} max={2} step={0.05}
              value={parseFloat(cfg.chatterbox_exaggeration ?? 0.6)}
              onChange={v => { set('chatterbox_exaggeration', v); save({ chatterbox_exaggeration: v }); }}
            />
            <TtsSlider
              label="Voice fidelity (cfg weight)"
              hint="Higher = closer to reference voice"
              min={0} max={1} step={0.05}
              value={parseFloat(cfg.chatterbox_cfg_weight ?? 0.9)}
              onChange={v => { set('chatterbox_cfg_weight', v); save({ chatterbox_cfg_weight: v }); }}
            />
            <TtsSlider
              label="Variation (temperature)"
              hint="Higher = more natural variation. Above 2.0 can cause issues."
              min={0} max={2} step={0.05}
              value={parseFloat(cfg.chatterbox_temperature ?? 1.3)}
              onChange={v => { set('chatterbox_temperature', v); save({ chatterbox_temperature: v }); }}
            />
          </Field>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Btn onClick={testTts} disabled={testing}>
              {testing ? 'Speaking…' : '▶ Test voice'}
            </Btn>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Speaks "Liminal is listening." with current settings
            </span>
          </div>
        </>
      )}

      {mode === 'openai' && (
        <OpenAITtsSection cfg={cfg} set={set} save={save} saving={saving} showToast={showToast} />
      )}

      {mode === 'webspeech' && (
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.7', padding: '12px 0' }}>
          Using the browser's built-in speech synthesis. No setup required, but voice quality varies by browser and OS.
        </div>
      )}
    </Section>
  );
}

// ── OpenAI TTS sub-section ────────────────────────────────────────────────────
function OpenAITtsSection({ cfg, set, save, saving, showToast }) {
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
    } catch { showToast('OpenAI TTS failed — check your API key'); }
    finally { setTesting(false); }
  }

  return (
    <>
      <Field
        label="OpenAI API key"
        hint={cfg.has_openai_key ? '✓ Key is set — also used for the LLM section' : 'Required'}
      >
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
          Uses the same OpenAI key as the LLM section. Set it there if not already saved.
        </div>
      </Field>

      <Field label="Voice">
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
          Note: Anthropic does not offer a TTS API — use Chatterbox (local) or OpenAI TTS.
        </div>
      </Field>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Btn onClick={testOpenAITts} disabled={testing || !cfg.has_openai_key}>
          {testing ? 'Speaking…' : '▶ Test voice'}
        </Btn>
        {!cfg.has_openai_key && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Set OpenAI API key first</span>}
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

// ── Memory Section ────────────────────────────────────────────────────────────
function MemorySection({ showToast }) {
  const [mem, setMem] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    apiFetch('/api/settings/memory').then(r => r.json()).then(setMem).catch(() => {});
  }, []);

  async function clearMemory() {
    setClearing(true);
    await apiFetch('/api/settings/memory', { method: 'DELETE' });
    setMem({ summary: '', updated_at: null, word_count: 0 });
    setClearing(false);
    setConfirmClear(false);
    showToast('Memory cleared');
  }

  async function reindex() {
    setReindexing(true);
    await apiFetch('/api/settings/reindex', { method: 'POST' });
    showToast('Re-indexing started in background');
    setTimeout(() => setReindexing(false), 2000);
  }

  const updatedStr = mem?.updated_at
    ? new Date(mem.updated_at).toLocaleString()
    : null;

  return (
    <Section title="Memory">
      <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.7', marginBottom: '16px' }}>
        The rolling summary is injected into every Mirror reflection. It's what makes Liminal feel like it knows you.
        {updatedStr && <span style={{ display: 'block', marginTop: '4px' }}>Last updated: {updatedStr} — {mem?.word_count || 0} words</span>}
      </div>

      {mem?.summary ? (
        <div style={s.memoryBox}>{mem.summary}</div>
      ) : (
        <div style={{ ...s.memoryBox, color: 'var(--muted)' }}>
          No memory yet. Write an entry and hit Reflect to build it.
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
        <Btn onClick={reindex} disabled={reindexing}>
          {reindexing ? 'Starting…' : 'Re-index all entries'}
        </Btn>
        <Btn danger onClick={() => setConfirmClear(true)} disabled={!mem?.summary}>
          Clear memory summary
        </Btn>
      </div>

      {confirmClear && (
        <div style={s.confirmBox}>
          <div style={{ fontSize: '12px', color: 'var(--body)', marginBottom: '10px' }}>
            This deletes the rolling summary. Liminal will rebuild it after your next Reflect. Are you sure?
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Btn danger onClick={clearMemory} disabled={clearing}>{clearing ? 'Clearing…' : 'Yes, clear it'}</Btn>
            <Btn onClick={() => setConfirmClear(false)}>Cancel</Btn>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Account Section ───────────────────────────────────────────────────────────
function AccountSection({ cfg, set, save, showToast, username, onLogout }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  async function changePassword() {
    setPwError('');
    if (!currentPw || !newPw) { setPwError('All fields required.'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
    if (newPw.length < 4) { setPwError('Password must be at least 4 characters.'); return; }

    setSavingPw(true);
    try {
      const res = await apiFetch('/api/auth/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Password changed');
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
      } else {
        setPwError(data.error || 'Failed.');
      }
    } catch { setPwError('Request failed.'); }
    finally { setSavingPw(false); }
  }

  return (
    <Section title="Account">
      <Field label="Display name" hint="Used as a personal greeting — doesn't affect AI behaviour">
        <div style={s.row}>
          <input
            style={s.input}
            value={cfg.display_name || ''}
            onChange={e => set('display_name', e.target.value)}
            placeholder="Your name"
          />
          <Btn primary onClick={() => save({ display_name: cfg.display_name })}>Save</Btn>
        </div>
      </Field>

      <div style={s.divider} />

      <div style={{ ...s.label, marginBottom: '14px' }}>Change password</div>
      <Field label="Current password">
        <input style={s.input} type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="New password">
        <input style={s.input} type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password">
        <input style={s.input} type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} autoComplete="new-password" />
      </Field>
      {pwError && <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px' }}>{pwError}</div>}
      <Btn primary onClick={changePassword} disabled={savingPw}>
        {savingPw ? 'Updating…' : 'Update password'}
      </Btn>

      <div style={s.divider} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          Logged in as <strong style={{ color: 'var(--body)' }}>{username}</strong>
        </span>
        <Btn danger onClick={onLogout}>Log out</Btn>
      </div>

      <RestartButton />
    </Section>
  );
}

function RestartButton() {
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
        Restarting Liminal… reloading in {countdown}s
      </div>
    );
  }

  return (
    <Btn onClick={handleRestart}>Restart Liminal</Btn>
  );
}

// ── Life Context Section ───────────────────────────────────────────────────────
function LifeContextSection({ showToast }) {
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    apiFetch('/api/context').then(r => r.json()).then(setItems).catch(() => {});
  }, []);

  async function addItem() {
    if (!newText.trim()) return;
    const res = await apiFetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText.trim() }),
    });
    const item = await res.json();
    setItems(prev => [item, ...prev]);
    setNewText('');
    showToast('Added to life context');
  }

  async function saveEdit(id) {
    if (!editText.trim()) return;
    const res = await apiFetch(`/api/context/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: editText.trim() }),
    });
    const updated = await res.json();
    setItems(prev => prev.map(i => i.id === id ? updated : i));
    setEditId(null);
    setEditText('');
    showToast('Updated');
  }

  async function deleteItem(id) {
    await apiFetch(`/api/context/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
    showToast('Removed');
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <Section title="Life Context">
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.6' }}>
        These curated snippets are injected into every reflection above the rolling summary.
        Highlight text in any journal entry and click "Add to Life Context", or add one manually below.
      </div>

      {/* Manual add */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input
          style={{ ...s.input, flex: 1 }}
          placeholder="Add a context item manually..."
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
        />
        <Btn onClick={addItem} disabled={!newText.trim()}>Add</Btn>
      </div>

      {/* Items list */}
      {items.length === 0 && (
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic', padding: '16px 0' }}>
          No context items yet. Highlight text in a journal entry to save it here.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.map(item => (
          <div key={item.id} style={{
            padding: '12px 14px',
            border: 'var(--border-style)',
            borderRadius: '2px',
            background: 'var(--near-white)',
          }}>
            {editId === item.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  style={{ ...s.input, minHeight: '72px', resize: 'vertical' }}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Btn primary onClick={() => saveEdit(item.id)}>Save</Btn>
                  <Btn onClick={() => { setEditId(null); setEditText(''); }}>Cancel</Btn>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '13px', color: 'var(--strong)', lineHeight: '1.55', marginBottom: '8px' }}>
                  {item.text}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {item.source_entry_title && (
                    <span style={{ fontSize: '11px', color: 'var(--muted)', flex: 1 }}>
                      From: {item.source_entry_title}
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto' }}>
                    {formatDate(item.created_at)}
                  </span>
                  <button
                    onClick={() => { setEditId(item.id); setEditText(item.text); }}
                    style={{ fontSize: '11px', color: 'var(--muted)', padding: '2px 6px', border: 'var(--border-style)', borderRadius: '2px' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    style={{ fontSize: '11px', color: 'var(--muted)', padding: '2px 6px', border: 'var(--border-style)', borderRadius: '2px' }}
                  >
                    ×
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Data Section ──────────────────────────────────────────────────────────────
// ── Notion Import Section ─────────────────────────────────────────────────────

function NotionImportSection() {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    checkStatus();
    return () => clearInterval(pollRef.current);
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch('/api/notion/status');
      const data = await res.json();
      setStatus(data);
      if (data.running) startPolling();
    } catch {}
  }

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/notion/status');
        const data = await res.json();
        setStatus(data);
        if (!data.running) clearInterval(pollRef.current);
      } catch {}
    }, 1200);
  }

  async function handleFile(file) {
    if (!file || !file.name.endsWith('.zip')) {
      alert('Please select a Notion export ZIP file.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      await fetch('/api/notion/import', { method: 'POST', body: formData });
      startPolling();
    } catch {}
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const pct = status?.total > 0 ? Math.round((status.done / status.total) * 100) : 0;
  const showProgress = status?.running || status?.phase === 'complete' || status?.phase === 'error';

  return (
    <Section title="Import from Notion">
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.7' }}>
        Drop your Notion export ZIP to bring your history into Liminal.
        Import is duplicate-safe — running it again won't overwrite existing entries.
      </div>

      {/* Drop zone */}
      <div
        style={{
          border: `1.5px dashed ${dragging ? 'var(--strong)' : 'var(--border)'}`,
          background: dragging ? 'var(--near-white)' : 'transparent',
          borderRadius: '3px',
          padding: '28px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
          marginBottom: '14px',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <div style={{ fontSize: '22px', color: 'var(--border)', marginBottom: '8px' }}>⊕</div>
        <div style={{ fontSize: '12px', color: 'var(--body)' }}>
          Drop Notion export ZIP here, or click to select
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Notion → Settings → Export → Markdown & CSV
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
        />
      </div>

      {/* Progress */}
      {showProgress && (
        <div style={{ border: 'var(--border-style)', borderRadius: '2px', overflow: 'hidden', background: 'var(--panel-bg)' }}>
          <div style={{ height: '3px', background: 'var(--strong)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
          <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--body)' }}>
            {status.phase === 'error'
              ? `Error: ${status.message}`
              : status.message || 'Working…'}
            {status.phase === 'complete' && status.result && (
              <span style={{ marginLeft: '8px', color: 'var(--muted)' }}>
                ({status.result.imported} imported, {status.result.skipped} skipped)
              </span>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Data Section ──────────────────────────────────────────────────────────────

function DataSection({ showToast }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function exportJournal() {
    const a = document.createElement('a');
    a.href = '/api/settings/export';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Export started');
  }

  async function deleteAllData() {
    if (deleteInput !== 'DELETE') { showToast('Type DELETE to confirm'); return; }
    setDeleting(true);
    try {
      const res = await apiFetch('/api/settings/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('All data deleted');
        setConfirmDelete(false);
        setDeleteInput('');
        // Reload so entry list empties
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch { showToast('Deletion failed'); }
    finally { setDeleting(false); }
  }

  return (
    <Section title="Data">
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <Btn onClick={exportJournal}>
          ↓ Export journal (JSON)
        </Btn>
      </div>

      <div style={{ ...s.label, marginBottom: '6px' }}>Delete all data</div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', lineHeight: '1.6' }}>
        Permanently deletes all journal entries, tags, and the memory summary.
        Your password and portrait are kept. This cannot be undone.
      </div>

      {!confirmDelete ? (
        <Btn danger onClick={() => setConfirmDelete(true)}>Delete all entries and memory</Btn>
      ) : (
        <div style={s.confirmBox}>
          <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '10px', fontWeight: '500' }}>
            Type DELETE to confirm permanent deletion
          </div>
          <div style={s.row}>
            <input
              style={{ ...s.input, borderColor: '#e0c0be' }}
              placeholder="DELETE"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              autoFocus
            />
            <Btn danger onClick={deleteAllData} disabled={deleting || deleteInput !== 'DELETE'}>
              {deleting ? '…' : 'Delete'}
            </Btn>
            <Btn onClick={() => { setConfirmDelete(false); setDeleteInput(''); }}>Cancel</Btn>
          </div>
        </div>
      )}
    </Section>
  );
}
