const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const FormData = require('form-data');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const s = require('../services/settingsService');

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function getChatterboxUrl() {
  return s.get('chatterbox_url') || 'http://localhost:8100';
}

async function isChatterboxOnline() {
  try {
    const r = await fetch(`${getChatterboxUrl()}/v1/models`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

async function ensureTtsViaControl() {
  const controlUrl = process.env.LIMINAL_CONTROL_URL;
  if (!controlUrl) return false;
  try {
    const r = await fetch(`${controlUrl}/tts/ensure`, { method: 'POST', signal: AbortSignal.timeout(45000) });
    if (!r.ok) return false;
    const data = await r.json();
    return !!data.ok;
  } catch { return false; }
}

// ── GET /api/stt/status ────────────────────────────────────────────────────
router.get('/status', async (_req, res) => {
  const online = await isChatterboxOnline();
  res.json({ online });
});

// ── POST /api/stt/transcribe ───────────────────────────────────────────────
// Forwards to the local TTS server's /v1/transcribe (faster-whisper). The
// server bundles both TTS and STT to share one Python process / one PyTorch
// boot — see tts_server.py "STT (Whisper)" section.
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

  if (!(await isChatterboxOnline())) {
    await ensureTtsViaControl();
  }

  try {
    const form = new FormData();
    form.append('audio', req.file.buffer, {
      filename: req.file.originalname || 'recording.webm',
      contentType: req.file.mimetype || 'audio/webm',
    });
    if (req.body.language) form.append('language', req.body.language);

    const r = await fetch(`${getChatterboxUrl()}/v1/transcribe`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: 'Transcription failed', detail });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Local Whisper not reachable', detail: err.message });
  }
});

// ── POST /api/stt/pin-model { model: 'tiny'|'base'|'small'|'medium'|'large-v3' }
// Save the Whisper model setting and pre-warm it on the running server. The
// Python server reads `whisper_model` from SQLite at swap time, so we just need
// to write the bare key (not a per-user namespace).
const VALID_WHISPER = ['tiny', 'base', 'small', 'medium', 'large-v3'];
router.post('/pin-model', express.json(), async (req, res) => {
  const { model } = req.body || {};
  if (!VALID_WHISPER.includes(model)) {
    return res.status(400).json({ error: `model must be one of ${VALID_WHISPER.join(', ')}` });
  }
  try {
    s.setGlobal('whisper_model', model);
    if (!(await isChatterboxOnline())) await ensureTtsViaControl();
    const url = getChatterboxUrl();
    try {
      const r = await fetch(`${url}/v1/whisper/preload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(180000),
      });
      const data = r.ok ? await r.json() : null;
      res.json({ ok: true, model, preloaded: !!data?.ok });
    } catch (err) {
      // Setting saved; preload failed (server unreachable). Next transcribe
      // will load the new model on-demand.
      res.json({ ok: true, model, preloaded: false, warning: err.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
