import { useState, useRef, useCallback } from 'react';
import { apiFetch } from '../utils/api';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * useDictation(onTranscript)
 *
 * Primary:  Web Speech API (real-time, no cost — Chrome/Edge)
 * Fallback: OpenAI Whisper via backend (record → upload → transcribe)
 *
 * onTranscript(text) is called each time a phrase is finalised.
 * Returns { isRecording, isProcessing, toggle }
 */
export function useDictation(onTranscript) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Keep onTranscript stable in closures via ref
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const recognitionRef = useRef(null);
  const recorderRef    = useRef(null);
  const chunksRef      = useRef([]);
  const streamRef      = useRef(null);
  const activeRef      = useRef(false); // intent flag to handle auto-restart

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

    // Chrome stops after silence — restart automatically while user intends to record
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

  // ── Whisper fallback ───────────────────────────────────────────────────────

  const startWhisper = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        setIsRecording(false);
        setIsProcessing(true);

        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const form = new FormData();
          form.append('audio', blob, 'recording.webm');

          const res = await apiFetch('/api/stt/transcribe', { method: 'POST', body: form });
          const data = await res.json();
          if (data.text) callbackRef.current(data.text);
        } catch (err) {
          console.error('[dictation] Whisper failed:', err);
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('[dictation] Mic access denied:', err);
    }
  }, []);

  const stopWhisper = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
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
