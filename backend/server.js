// Boot timing — each phase logs its delta from the very first line. Helps
// diagnose "Liminal takes 15 seconds to start". Remove the markers once the
// hot spots are addressed.
const T0 = Date.now();
const lap = (label) => console.log(`[boot +${(Date.now() - T0).toString().padStart(5)}ms] ${label}`);
lap('server.js entered');

require('dotenv').config();
lap('dotenv loaded');
const express = require('express');
const cors = require('cors');
const path = require('path');
lap('express + cors required');

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
app.use('/api/threads',  extendTimeout);

// ── Routes ────────────────────────────────────────────────────────────────────
function timedRoute(prefix, modulePath) {
  const t = Date.now();
  app.use(prefix, require(modulePath));
  const dt = Date.now() - t;
  if (dt > 50) lap(`route ${prefix} loaded (+${dt}ms)`);
}
timedRoute('/api/auth',     './routes/auth');
timedRoute('/api/entries',  './routes/entries');
timedRoute('/api/reflect',  './routes/reflect');
timedRoute('/api/portrait', './routes/portrait');
timedRoute('/api/tts',      './routes/tts');
timedRoute('/api/notion',   './routes/notion');
timedRoute('/api/settings', './routes/settings');
timedRoute('/api/notes',    './routes/notes');
timedRoute('/api/context',  './routes/context');
timedRoute('/api/ollama',   './routes/ollama');
timedRoute('/api/ask',      './routes/ask');
timedRoute('/api/oracle',   './routes/oracle');
timedRoute('/api/stt',      './routes/stt');
timedRoute('/api/youtube',  './routes/youtube');
timedRoute('/api/images',   './routes/images');
timedRoute('/api/memories', './routes/memories');
timedRoute('/api/cards',    './routes/cards');
timedRoute('/api/sky',      './routes/sky');
timedRoute('/api/home',     './routes/home');
timedRoute('/api/layouts',  './routes/layouts');
timedRoute('/api/version',  './routes/version');
timedRoute('/api/tags',     './routes/tags');
timedRoute('/api/threads',  './routes/threads');
timedRoute('/api/search',   './routes/search');
timedRoute('/api/media',    './routes/media');
timedRoute('/api/debuglog', './routes/debuglog');
lap('all routes loaded');

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
// Read version from package.json once at module load — used to be hardcoded
// and went stale across two releases.
let HEALTH_VERSION = '0.0.0';
try { HEALTH_VERSION = require('./package.json').version; } catch {}

app.get('/api/health', (req, res) => {
  const s = require('./services/settingsService');
  res.json({
    status: 'ok',
    provider: s.get('llm_provider'),
    version: HEALTH_VERSION,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  lap(`backend listening on :${PORT}`);
  console.log(`Liminal backend running on http://localhost:${PORT}`);

  // Warm up the embedding pipeline in the background so the first reflect
  // call doesn't stall while the model loads.
  const { warmup } = require('./services/embeddingService');
  warmup();

  // If the user has pinned Ollama to a specific GPU via Settings, restart
  // Ollama with that pin in its process env. Scoped to Ollama only — no
  // user-wide CUDA_VISIBLE_DEVICES so Blender/other tools see all GPUs.
  const ollamaRouter = require('./routes/ollama');
  if (typeof ollamaRouter.ensureOllamaPinnedOnStartup === 'function') {
    ollamaRouter.ensureOllamaPinnedOnStartup();
  }
});
