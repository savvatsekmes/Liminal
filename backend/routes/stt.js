const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const db = require('../database');

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // Whisper max 25 MB
});

// ── GET /api/stt/status ────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const keyRow = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get();
  res.json({ whisperAvailable: !!(keyRow?.value?.trim()) });
});

// ── POST /api/stt/transcribe ───────────────────────────────────────────────
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  const keyRow = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get();
  if (!keyRow?.value?.trim()) {
    return res.status(400).json({ error: 'OpenAI API key not configured. Add it in Settings → Language Model.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file provided' });
  }

  try {
    const { OpenAI, toFile } = require('openai');
    const openai = new OpenAI({ apiKey: keyRow.value.trim() });

    const file = await toFile(
      req.file.buffer,
      req.file.originalname || 'recording.webm',
      { type: req.file.mimetype || 'audio/webm' }
    );

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });

    res.json({ text: transcription.text || '' });
  } catch (err) {
    console.error('[stt] Whisper error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
