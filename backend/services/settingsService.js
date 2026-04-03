/**
 * Settings service — DB-first key/value store with .env fallback.
 * All user-configurable options live here so the UI can change them live
 * without touching .env.
 */

const db = require('../database');

// Keys that hold API secrets — masked in GET responses
const SECRET_KEYS = new Set(['anthropic_api_key', 'openai_api_key', 'tavily_api_key']);

// Defaults (used when neither DB nor .env has a value)
const DEFAULTS = {
  llm_provider:              'claude',
  claude_model:              'claude-opus-4-6',
  openai_model:              'gpt-4.1',
  ollama_url:                'http://localhost:11434',
  ollama_model:              'llama3.1',
  chatterbox_url:            'http://localhost:8100',
  chatterbox_voice:          'Abigail.wav',
  chatterbox_exaggeration:   '0.6',
  chatterbox_cfg_weight:     '0.9',
  chatterbox_temperature:    '1.3',
  tts_mode:                  'chatterbox',
  openai_tts_voice:          'nova',
  voices_path:               '',
  tts_device:                'auto',
  llm_device:                'auto',
  web_search_enabled:        'false',
  display_name:              '',
  language:                  'en',
};

// ── Core get/set ─────────────────────────────────────────────────────────────

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) return row.value;
  // .env fallback
  const envKey = key.toUpperCase();
  if (process.env[envKey]) return process.env[envKey];
  return DEFAULTS[key] ?? '';
}

function set(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, String(value));
}

function setMany(obj) {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const tx = db.transaction((pairs) => {
    for (const [k, v] of pairs) upsert.run(k, String(v ?? ''));
  });
  tx(Object.entries(obj));
}

/** Return all settings, masking secrets. */
function getAll() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = { ...DEFAULTS };

  for (const { key, value } of rows) {
    result[key] = SECRET_KEYS.has(key) ? maskSecret(value) : value;
  }

  // Fill in any DEFAULTS not yet in DB
  for (const [key, def] of Object.entries(DEFAULTS)) {
    if (!(key in result)) result[key] = def;
  }

  // Also check .env for secrets not yet saved to DB
  for (const secretKey of SECRET_KEYS) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(secretKey);
    if (!row) {
      const envKey = secretKey.toUpperCase();
      if (process.env[envKey]) {
        result[secretKey] = maskSecret(process.env[envKey]);
      }
    }
  }

  return result;
}

/** True if a secret key has a value (either DB or .env) — without exposing it. */
function hasSecret(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row && row.value) return true;
  const envKey = key.toUpperCase();
  return !!(process.env[envKey]);
}

function maskSecret(value) {
  if (!value || value.length < 8) return value ? '••••••••' : '';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

module.exports = { get, set, setMany, getAll, hasSecret, SECRET_KEYS };
