/**
 * Polls Chatterbox TTS status on startup and caches the result.
 * Components can use useTtsOnline() hook or call waitForChatterbox()
 * before speaking to give Chatterbox time to come online instead of
 * instantly falling back to browser speech synthesis.
 */
import { useState, useEffect } from 'react';

let online = false;
let resolved = false;
let resolveReady;
const listeners = new Set();

const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

function notify() {
  listeners.forEach((fn) => fn(online));
}

async function check() {
  try {
    const res = await fetch('/api/tts/status');
    const data = await res.json();
    if (data.online) {
      online = true;
      resolved = true;
      resolveReady(true);
      notify();
      return true;
    }
  } catch {}
  return false;
}

// Poll every 3s for up to 60s on startup
(async () => {
  for (let i = 0; i < 20; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 3000));
  }
  resolved = true;
  resolveReady(false);
})();

/** Returns true if Chatterbox is currently known to be online */
export function isChatterboxOnline() {
  return online;
}

/**
 * React hook — returns true once Chatterbox comes online.
 * Replaces per-page one-shot ttsOnline state + useEffect fetch.
 */
export function useTtsOnline() {
  const [value, setValue] = useState(online);
  useEffect(() => {
    setValue(online); // sync in case it came online before mount
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}

/**
 * Wait for Chatterbox to come online, up to timeoutMs (default 8s).
 * Returns true if online, false if timed out.
 */
export async function waitForChatterbox(timeoutMs = 8000) {
  if (online) return true;
  if (resolved) return false;

  return Promise.race([
    readyPromise,
    new Promise((r) => setTimeout(() => r(false), timeoutMs)),
  ]);
}
