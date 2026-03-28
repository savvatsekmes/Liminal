import { useState, useEffect, useRef } from 'react';

const s = {
  root: {
    flex: 1,
    overflowY: 'auto',
    padding: '40px 48px',
    maxWidth: '620px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--strong)',
    marginBottom: '6px',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginBottom: '36px',
    fontStyle: 'italic',
  },
  dropzone: {
    border: '1.5px dashed var(--border)',
    borderRadius: '3px',
    padding: '40px 32px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    marginBottom: '20px',
  },
  dropzoneActive: {
    borderColor: 'var(--strong)',
    background: 'var(--near-white)',
  },
  dropIcon: {
    fontSize: '28px',
    color: 'var(--border)',
    marginBottom: '12px',
  },
  dropText: {
    fontSize: '13px',
    color: 'var(--body)',
    lineHeight: '1.7',
  },
  dropHint: {
    fontSize: '11px',
    color: 'var(--muted)',
    marginTop: '6px',
  },
  progressWrap: {
    margin: '20px 0',
    border: 'var(--border-style)',
    borderRadius: '2px',
    overflow: 'hidden',
    background: 'var(--panel-bg)',
  },
  progressBar: {
    height: '3px',
    background: 'var(--strong)',
    transition: 'width 0.4s ease',
  },
  progressText: {
    padding: '10px 14px',
    fontSize: '12px',
    color: 'var(--body)',
  },
  result: {
    marginTop: '20px',
    padding: '16px 20px',
    border: 'var(--border-style)',
    borderRadius: '2px',
    fontSize: '13px',
    color: 'var(--body)',
    lineHeight: '1.8',
    background: 'var(--near-white)',
  },
  instructions: {
    marginTop: '32px',
    padding: '20px 24px',
    background: 'var(--near-white)',
    border: 'var(--border-style)',
    borderRadius: '2px',
    fontSize: '12px',
    color: 'var(--body)',
    lineHeight: '1.8',
  },
  instructionsTitle: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '10px',
  },
};

export default function ImportPage({ onImportComplete }) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Check if an import is already running
    checkStatus();
    return () => clearInterval(pollRef.current);
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch('/api/notion/status');
      const data = await res.json();
      setStatus(data);

      if (data.running) {
        startPolling();
      }
    } catch {}
  }

  function startPolling() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/notion/status');
        const data = await res.json();
        setStatus(data);

        if (!data.running) {
          clearInterval(pollRef.current);
          if (data.phase === 'complete' && onImportComplete) {
            onImportComplete();
          }
        }
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
    } catch (err) {
      console.error('[import] Upload failed:', err);
    }
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
    <div style={s.root}>
      <div style={s.title}>Import from Notion</div>
      <div style={s.subtitle}>
        Bring your existing journal into Liminal. The memory system will read your whole history before you write your first entry here.
      </div>

      {/* Drop zone */}
      <div
        style={{ ...s.dropzone, ...(dragging ? s.dropzoneActive : {}) }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Drop Notion ZIP or click to select"
      >
        <div style={s.dropIcon}>⊕</div>
        <div style={s.dropText}>
          Drop your Notion export ZIP here, or click to select.
        </div>
        <div style={s.dropHint}>
          Export from Notion → Settings → Export → Markdown & CSV
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
        <div style={s.progressWrap}>
          <div style={{ ...s.progressBar, width: `${pct}%` }} />
          <div style={s.progressText}>
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

      {/* Instructions */}
      <div style={s.instructions}>
        <div style={s.instructionsTitle}>How to export from Notion</div>
        <ol style={{ paddingLeft: '18px' }}>
          <li>Open Notion → Click your workspace name (top left) → Settings</li>
          <li>Go to <strong>Settings → Export</strong></li>
          <li>Choose <strong>Markdown & CSV</strong>, then click Export</li>
          <li>Download the ZIP and drop it here</li>
        </ol>
        <div style={{ marginTop: '12px', color: 'var(--muted)', fontSize: '11px' }}>
          Import is duplicate-safe — running it again will never overwrite existing entries.
          Memory building runs in the background — you can start writing immediately.
        </div>
      </div>
    </div>
  );
}
