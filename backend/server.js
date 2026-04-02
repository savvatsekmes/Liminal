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
    version: '1.0.0',
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
