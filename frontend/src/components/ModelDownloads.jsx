import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';

// The built-in engine's downloadable models — shared by Settings → Language
// Model and the onboarding "AI model" step.

export function formatGB(bytes) {
  return bytes ? `${(bytes / 1073741824).toFixed(1)} GB` : '';
}

const btn = {
  padding: '8px 16px',
  fontSize: '12px',
  fontWeight: '500',
  border: 'var(--border-style)',
  borderRadius: '20px',
  background: 'var(--white)',
  color: 'var(--body)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--font)',
};
const btnPrimary = {
  background: 'var(--strong)',
  color: 'var(--white)',
  border: 'none',
  boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)',
};
const sublabel = { fontSize: '11px', color: 'var(--muted)', marginTop: '2px' };

function Btn({ primary, onClick, children }) {
  return <button type="button" style={{ ...btn, ...(primary ? btnPrimary : {}) }} onClick={onClick}>{children}</button>;
}

/**
 * The engine's status, models and download catalog from GET
 * /api/settings/builtin, polled every second while something downloads and
 * every few seconds otherwise. `onInstalled(modelId)` fires when a download
 * finishes.
 */
export function useBuiltinInfo(onInstalled) {
  const [info, setInfo] = useState(null);
  const aliveRef = useRef(true);
  const load = useCallback(() => apiFetch('/api/settings/builtin')
    .then((r) => r.json()).then((d) => { if (aliveRef.current) setInfo(d); }).catch(() => {}), []);
  const downloading = !!info?.catalog?.some((m) => m.status === 'downloading' || m.status === 'verifying');

  useEffect(() => {
    aliveRef.current = true;
    load();
    const id = setInterval(load, downloading ? 1000 : 4000);
    return () => { aliveRef.current = false; clearInterval(id); };
  }, [load, downloading]);

  const prevStatus = useRef({});
  const onInstalledRef = useRef(onInstalled);
  onInstalledRef.current = onInstalled;
  useEffect(() => {
    if (!info?.catalog) return;
    for (const m of info.catalog) {
      const was = prevStatus.current[m.id];
      if (m.status === 'installed' && was && was !== 'installed') onInstalledRef.current?.(m.modelId, info);
      prevStatus.current[m.id] = m.status;
    }
  }, [info]);

  return [info, load];
}

/** One downloadable model: what it's for, its size, and its download controls. */
export function ModelDownloadRow({ m, selected, onUse, onChanged, onDownload }) {
  const { t } = useLanguage();
  const post = (url, body) => apiFetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(onChanged).catch(onChanged);
  const download = () => { onDownload?.(m); post('/api/settings/builtin/download', { id: m.id }); };
  const cancel = () => post('/api/settings/builtin/download/cancel', { id: m.id });
  const remove = () => {
    if (!window.confirm(t('settings.builtinDeleteConfirm', { name: m.name }))) return;
    apiFetch(`/api/settings/builtin/models/${encodeURIComponent(m.id)}`, { method: 'DELETE' }).then(onChanged).catch(onChanged);
  };
  const pct = m.total ? Math.min(100, Math.round((m.received / m.total) * 100)) : 0;
  const busy = m.status === 'downloading' || m.status === 'verifying';

  return (
    <div style={{ padding: '12px 14px', background: 'var(--white)', borderRadius: '12px', border: m.recommended ? '1px solid var(--strong)' : 'var(--border-style)', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--strong)' }}>{m.name}</span>
        <span style={sublabel}>{formatGB(m.size)}</span>
        {m.recommended && (
          <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--white)', background: 'var(--strong)', borderRadius: '8px', padding: '2px 8px' }}>
            {t('settings.builtinRecommended')}
          </span>
        )}
      </div>
      <div style={{ ...sublabel, marginTop: '4px', lineHeight: 1.5 }}>
        {m.note}{!m.fits && ` ${t('settings.builtinMayNotFit')}`}
      </div>

      {busy && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ height: '4px', background: 'var(--near-white)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${m.status === 'verifying' ? 100 : pct}%`, height: '100%', background: 'var(--strong)', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={sublabel}>
              {m.status === 'verifying'
                ? t('settings.builtinVerifying')
                : t('settings.builtinProgress', { done: formatGB(m.received), total: formatGB(m.total), pct })}
            </span>
            {m.status === 'downloading' && <Btn onClick={cancel}>{t('common.cancel')}</Btn>}
          </div>
        </div>
      )}

      {!busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          {m.status === 'installed' ? (
            <>
              {selected
                ? <span style={{ ...sublabel, marginTop: 0 }}>{t('settings.builtinInUse')}</span>
                : <Btn primary onClick={onUse}>{t('settings.builtinUse')}</Btn>}
              <Btn onClick={remove}>{t('settings.builtinDelete')}</Btn>
            </>
          ) : m.status === 'paused' || m.status === 'error' ? (
            <>
              <Btn primary onClick={download}>{t('settings.builtinResume')}</Btn>
              <Btn onClick={cancel}>{t('settings.builtinDiscard')}</Btn>
              {m.status === 'error'
                ? <span style={{ fontSize: '11px', color: '#c54' }}>{m.error}</span>
                : <span style={sublabel}>{t('settings.builtinPaused', { done: formatGB(m.received) })}</span>}
            </>
          ) : (
            <Btn primary={m.recommended} onClick={download}>{t('settings.builtinDownload')}</Btn>
          )}
        </div>
      )}
    </div>
  );
}
