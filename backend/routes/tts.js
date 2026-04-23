const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../paths');

function getChatterboxUrl() {
  return require('../services/settingsService').get('chatterbox_url') || 'http://localhost:8100';
}

// If Electron is hosting this backend, it exposes a localhost control endpoint
// that can spawn the on-demand TTS server. This lets remote clients (mobile,
// other computers on the LAN) trigger TTS even when no Electron window has
// logged in yet — without it, /api/tts/speak would 503 until someone on the
// host machine used TTS first.
async function ensureTtsViaControl() {
  const controlUrl = process.env.LIMINAL_CONTROL_URL;
  if (!controlUrl) return false;
  try {
    const r = await fetch(`${controlUrl}/tts/ensure`, {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return false;
    const data = await r.json();
    return !!data.ok;
  } catch {
    return false;
  }
}

// Fire-and-forget ping so main.js can keep TTS resident while remote browser
// users are active (window in tray wouldn't otherwise know about them).
function pingTtsKeepalive() {
  const controlUrl = process.env.LIMINAL_CONTROL_URL;
  if (!controlUrl) return;
  fetch(`${controlUrl}/tts/keepalive`, {
    method: 'POST',
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

async function isChatterboxOnline() {
  try {
    const r = await fetch(`${getChatterboxUrl()}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function getTtsDefaults() {
  const s = require('../services/settingsService');
  return {
    voice:       s.get('chatterbox_voice') || 'Abigail.wav',
    exaggeration: parseFloat(s.get('chatterbox_exaggeration') || '0.6'),
    cfg_weight:   parseFloat(s.get('chatterbox_cfg_weight')   || '0.10'),
    temperature:  parseFloat(s.get('chatterbox_temperature')  || '1.3'),
  };
}

// User voice uploads have been removed. Liminal ships with a curated set of
// voice references licensed from the CSTR VCTK Corpus (CC BY 4.0); allowing
// arbitrary user uploads creates right-of-publicity / deepfake exposure that
// is not appropriate for a journalling app.

// ── GET /api/tts/status ───────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const url = getChatterboxUrl();
  try {
    const response = await fetch(`${url}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return res.json({ online: false, voices: [] });
    // Also fetch device info for compat_mode / compute capability
    try {
      const devRes = await fetch(`${url}/device`, { signal: AbortSignal.timeout(2000) });
      const dev = await devRes.json();
      return res.json({ online: true, voices: [], ...dev });
    } catch {
      return res.json({ online: true, voices: [] });
    }
  } catch {
    res.json({ online: false, voices: [] });
  }
});

// ── GET /api/tts/voices ───────────────────────────────────────────────────────
router.get('/voices', async (req, res) => {
  const s = require('../services/settingsService');
  const voicesDir = s.get('voices_path') || path.join(DATA_DIR, 'voices');
  let voices = [];
  if (fs.existsSync(voicesDir)) {
    voices = fs.readdirSync(voicesDir)
      .filter(f => ['.wav', '.mp3'].includes(path.extname(f).toLowerCase()))
      .map(f => ({ filename: f, name: path.basename(f, path.extname(f)), local: true }));
  }
  res.json(voices);
});

// ── POST /api/tts/speak ───────────────────────────────────────────────────────
router.post('/speak', async (req, res) => {
  if (!req.body.text) return res.status(400).json({ error: 'text is required' });

  const s = require('../services/settingsService');
  const provider = req.body.provider || s.get('tts_mode') || 'chatterbox';

  if (provider === 'openai') {
    return speakOpenAI(req, res, s);
  }

  // Chatterbox: ensure the TTS server is running before forwarding. Without
  // this, remote clients (mobile/other computers) would fail because the
  // on-demand spawn was only triggered by the Electron renderer's IPC.
  if (!(await isChatterboxOnline())) {
    await ensureTtsViaControl();
  }
  // Cheap fire-and-forget so main.js knows someone's actively using TTS
  // (keeps the model resident when the window is in the tray).
  pingTtsKeepalive();

  return speakChatterbox(req, res, s);
});

// ── POST /api/tts/ensure ─────────────────────────────────────────────────────
// Remote-triggerable spawn endpoint so non-Electron clients (mobile browsers)
// can warm up TTS before calling /speak.
router.post('/ensure', async (_req, res) => {
  if (await isChatterboxOnline()) return res.json({ ok: true });
  const ok = await ensureTtsViaControl();
  res.json({ ok });
});

async function speakChatterbox(req, res, s) {
  const defaults = getTtsDefaults();
  const {
    text,
    voice        = defaults.voice,
    exaggeration = defaults.exaggeration,
    cfg_weight   = defaults.cfg_weight,
    temperature  = defaults.temperature,
    model        = 'chatterbox',
  } = req.body;
  const language = req.body.language || s.get('language') || 'en';
  console.log(`[tts] /speak voice=${voice} lang=${language} (req.body.voice=${req.body.voice || '(none)'}) default=${defaults.voice}`);

  const url = getChatterboxUrl();
  const processedText = preprocessText(text);
  console.log('[tts] Sending to Chatterbox:', JSON.stringify(processedText));

  try {
    const chatterboxRes = await fetch(`${url}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'chatterbox',
        input: processedText,
        voice: voice,
        exaggeration: Number(exaggeration),
        cfg_weight: Number(cfg_weight),
        temperature: Number(temperature),
        language,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!chatterboxRes.ok) {
      const errText = await chatterboxRes.text();
      return res.status(502).json({ error: 'Chatterbox TTS failed', detail: errText });
    }

    const contentType = chatterboxRes.headers.get('content-type') || 'audio/wav';
    res.setHeader('Content-Type', contentType);
    chatterboxRes.body.pipe(res);
  } catch (err) {
    res.status(503).json({ error: 'Chatterbox server not reachable', fallback: true });
  }
}

async function speakOpenAI(req, res, s) {
  const { text, voice } = req.body;
  const apiKey = s.get('openai_api_key');
  if (!apiKey) return res.status(503).json({ error: 'OpenAI API key not configured' });

  const selectedVoice = voice || s.get('openai_tts_voice') || 'nova';

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: preprocessText(text),
        voice: selectedVoice,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return res.status(502).json({ error: 'OpenAI TTS failed', detail: errText });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    openaiRes.body.pipe(res);
  } catch (err) {
    res.status(503).json({ error: 'OpenAI TTS request failed', detail: err.message });
  }
}

function preprocessText(text) {
  return text.replace(
    /\b(\d{1,2}):(\d{2})\s*(am|pm)\b/gi,
    (_, h, m, period) => `${h} ${m} ${period.toUpperCase()}`
  );
}

module.exports = router;
