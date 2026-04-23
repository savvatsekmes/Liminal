import { useState } from 'react';
import { WIDGET_LABELS } from '../hooks/useLayout';
import { useLanguage } from '../i18n/LanguageContext';

const s = {
  panel: {
    border: 'var(--border-style)',
    borderRadius: '16px',
    background: 'var(--white)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    padding: '20px 24px',
    marginBottom: '20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  title: {
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  doneBtn: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--strong)',
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '5px 14px',
    cursor: 'pointer',
  },
  label: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--muted)',
    marginBottom: '6px',
    display: 'block',
  },
  select: {
    width: '100%',
    fontSize: '13px',
    padding: '8px 12px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--white)',
    color: 'var(--body)',
    marginBottom: '14px',
    cursor: 'pointer',
    appearance: 'auto',
  },
  row: {
    display: 'flex',
    gap: '10px',
    marginBottom: '14px',
  },
  selectHalf: {
    flex: 1,
    fontSize: '13px',
    padding: '8px 12px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--white)',
    color: 'var(--body)',
    cursor: 'pointer',
    appearance: 'auto',
  },
  saveRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  saveInput: {
    flex: 1,
    fontSize: '13px',
    padding: '7px 12px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--white)',
    color: 'var(--body)',
  },
  saveBtn: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--white)',
    background: 'var(--strong)',
    border: 'none',
    borderRadius: '10px',
    padding: '7px 16px',
    cursor: 'pointer',
  },
  unsavedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '10px',
    fontSize: '11px',
    color: 'var(--muted)',
  },
  linkBtn: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--strong)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
  deleteBtn: {
    fontSize: '11px',
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    marginLeft: 'auto',
  },
};

export default function LayoutEditor({
  savedLayouts,
  activeLayoutId,
  isLiminalDefault,
  dirty,
  availableWidgets,
  onSelectLayout,
  onAddWidget,
  onSaveLayout,
  onDeleteLayout,
  onDiscard,
  onDone,
}) {
  const { t } = useLanguage();
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');

  function handleLayoutChange(e) {
    const val = e.target.value;
    if (val === 'liminal') {
      onSelectLayout(null);
    } else if (val === 'custom') {
      onSelectLayout('custom');
    } else {
      onSelectLayout(Number(val));
    }
  }

  async function handleSave() {
    const name = saveName.trim();
    if (!name) return;
    await onSaveLayout(name);
    setShowSave(false);
    setSaveName('');
  }

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>Layout Editor</span>
        {!dirty && (
          <button style={s.doneBtn} onClick={onDone}>Done</button>
        )}
      </div>

      {/* Layout + Add Widget dropdowns side by side */}
      <div style={s.row}>
        <div style={{ flex: 1 }}>
          <span style={s.label}>Layout</span>
          <select style={{ ...s.selectHalf, width: '100%' }} value={isLiminalDefault ? 'liminal' : (activeLayoutId || 'custom')} onChange={handleLayoutChange}>
            <option value="liminal">Liminal (default)</option>
            {savedLayouts.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
            {!activeLayoutId && !isLiminalDefault && <option value="custom">Custom (unsaved)</option>}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <span style={s.label}>Add section</span>
          <select
            style={{ ...s.selectHalf, width: '100%', ...(availableWidgets.length === 0 ? { opacity: 0.4 } : {}) }}
            value=""
            onChange={(e) => { if (e.target.value) onAddWidget(e.target.value); }}
            disabled={availableWidgets.length === 0}
          >
            <option value="">{availableWidgets.length === 0 ? 'All sections added' : 'Choose a section...'}</option>
            {availableWidgets.map(id => (
              <option key={id} value={id}>{t(WIDGET_LABELS[id] || id)}</option>
            ))}
          </select>
        </div>
      </div>

      {!isLiminalDefault && dirty && !showSave && (
        <div style={s.unsavedRow}>
          <span>Unsaved changes</span>
          {activeLayoutId && (
            <button style={s.linkBtn} onClick={() => onSaveLayout(savedLayouts.find(l => l.id === activeLayoutId)?.name || 'Layout')}>Save changes</button>
          )}
          <button style={s.linkBtn} onClick={() => setShowSave(true)}>Save as new</button>
          <button style={s.linkBtn} onClick={() => { onDiscard(); }}>Discard</button>
          <button style={s.doneBtn} onClick={onDone}>Done</button>
        </div>
      )}

      {!isLiminalDefault && showSave && (
        <div>
          <span style={s.label}>Layout name</span>
          <div style={s.saveRow}>
            <input
              style={s.saveInput}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="My layout"
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              autoFocus
            />
            <button style={s.saveBtn} onClick={handleSave}>Save</button>
          </div>
        </div>
      )}

      {!isLiminalDefault && activeLayoutId && !dirty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button style={s.deleteBtn} onClick={() => onDeleteLayout(activeLayoutId)}>Delete this layout</button>
        </div>
      )}
    </div>
  );
}
