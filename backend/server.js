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

// An error in an async route used to take the whole backend down (Express 4
// doesn't catch rejected promises and Node exits on them), and nothing
// restarts it. Log it and keep serving instead.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.stack || err);
});
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

// Network guard. The backend listens on every interface so phones and other
// computers can use Liminal, which also makes it reachable by web pages open
// in the user's browser:
//  - DNS rebinding: a site points its own domain at this machine to read
//    responses. Those requests carry the site's name in Host, so only
//    localhost, IP addresses and this machine's own names are accepted.
//  - Cross-site requests: a page posts a form or fetch to localhost. Browsers
//    always send Origin on those, so a write whose Origin isn't the address
//    the app was opened at (or the dev server) is refused.
const os = require('os');
const OWN_NAMES = new Set(['localhost', os.hostname().toLowerCase(), `${os.hostname().toLowerCase()}.local`]);
function hostAllowed(hostHeader) {
  const host = String(hostHeader || '').toLowerCase().replace(/:\d+$/, '');
  if (!host) return false;
  if (OWN_NAMES.has(host) || host.endsWith('.localhost')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;   // IPv4 literal
  if (host.startsWith('[') && host.endsWith(']')) return true; // IPv6 literal
  return false;
}
app.use((req, res, next) => {
  if (!hostAllowed(req.headers.host)) {
    return res.status(403).json({ error: 'Unrecognised host' });
  }
  const origin = req.headers.origin;
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    let originHost = null;
    try { originHost = new URL(origin).host.toLowerCase(); } catch {}
    if (originHost !== String(req.headers.host).toLowerCase() && !DEV_ORIGINS.includes(origin)) {
      return res.status(403).json({ error: 'Cross-site request refused' });
    }
  }
  next();
});

app.use(cors({ origin: DEV_ORIGINS, credentials: true }));
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
timedRoute('/api/yubikey',  './routes/yubikey');
timedRoute('/api/entries',  './routes/entries');
timedRoute('/api/reflect',  './routes/reflect');
timedRoute('/api/portrait', './routes/portrait');
timedRoute('/api/tts',      './routes/tts');
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

// The librarian's index checks itself at every login and fills any gaps (a
// fresh install builds it entirely), so it registers before anyone can log in.
require('./services/librarianService');

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
