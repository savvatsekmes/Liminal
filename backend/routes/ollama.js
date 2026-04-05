/**
 * Ollama proxy routes — avoids CORS issues from the frontend hitting localhost:11434 directly.
 */
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

function getOllamaUrl() {
  return require('../services/settingsService').get('ollama_url') || 'http://localhost:11434';
}

// ── GET /api/ollama/models ────────────────────────────────────────────────────
// List installed Ollama models
router.get('/models', async (req, res) => {
  const url = getOllamaUrl();
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.json({ online: true, models: data.models || [] });
  } catch (err) {
    res.json({ online: false, models: [], error: err.message });
  }
});

// ── POST /api/ollama/pull ─────────────────────────────────────────────────────
// Stream a model pull from Ollama — SSE-style chunked response
router.post('/pull', async (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });

  const url = getOllamaUrl();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const r = await fetch(`${url}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!r.ok) {
      res.write(`data: ${JSON.stringify({ error: `Ollama returned ${r.status}` })}\n\n`);
      res.end();
      return;
    }

    let buffer = '';
    let hadError = false;
    for await (const chunk of r.body) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.error) hadError = true;
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
        } catch {}
      }
    }
    if (!hadError) {
      res.write(`data: ${JSON.stringify({ status: 'done' })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

module.exports = router;
