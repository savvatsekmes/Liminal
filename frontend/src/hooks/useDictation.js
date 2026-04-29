import { useState, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import { withLoadingToast } from '../utils/ttsStatus';
import { useLanguage } from '../i18n/LanguageContext';

// Web Speech API exists in Electron but silently fails — Chromium streams audio
// to Google's cloud STT, and Electron doesn't ship with the proprietary API key
// Chrome/Edge use. So when running inside Liminal's Electron shell (detected via
// the preload-injected window.liminal), skip Web Speech entirely and go straight
// to the local Whisper fallback. Plain browser users (LAN/mobile) keep the
// real-time Web Speech path.
const IS_ELECTRON = !!window.liminal;
const SpeechRecognition = IS_ELECTRON ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);

// Once any dictation has succeeded, the Whisper model is resident in VRAM and
// subsequent calls return in well under a second. Track that so the loading
// toast only fires on the first dictation per session.
let whisperReady = false;

// Chunk size for rolling transcription. Each chunk is a self-contained webm
// segment that gets transcribed independently and appended to the entry. Small
// values mean snappier "words appear as you speak" feedback at the cost of
// slightly more boundary errors. 3.5s strikes a decent balance.
const SEGMENT_MS = 3500;

/**
 * useDictation(onTranscript)
 *
 * Primary:  Web Speech API (real-time, no cost — Chrome/Edge browsers)
 * Fallback: local Whisper via tts_server (rolling chunks, words appear live)
 *
 * onTranscript(text) is called for each transcribed segment as it arrives.
 * Returns { isRecording, isProcessing, toggle }.
 */
export function useDictation(onTranscript) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  // Pin Whisper to the user's UI language — auto-detect happily flips between
  // languages mid-sentence on short chunks, which produces nonsense.
  const { lang } = useLanguage();
  const langRef = useRef(lang);
  langRef.current = lang;

  const recognitionRef = useRef(null);
  const recorderRef    = useRef(null);
  const streamRef      = useRef(null);
  const activeRef      = useRef(false);  // intent flag for auto-restart loops

  const hasWebSpeech = !!SpeechRecognition;

  // ── Web Speech API ─────────────────────────────────────────────────────────

  const startWebSpeech = useCallback(() => {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) callbackRef.current(text);
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        console.warn('[dictation]', e.error);
      }
      if (e.error === 'not-allowed') {
        activeRef.current = false;
        setIsRecording(false);
        recognitionRef.current = null;
      }
    };

    recognition.onend = () => {
      if (activeRef.current && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch {}
      } else {
        setIsRecording(false);
      }
    };

    recognitionRef.current = recognition;
    activeRef.current = true;
    recognition.start();
    setIsRecording(true);
  }, []);

  const stopWebSpeech = useCallback(() => {
    activeRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // ── Whisper fallback (rolling chunks for live transcription) ───────────────
  //
  // We can't truly stream into Whisper — the model is batch-only — but we can
  // approximate live feedback by stopping the MediaRecorder every SEGMENT_MS,
  // immediately starting a fresh one, and transcribing the just-finished
  // segment in parallel with the next one being recorded. The result is that
  // text starts appearing within ~SEGMENT_MS of the user starting to speak,
  // and continues to fill in as they go. There's a tiny audio gap during the
  // stop+restart (sub-100ms in practice); for journaling this is invisible.

  async function transcribeBlob(blob) {
    const form = new FormData();
    form.append('audio', blob, 'recording.webm');
    if (langRef.current) form.append('language', langRef.current);
    // No toast here — startWhisper triggers a preload-with-toast on cold start
    // so the user sees feedback immediately on click. By the time this runs the
    // model is already loading (or done) and the python-side lock makes this
    // call wait for completion if needed.
    const res = await apiFetch('/api/stt/transcribe', { method: 'POST', body: form });
    const data = await res.json();
    if (!whisperReady) whisperReady = true;
    const text = (data?.text || '').trim();
    if (text) callbackRef.current(text);
  }

  function recordOneSegment(stream) {
    return new Promise((resolve) => {
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        resolve(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      // Auto-stop after SEGMENT_MS unless toggle() already stopped it
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, SEGMENT_MS);
    });
  }

  const startWhisper = useCallback(async () => {
    try {
      // First-click cold start: trigger the model load immediately and show
      // the toast NOW, instead of waiting for the first segment to finish ~3.5s
      // later. The preload runs in the background while we open the mic and
      // start recording — by the time the first segment is ready to transcribe,
      // the model will (in most cases) already be resident.
      if (!whisperReady) {
        withLoadingToast(
          async () => {
            const r = await apiFetch('/api/stt/pin-model', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: localStorage.getItem('liminal_whisper_model') || 'base' }),
            });
            if (r.ok) whisperReady = true;
          },
          'Loading Whisper model… (takes ~10s first time)'
        ).catch(() => {});
      }

      // Honour the user's saved mic preference if set. 'default' or unset =>
      // let the OS pick. enumerateDevices()'s deviceId is what we save.
      let micId = null;
      try { micId = localStorage.getItem('liminal_dictate_mic'); } catch {}
      const audioConstraint = (micId && micId !== 'default') ? { deviceId: { exact: micId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
      streamRef.current = stream;
      activeRef.current = true;
      setIsRecording(true);

      // Loop: record a segment, transcribe-in-the-background, immediately
      // start the next segment. We don't await the transcribe — it runs while
      // the next chunk is being captured, which is what gives us liveness.
      while (activeRef.current) {
        const blob = await recordOneSegment(stream);
        // Skip empty blobs (e.g. user clicked off before the recorder produced
        // anything — webm header without audio data is ~150 bytes).
        if (blob.size > 200) {
          transcribeBlob(blob).catch((err) => {
            console.warn('[dictation] segment transcribe failed:', err.message);
          });
        }
      }
    } catch (err) {
      console.error('[dictation] mic access or recorder error:', err);
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecording(false);
    }
  }, []);

  const stopWhisper = useCallback(() => {
    activeRef.current = false;
    // Stopping the recorder fires onstop -> resolves the segment promise ->
    // the while loop in startWhisper sees activeRef.current is false and exits.
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  // ── Public toggle ──────────────────────────────────────────────────────────

  const toggle = useCallback(() => {
    if (isRecording) {
      if (hasWebSpeech) stopWebSpeech();
      else stopWhisper();
    } else {
      if (hasWebSpeech) startWebSpeech();
      else startWhisper();
    }
  }, [isRecording, hasWebSpeech, startWebSpeech, stopWebSpeech, startWhisper, stopWhisper]);

  return { isRecording, isProcessing, toggle };
}
