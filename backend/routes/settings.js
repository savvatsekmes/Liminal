const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database');
const s = require('../services/settingsService');
const llm = require('../services/llmService');

// ── GET /api/settings ─────────────────────────────────────────────────────────
// Returns all settings with secrets masked
router.get('/', (req, res) => {
  const all = s.getAll();
  // Add hasKey booleans for secrets so the UI knows they're set
  all.has_anthropic_key = s.hasSecret('anthropic_api_key');
  all.has_openai_key    = s.hasSecret('openai_api_key');
  res.json(all);
});

// ── PUT /api/settings ─────────────────────────────────────────────────────────
// Bulk update settings. Secret fields are only written if they are not the
// masked placeholder value (so displaying masked value and saving doesn't wipe the key).
router.put('/', (req, res) => {
  const updates = { ...req.body };

  // Skip writing secrets if they look like the masked placeholder
  for (const key of s.SECRET_KEYS) {
    if (key in updates) {
      const val = updates[key];
      if (!val || val.includes('••••')) {
        delete updates[key];
      }
    }
  }

  // Clamp numeric TTS values
  for (const k of ['chatterbox_exaggeration', 'chatterbox_cfg_weight', 'chatterbox_temperature']) {
    if (k in updates) updates[k] = String(parseFloat(updates[k]) || 0);
  }

  s.setMany(updates);
  const result = s.getAll();
  result.has_anthropic_key = s.hasSecret('anthropic_api_key');
  result.has_openai_key    = s.hasSecret('openai_api_key');
  res.json(result);
});

// ── POST /api/settings/test-llm ───────────────────────────────────────────────
// Test the current (or a specified) LLM provider
router.post('/test-llm', async (req, res) => {
  const { provider, api_key, model, ollama_url } = req.body;

  const overrides = {};
  if (api_key && !api_key.includes('••••')) {
    // Temporarily pass key directly without saving
    if (provider === 'claude')  overrides.apiKey    = api_key;
    if (provider === 'openai')  overrides.apiKey    = api_key;
  }
  if (model)      overrides.model     = model;
  if (ollama_url) overrides.ollamaUrl = ollama_url;

  const result = await llm.testConnection(provider || s.get('llm_provider'), overrides);
  res.json(result);
});

// ── GET /api/settings/gpus ────────────────────────────────────────────────────
// Returns list of CUDA GPUs available on this machine
router.get('/gpus', (req, res) => {
  const { execSync } = require('child_process');
  const python = process.env.PYTHON_PATH ||
    'C:\\Users\\Savva Tsekmes\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
  try {
    const out = execSync(
      `"${python}" -c "import torch,json; gpus=[{'id':i,'name':torch.cuda.get_device_name(i),'vram_gb':round(torch.cuda.get_device_properties(i).total_memory/1e9,1)} for i in range(torch.cuda.device_count())]; print(json.dumps({'cuda':torch.cuda.is_available(),'gpus':gpus}))"`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(out.toString().trim()));
  } catch {
    res.json({ cuda: false, gpus: [] });
  }
});

// ── POST /api/settings/test-tts ───────────────────────────────────────────────
// Test Chatterbox by speaking a short phrase — returns audio or fallback status
router.post('/test-tts', async (req, res) => {
  const fetch = require('node-fetch');
  const { chatterbox_url, voice } = req.body;
  const url = chatterbox_url || s.get('chatterbox_url') || 'http://localhost:8500';

  try {
    const r = await fetch(`${url}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'chatterbox',
        input: 'Liminal is listening. Your voice is ready and working.',
        voice: voice || s.get('chatterbox_voice') || 'Abigail.wav',
        exaggeration: parseFloat(s.get('chatterbox_exaggeration') || '0.6'),
        cfg_weight:   parseFloat(s.get('chatterbox_cfg_weight')   || '0.9'),
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const contentType = r.headers.get('content-type') || 'audio/wav';
    res.setHeader('Content-Type', contentType);
    r.body.pipe(res);
  } catch (err) {
    res.status(503).json({ error: 'Chatterbox not reachable', detail: err.message });
  }
});

// ── GET /api/settings/memory ──────────────────────────────────────────────────
router.get('/memory', (req, res) => {
  const row = db.prepare('SELECT summary, updated_at FROM memory WHERE id = 1').get();
  res.json({
    summary:    row?.summary || '',
    updated_at: row?.updated_at || null,
    word_count: row?.summary ? row.summary.trim().split(/\s+/).length : 0,
  });
});

// ── DELETE /api/settings/memory ───────────────────────────────────────────────
router.delete('/memory', (req, res) => {
  db.prepare('DELETE FROM memory WHERE id = 1').run();
  res.json({ success: true });
});

// ── POST /api/settings/reindex ────────────────────────────────────────────────
// Trigger background re-embedding of all entries
router.post('/reindex', (req, res) => {
  res.json({ started: true, message: 'Re-indexing started in background.' });

  setImmediate(async () => {
    const { embedAllEntries } = require('../services/notionImport');
    try {
      // First clear existing embeddings so everything gets re-indexed
      db.prepare('DELETE FROM entry_embeddings').run();
      await embedAllEntries((done, total) => {
        if (done % 20 === 0 || done === total) {
          console.log(`[reindex] ${done}/${total}`);
        }
      });
      console.log('[reindex] Complete.');
    } catch (err) {
      console.error('[reindex] Failed:', err.message);
    }
  });
});

// ── GET /api/settings/export ──────────────────────────────────────────────────
// Download full journal as JSON
router.get('/export', (req, res) => {
  const entries = db.prepare(`
    SELECT id, title, body, body_text, date, tags, created_at, updated_at
    FROM entries
    ORDER BY date DESC, created_at DESC
  `).all().map(e => ({ ...e, tags: parseJSON(e.tags, []) }));

  const portrait = db.prepare('SELECT * FROM portrait WHERE id = 1').get();
  const memory   = db.prepare('SELECT summary, updated_at FROM memory WHERE id = 1').get();

  const exportData = {
    exported_at: new Date().toISOString(),
    entry_count: entries.length,
    entries,
    portrait: portrait || {},
    memory_summary: memory?.summary || '',
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="liminal-export-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(exportData);
});

// ── DELETE /api/settings/data ─────────────────────────────────────────────────
// Wipe all entries and memory. Requires { confirm: 'DELETE' } in body.
// Does NOT delete auth (password) or portrait.
router.delete('/data', (req, res) => {
  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Send { confirm: "DELETE" } to confirm deletion' });
  }

  db.prepare('DELETE FROM entries').run();
  db.prepare('DELETE FROM memory').run();
  db.prepare('DELETE FROM entry_embeddings').run();

  // Wipe vectra index
  const vectraDir = path.join(__dirname, '..', 'data', 'vectra');
  if (fs.existsSync(vectraDir)) {
    fs.rmSync(vectraDir, { recursive: true, force: true });
  }

  res.json({ success: true, message: 'All entries and memory deleted.' });
});

// ── PUT /api/settings/username ────────────────────────────────────────────────
router.put('/username', (req, res) => {
  const { display_name } = req.body;
  if (typeof display_name !== 'string') {
    return res.status(400).json({ error: 'display_name required' });
  }
  s.set('display_name', display_name.trim());
  res.json({ success: true, display_name: display_name.trim() });
});

// ── POST /api/settings/restart ────────────────────────────────────────────────
// Spawns restart.vbs detached, then exits this process.
// The VBS kills the frontend and relaunches everything via start.vbs.
router.post('/restart', (req, res) => {
  res.json({ ok: true });
  const { spawn } = require('child_process');
  const vbs = path.join(__dirname, '../../restart.vbs');
  setTimeout(() => {
    spawn('wscript', [vbs], { detached: true, stdio: 'ignore' }).unref();
    process.exit(0);
  }, 400);
});

function parseJSON(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

module.exports = router;
