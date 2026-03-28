const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

function getChatterboxUrl() {
  return require('../services/settingsService').get('chatterbox_url') || 'http://localhost:8500';
}

function getTtsDefaults() {
  const s = require('../services/settingsService');
  return {
    voice:       s.get('chatterbox_voice') || 'Abigail.wav',
    exaggeration: parseFloat(s.get('chatterbox_exaggeration') || '0.6'),
    cfg_weight:   parseFloat(s.get('chatterbox_cfg_weight')   || '0.9'),
    temperature:  parseFloat(s.get('chatterbox_temperature')  || '1.3'),
  };
}

// Voice upload storage — writes to the configured voices_path
const voiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const s = require('../services/settingsService');
    let voicesDir = s.get('voices_path');
    if (!voicesDir) {
      voicesDir = path.join(__dirname, '..', 'data', 'voices');
    }
    fs.mkdirSync(voicesDir, { recursive: true });
    cb(null, voicesDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});

const voiceUpload = multer({
  storage: voiceStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.wav', '.mp3'].includes(ext)) cb(null, true);
    else cb(new Error('Only .wav and .mp3 files are accepted'));
  },
});

// ── GET /api/tts/status ───────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const url = getChatterboxUrl();
  try {
    const response = await fetch(`${url}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    res.json({ online: response.ok, voices: [] });
  } catch {
    res.json({ online: false, voices: [] });
  }
});

// ── GET /api/tts/voices ───────────────────────────────────────────────────────
router.get('/voices', async (req, res) => {
  const s = require('../services/settingsService');
  const voicesDir = s.get('voices_path') || path.join(__dirname, '..', 'data', 'voices');
  let voices = [];
  if (fs.existsSync(voicesDir)) {
    voices = fs.readdirSync(voicesDir)
      .filter(f => ['.wav', '.mp3'].includes(path.extname(f).toLowerCase()))
      .map(f => ({ filename: f, name: path.basename(f, path.extname(f)), local: true }));
  }
  res.json(voices);
});

// ── POST /api/tts/voices ──────────────────────────────────────────────────────
// Upload a voice file to the configured voices directory
router.post('/voices', voiceUpload.single('voice'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    success: true,
    filename: req.file.filename,
    path: req.file.path,
    message: `Voice "${req.file.filename}" uploaded. Restart Chatterbox or it will be available on next server start.`,
  });
});

// ── DELETE /api/tts/voices/:filename ─────────────────────────────────────────
router.delete('/voices/:filename', (req, res) => {
  const s = require('../services/settingsService');
  const voicesDir = s.get('voices_path') || path.join(__dirname, '..', 'data', 'voices');
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(voicesDir, filename);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Voice not found' });

  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// ── POST /api/tts/speak ───────────────────────────────────────────────────────
router.post('/speak', async (req, res) => {
  if (!req.body.text) return res.status(400).json({ error: 'text is required' });

  const s = require('../services/settingsService');
  const provider = req.body.provider || s.get('tts_mode') || 'chatterbox';

  if (provider === 'openai') {
    return speakOpenAI(req, res, s);
  }

  return speakChatterbox(req, res, s);
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

  const url = getChatterboxUrl();
  const processedText = preprocessText(text);

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
      }),
      signal: AbortSignal.timeout(60000),
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
