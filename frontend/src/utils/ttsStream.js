/**
 * Streaming TTS — sentence-by-sentence playback with prefetch pipeline.
 * Replaces all duplicated TTS patterns across the app.
 */

import { waitForChatterbox } from './ttsStatus';
import { apiFetch } from './api';

// Lazy-loaded cache of { archetype → voice filename } overrides from the user's
// portrait. Refreshed on demand via clearArchetypeVoiceCache() after the user
// edits voices in MemoryPage so the next playback uses the new mapping.
let _archetypeVoicesPromise = null;
function loadArchetypeVoices() {
  if (!_archetypeVoicesPromise) {
    _archetypeVoicesPromise = apiFetch('/api/portrait')
      .then((r) => r.json())
      .then((p) => (p && p.archetype_voices) || {})
      .catch(() => ({}));
  }
  return _archetypeVoicesPromise;
}
export function clearArchetypeVoiceCache() {
  _archetypeVoicesPromise = null;
}

/**
 * Stream TTS sentence-by-sentence with prefetch pipeline.
 * @param {string} text - Full text to speak
 * @param {React.MutableRefObject} audioRef - Ref to store current Audio for cancellation
 * @param {React.MutableRefObject} cancelRef - Ref boolean to signal cancellation
 * @param {object} opts - { exaggeration: 0.5, archetype: 'Zen', voice: 'Imogen.wav' }
 * @returns {Promise<void>} Resolves when done or cancelled
 */
export async function streamSpeak(text, audioRef, cancelRef, opts = {}) {
  if (!text?.trim()) return;

  // Resolve per-archetype voice override (if any). An explicit opts.voice always
  // wins; otherwise look up the archetype in the user's portrait override map.
  let resolvedVoice = opts.voice || null;
  if (!resolvedVoice && opts.archetype) {
    const map = await loadArchetypeVoices();
    console.log('[tts] archetype=', opts.archetype, 'voiceMap=', map, 'resolved=', map[opts.archetype] || '(none)');
    if (map[opts.archetype]) resolvedVoice = map[opts.archetype];
  }

  // Clean text for TTS: strip markdown bold, replace em/en-dashes with commas,
  // remove other non-speech characters that confuse the TTS engine
  const clean = text
    .replace(/\*\*/g, '')                // markdown bold
    .replace(/[—–]/g, ', ')             // em-dash / en-dash → pause
    .replace(/[""]/g, '"')              // smart quotes → plain
    .replace(/['']/g, "'")              // smart apostrophes → plain
    .replace(/…/g, '...')               // ellipsis character
    .replace(/[^\S\n]+/g, ' ');         // collapse whitespace

  // Split into sentences, then merge short ones (< 60 chars) with the next
  // to avoid Chatterbox hallucinating on tiny fragments like "The Trajectory."
  const raw = clean.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  const sentences = [];
  let buf = '';
  for (const s of raw) {
    buf = buf ? buf + ' ' + s : s;
    if (buf.length >= 60) { sentences.push(buf); buf = ''; }
  }
  if (buf) {
    // Append leftover to last sentence, or push if empty
    if (sentences.length) sentences[sentences.length - 1] += ' ' + buf;
    else sentences.push(buf);
  }
  if (!sentences.length) return;

  const cbReady = await waitForChatterbox(45000);

  if (!cbReady) {
    if (window.speechSynthesis) {
      return new Promise((resolve) => {
        const utt = new SpeechSynthesisUtterance(text);
        utt.onend = resolve;
        utt.onerror = resolve;
        window.speechSynthesis.speak(utt);
      });
    }
    return;
  }

  // Resolve language: explicit opts.language wins, otherwise read the current
  // UI language from localStorage (LanguageContext mirrors `lang` there). The
  // backend's TTS route runs without auth so it can't see the per-user setting,
  // so we always carry the language explicitly.
  let resolvedLang = opts.language;
  if (!resolvedLang) {
    try { resolvedLang = localStorage.getItem('lang') || undefined; } catch {}
  }

  async function fetchAudio(sentence) {
    // apiFetch (not plain fetch) so the Authorization header rides along —
    // the backend's soft-auth middleware reads it to bind the per-user
    // settings context, which is how `chatterbox_voice` resolves to the
    // user's actual pick instead of the global default.
    const res = await apiFetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sentence,
        exaggeration: opts.exaggeration ?? 0.5,
        ...(resolvedVoice ? { voice: resolvedVoice } : {}),
        ...(resolvedLang ? { language: resolvedLang } : {}),
      }),
    });
    if (!res.ok) throw new Error('TTS failed');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  try {
    let nextFetch = fetchAudio(sentences[0]);

    for (let i = 0; i < sentences.length; i++) {
      if (cancelRef.current) break;

      const url = await nextFetch;

      if (i + 1 < sentences.length) {
        nextFetch = fetchAudio(sentences[i + 1]);
      }

      if (cancelRef.current) { URL.revokeObjectURL(url); break; }

      await new Promise((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
      });
    }
  } catch (err) {
    console.error('[tts] Streaming failed, NOT falling back:', err);
  }
}

/** Stop any in-progress streaming playback */
export function stopSpeak(audioRef, cancelRef) {
  cancelRef.current = true;
  if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}
