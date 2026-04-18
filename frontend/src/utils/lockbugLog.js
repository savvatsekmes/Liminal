import { apiFetch } from './api';

// Lock-bug tracing. Dormant by default — enable by setting
// localStorage['liminal:lockbug'] = '1' in devtools to ship every event to
// /api/debuglog (appended to lockbug.log on disk) and mirror to console.
// Kept in the tree so future bug hunts can reuse it without re-wiring.
export function lockbug(event, data) {
  try {
    if (typeof window === 'undefined') return;
    if (window.localStorage?.getItem('liminal:lockbug') !== '1') return;
    const payload = { event, ...data, t: Date.now() };
    console.log('[lockbug]', event, data);
    apiFetch('/api/debuglog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {}
}
