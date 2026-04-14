/**
 * TTS status — on-demand startup via Electron IPC, with polling fallback.
 * Components use useTtsOnline() hook or call waitForChatterbox() before speaking.
 * TTS server is NOT started on boot — it's spawned on first use and killed after idle.
 */
import { useState, useEffect } from 'react';

let online = false;
let loading = false;
const listeners = new Set();
const loadingListeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(online));
}

function notifyLoading() {
  loadingListeners.forEach((fn) => fn(loading));
}

/** React hook — true while a Chatterbox spawn/warmup is in progress. */
export function useTtsLoading() {
  const [value, setValue] = useState(loading);
  useEffect(() => {
    setValue(loading);
    loadingListeners.add(setValue);
    return () => loadingListeners.delete(setValue);
  }, []);
  return value;
}

async function check() {
  try {
    const res = await fetch('/api/tts/status');
    const data = await res.json();
    if (data.online) {
      online = true;
      notify();
      return true;
    }
  } catch {}
  return false;
}

// Light initial check (single attempt, no long poll)
check();

/** Returns true if Chatterbox is currently known to be online */
export function isChatterboxOnline() {
  return online;
}

/**
 * React hook — returns true once Chatterbox comes online.
 */
export function useTtsOnline() {
  const [value, setValue] = useState(online);
  useEffect(() => {
    setValue(online);
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}

/**
 * Ensure TTS is running and wait for it to come online, up to timeoutMs.
 * Uses Electron IPC to spawn the TTS server on-demand if available.
 * Returns true if online, false if timed out.
 */
export async function waitForChatterbox(timeoutMs = 45000) {
  if (online) return true;

  loading = true;
  notifyLoading();
  try {
    if (window.liminal?.ensureTts) {
      try {
        const result = await window.liminal.ensureTts();
        if (result?.ok) {
          online = true;
          notify();
          return true;
        }
      } catch {}
    } else {
      try {
        const r = await fetch('/api/tts/ensure', { method: 'POST' });
        if (r.ok) {
          const data = await r.json();
          if (data.ok) {
            online = true;
            notify();
            return true;
          }
        }
      } catch {}
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return true;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  } finally {
    loading = false;
    notifyLoading();
  }
}
