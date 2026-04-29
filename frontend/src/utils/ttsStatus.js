/**
 * TTS status — on-demand startup via Electron IPC, with polling fallback.
 * Components use useTtsOnline() hook or call waitForChatterbox() before speaking.
 * TTS server is NOT started on boot — it's spawned on first use and killed after idle.
 */
import { useState, useEffect } from 'react';

let online = false;
let loading = false;
const DEFAULT_TTS_MSG = 'Loading Chatterbox into VRAM… (takes ~15s first time)';
let loadingMessage = DEFAULT_TTS_MSG;
const listeners = new Set();
const loadingListeners = new Set();
const messageListeners = new Set();

export function getLoadingMessage() { return loadingMessage; }
export function useLoadingMessage() {
  const [value, setValue] = useState(loadingMessage);
  useEffect(() => {
    setValue(loadingMessage);
    messageListeners.add(setValue);
    return () => messageListeners.delete(setValue);
  }, []);
  return value;
}

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
      if (!online) { online = true; notify(); }
      return true;
    }
  } catch {}
  // Server didn't confirm online — clear the cached flag so callers don't
  // skip the load path on a stale "true". Without this, killing an orphan
  // TTS externally (or a crash) leaves the frontend believing the server
  // is up; subsequent speaks wait silently with no loading toast.
  if (online) { online = false; notify(); }
  return false;
}

// Light initial check (single attempt, no long poll)
check();

/** Returns true if Chatterbox is currently known to be online */
export function isChatterboxOnline() {
  return online;
}

/** Show a loading toast while `asyncFn` runs. Optional `message` overrides the
 * default Chatterbox text — pass it for non-TTS uses (e.g. Whisper STT). The
 * message resets to the Chatterbox default when the toast hides, so the next
 * caller doesn't inherit a stale label. Returns whatever asyncFn returns. */
export async function withLoadingToast(asyncFn, message) {
  if (message) {
    loadingMessage = message;
    messageListeners.forEach((fn) => fn(loadingMessage));
  }
  loading = true;
  notifyLoading();
  try {
    return await asyncFn();
  } finally {
    loading = false;
    notifyLoading();
    if (message) {
      loadingMessage = DEFAULT_TTS_MSG;
      messageListeners.forEach((fn) => fn(loadingMessage));
    }
  }
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
  // Confirm with a fresh probe before trusting the cached flag — the server
  // can disappear between sessions (orphan kill, crash, idle-release) without
  // the frontend hearing about it.
  if (online && (await check())) return true;

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
