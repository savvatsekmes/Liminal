/**
 * Settings service — DB-first key/value store with .env fallback.
 * All user-configurable options live here so the UI can change them live
 * without touching .env.
 *
 * Per-user isolation — every key is per-user automatically.
 *
 * On the way in (set/setMany), if we're inside an authenticated request,
 * the value lands under `<key>::<userId>` instead of the bare key. So
 * Account A changing their voice doesn't touch Account B's voice.
 *
 * On the way out (get/getAll), we look up `<key>::<userId>` first and
 * fall back to the bare key (acts as a default). This means existing
 * pre-refactor global values become defaults for users who haven't yet
 * customised that setting — no migration needed.
 *
 * Outside a request context (startup tasks, background jobs without an
 * inherited context) the bare key is used directly, so global defaults
 * still work for non-user-scoped operations.
 *
 * Auth middleware wraps `next()` in `runWithUserContext(userId, …)`, so
 * any setting reads/writes during the request automatically use the
 * right user — no explicit `userId` parameter threading required.
 */

const { AsyncLocalStorage } = require('node:async_hooks');
const db = require('../database');

const userContext = new AsyncLocalStorage();

// Keys that hold API secrets — masked in GET responses
const SECRET_KEYS = new Set(['anthropic_api_key', 'openai_api_key', 'tavily_api_key']);

// Defaults (used when neither DB nor .env has a value)
const DEFAULTS = {
  llm_provider:              'ollama',
  claude_model:              'claude-opus-4-6',
  openai_model:              'gpt-4.1',
  ollama_url:                'http://localhost:11434',
  ollama_model:              'llama3.1',
  ollama_think:              'false',
  chatterbox_url:            'http://localhost:8100',
  chatterbox_voice:          'Imogen.wav',
  chatterbox_exaggeration:   '0.6',
  chatterbox_cfg_weight:     '0.10',
  chatterbox_temperature:    '1.3',
  tts_mode:                  'chatterbox',
  openai_tts_voice:          'nova',
  voices_path:               '',
  tts_device:                'auto',
  llm_device:                'auto',
  web_search_enabled:        'false',
  display_name:              '',
  language:                  'en',
  lock_timeout_minutes:      '30',
  backup_location:           '',
  auto_backup_enabled:       'false',
  max_backups:               '10',
};

// ── User context (per-request) ───────────────────────────────────────────────

/** Bind userId into the async context so all settings reads/writes during
 *  the wrapped fn use that user's namespace. Auth middleware calls this. */
function runWithUserContext(userId, fn) {
  return userContext.run({ userId }, fn);
}

function getCurrentUserId() {
  return userContext.getStore()?.userId ?? null;
}

// ── Core get/set ─────────────────────────────────────────────────────────────

function get(key) {
  // Prefer this user's value when we're inside a request context.
  const userId = getCurrentUserId();
  if (userId) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`${key}::${userId}`);
    if (row) return row.value;
  }
  // Fall back to the bare key (legacy global value), then .env, then DEFAULTS.
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) return row.value;
  const envKey = key.toUpperCase();
  if (process.env[envKey]) return process.env[envKey];
  return DEFAULTS[key] ?? '';
}

/** Explicit user lookup — used by code paths that operate on a specific
 *  user without going through the request context (rare). */
function getForUser(key, userId) {
  return userContext.run({ userId }, () => get(key));
}

/** Explicit user write — same shape as getForUser. */
function setForUser(key, value, userId) {
  return userContext.run({ userId }, () => set(key, value));
}

function set(key, value) {
  const userId = getCurrentUserId();
  const writeKey = userId ? `${key}::${userId}` : key;
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(writeKey, String(value));
}

function setMany(obj) {
  const userId = getCurrentUserId();
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const tx = db.transaction((pairs) => {
    for (const [k, v] of pairs) {
      const writeKey = userId ? `${k}::${userId}` : k;
      upsert.run(writeKey, String(v ?? ''));
    }
  });
  tx(Object.entries(obj));
}

/** Return all settings (masked for secrets) for the current user. Iterates
 *  DEFAULTS via get() so per-user values + fallbacks are picked up uniformly. */
function getAll() {
  const result = {};
  for (const key of Object.keys(DEFAULTS)) {
    const v = get(key);
    result[key] = SECRET_KEYS.has(key) ? maskSecret(v) : v;
  }
  // Also expose any non-DEFAULTS rows that exist for this user (or globally
  // as a last resort) — covers legacy keys and one-off settings the UI may
  // still expect. Skip user-scoped namespace rows that aren't ours.
  const userId = getCurrentUserId();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '%::%'").all();
  for (const { key, value } of rows) {
    if (key in result) continue;
    result[key] = SECRET_KEYS.has(key) ? maskSecret(value) : value;
  }
  if (userId) {
    const userRows = db.prepare("SELECT key, value FROM settings WHERE key LIKE ?").all(`%::${userId}`);
    for (const { key, value } of userRows) {
      const baseKey = key.slice(0, key.indexOf('::'));
      if (baseKey in result || baseKey in DEFAULTS) continue; // already handled
      result[baseKey] = SECRET_KEYS.has(baseKey) ? maskSecret(value) : value;
    }
  }
  return result;
}

/** True if a secret key has a value (either DB or .env) — without exposing it. */
function hasSecret(key) {
  return !!get(key);
}

function maskSecret(value) {
  if (!value || value.length < 8) return value ? '••••••••' : '';
  return value.slice(0, 4) + '••••••••' + value.slice(-4);
}

/** Write directly to the bare key, ignoring any active user context. Used
 *  for machine-level singletons (tts_model, tts_device) where only one
 *  value can be active at a time and per-user namespacing would silently
 *  desync from the consumer (e.g. the Python TTS server, which reads the
 *  bare key directly from SQLite at spawn). */
function setGlobal(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, String(value));
}

module.exports = {
  get, set, setMany, getAll, hasSecret, SECRET_KEYS,
  getForUser, setForUser, runWithUserContext, setGlobal,
};
