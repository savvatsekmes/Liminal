const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fetch = require('node-fetch');
const sharp = require('sharp');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── Settings helper ─────────────────────────────────────────────────────────

function getOllamaSettings() {
  const s = require('../services/settingsService');
  return {
    ollamaUrl: s.get('ollama_url') || 'http://localhost:11434',
    visionModel: s.get('vision_model') || 'llama3.2-vision',
  };
}

// ── POST /api/images/analyze ────────────────────────────────────────────────
// Body: { imageData }  (base64 data URL e.g. "data:image/png;base64,...")
// Returns: { description, hash, cached }

router.post('/analyze', async (req, res) => {
  const { imageData } = req.body;
  if (!imageData) return res.status(400).json({ error: 'imageData is required' });

  // Strip the data URL prefix to get raw base64
  const rawBase64 = imageData.replace(/^data:image\/[^;]+;base64,/, '');

  // Hash for dedup/caching (use first chunk of original for stable hash)
  const hash = crypto.createHash('sha256').update(rawBase64.slice(0, 10000)).digest('hex').slice(0, 32);

  // Check cache
  const cached = db.prepare(
    'SELECT description FROM image_descriptions WHERE image_hash = ? AND user_id = ?'
  ).get(hash, req.userId);

  if (cached?.description) {
    return res.json({ description: cached.description, hash, cached: true });
  }

  // Convert to JPEG and resize to max 1024px (fixes webp issues, speeds up vision)
  let base64ForVision;
  try {
    const inputBuffer = Buffer.from(rawBase64, 'base64');
    const jpegBuffer = await sharp(inputBuffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    base64ForVision = jpegBuffer.toString('base64');
    console.log(`[images] Converted: ${(rawBase64.length / 1024).toFixed(0)}KB → ${(base64ForVision.length / 1024).toFixed(0)}KB JPEG`);
  } catch (convErr) {
    console.error('[images] Conversion failed, using original:', convErr.message);
    base64ForVision = rawBase64;
  }

  // Call Ollama vision model
  const { ollamaUrl, visionModel } = getOllamaSettings();
  console.log(`[images] Analyzing image hash=${hash} model=${visionModel}`);

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: visionModel,
        stream: false,
        messages: [
          {
            role: 'user',
            content: 'Describe this image in detail. Include what you see, any text visible, the mood or tone, and any context that would help someone understand what this image is about. Be thorough but concise — aim for 2-4 sentences.',
            images: [base64ForVision],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 404) {
        return res.status(503).json({
          error: `Vision model "${visionModel}" not found. Pull it first with: ollama pull ${visionModel}`,
        });
      }
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText} ${errText}`);
    }

    const data = await response.json();
    const description = (data.message?.content || '').trim();
    console.log(`[images] Analysis result hash=${hash}: "${description.slice(0, 100)}..."`);

    if (description) {
      db.prepare(
        `INSERT OR REPLACE INTO image_descriptions (image_hash, user_id, description)
         VALUES (?, ?, ?)`
      ).run(hash, req.userId, description);
    }

    res.json({ description, hash, cached: false });
  } catch (err) {
    console.error('[images/analyze] Error:', err.message);
    res.status(500).json({ error: `Image analysis failed: ${err.message}` });
  }
});

// ── Shared helper ───────────────────────────────────────────────────────────
// Extract image descriptions from HTML content containing imageEmbed nodes.
// Used by reflect + notes reflect endpoints.

function buildImageContext(userId, htmlContent) {
  if (!htmlContent) return '';

  // Match image hashes stored on imageEmbed nodes (set by the frontend after analysis)
  const matches = [...htmlContent.matchAll(/data-image-hash="([a-f0-9]{32})"/g)];
  if (!matches.length) return '';

  const hashes = [...new Set(matches.map((m) => m[1]))];
  const descriptions = [];

  for (const hash of hashes) {
    const row = db.prepare(
      'SELECT description FROM image_descriptions WHERE image_hash = ? AND user_id = ?'
    ).get(hash, userId);

    if (row?.description) {
      descriptions.push(`IMAGE: ${row.description}`);
    }
  }

  if (!descriptions.length) return '';
  return descriptions.join('\n\n');
}

module.exports = router;
module.exports.buildImageContext = buildImageContext;
