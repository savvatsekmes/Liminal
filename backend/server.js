require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Extend timeout for LLM-heavy routes (5 min) ─────────────────────────────
function extendTimeout(req, res, next) {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
}
app.use('/api/reflect', extendTimeout);
app.use('/api/oracle',  extendTimeout);
app.use('/api/ask',     extendTimeout);
app.use('/api/home',    extendTimeout);
app.use('/api/portrait', extendTimeout);
app.use('/api/ollama',   extendTimeout);
app.use('/api/tags',     extendTimeout);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/entries',  require('./routes/entries'));
app.use('/api/reflect',  require('./routes/reflect'));
app.use('/api/portrait', require('./routes/portrait'));
app.use('/api/tts',      require('./routes/tts'));
app.use('/api/notion',   require('./routes/notion'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/notes',    require('./routes/notes'));
app.use('/api/context',  require('./routes/context'));
app.use('/api/ollama',   require('./routes/ollama'));
app.use('/api/ask',      require('./routes/ask'));
app.use('/api/oracle',   require('./routes/oracle'));
app.use('/api/stt',      require('./routes/stt'));
app.use('/api/youtube',  require('./routes/youtube'));
app.use('/api/images',   require('./routes/images'));
app.use('/api/memories', require('./routes/memories'));
app.use('/api/cards',    require('./routes/cards'));
app.use('/api/sky',      require('./routes/sky'));
app.use('/api/home',     require('./routes/home'));
app.use('/api/layouts',  require('./routes/layouts'));
app.use('/api/version',  require('./routes/version'));
app.use('/api/tags',     require('./routes/tags'));
app.use('/api/search',   require('./routes/search'));

// ── Production: serve built frontend SPA from same origin (no CORS needed) ──
// Electron main process sets LIMINAL_FRONTEND_DIST to the absolute path of
// the built frontend (frontend/dist) bundled into the installer.
if (process.env.LIMINAL_FRONTEND_DIST) {
  const distDir = path.resolve(process.env.LIMINAL_FRONTEND_DIST);
  app.use(express.static(distDir));
  // SPA fallback for client-side routing — exclude /api/*
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ── JSON error handler (prevents HTML 500 pages) ─────────────────────────────
// Must be registered AFTER all routes.
app.use((err, req, res, next) => {
  console.error('[server error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const s = require('./services/settingsService');
  res.json({
    status: 'ok',
    provider: s.get('llm_provider'),
    version: '1.1.0',
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Liminal backend running on http://localhost:${PORT}`);

  // Warm up the embedding pipeline in the background so the first reflect
  // call doesn't stall while the model loads.
  const { warmup } = require('./services/embeddingService');
  warmup();
});
