const Database = require('better-sqlite3');
const path = require('path');
const { DATA_DIR } = require('./paths');

const db = new Database(path.join(DATA_DIR, 'liminal.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT NOT NULL DEFAULT 'Untitled',
    body      TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    date      TEXT,
    tags      TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS auth (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memory (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER DEFAULT 1,
    summary    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS portrait (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER DEFAULT 1,
    mbti         TEXT DEFAULT '',
    enneagram    TEXT DEFAULT '',
    human_design TEXT DEFAULT '',
    sun_sign     TEXT DEFAULT '',
    moon_sign    TEXT DEFAULT '',
    rising_sign  TEXT DEFAULT '',
    birth_date   TEXT DEFAULT '',
    birth_time   TEXT DEFAULT '',
    birth_location TEXT DEFAULT '',
    context_note TEXT DEFAULT '',
    slider_rational_spiritual   INTEGER DEFAULT 50,
    slider_gentle_direct        INTEGER DEFAULT 50,
    slider_reflective_action    INTEGER DEFAULT 50,
    slider_light_deep           INTEGER DEFAULT 50,
    slider_conversational_poetic INTEGER DEFAULT 50,
    slider_encouraging_challenging INTEGER DEFAULT 50,
    archetypes   TEXT NOT NULL DEFAULT '["Zen","Jungian","Stoic","Somatic","Taoist","Direct Friend"]',
    active_archetypes TEXT NOT NULL DEFAULT '["Zen","Jungian","Stoic","Direct Friend"]',
    custom_archetypes TEXT NOT NULL DEFAULT '[]',
    language     TEXT DEFAULT 'en',
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login   DATETIME
  );

  CREATE TABLE IF NOT EXISTS entry_embeddings (
    entry_id   INTEGER REFERENCES entries(id) ON DELETE CASCADE,
    embedded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entry_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT NOT NULL DEFAULT 'idea',
    body         TEXT NOT NULL DEFAULT '',
    attribution  TEXT,
    target_date  TEXT,
    custom_tag   TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS life_context (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    text               TEXT NOT NULL,
    source_entry_id    INTEGER REFERENCES entries(id) ON DELETE SET NULL,
    source_entry_title TEXT,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reflections (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL DEFAULT 1,
    blocks     TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entry_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date DESC);
  CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
  CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reflections_entry ON reflections(entry_id, user_id);

  CREATE TABLE IF NOT EXISTS image_descriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    image_hash  TEXT NOT NULL,
    user_id     INTEGER NOT NULL DEFAULT 1,
    description TEXT NOT NULL DEFAULT '',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(image_hash, user_id)
  );

  CREATE TABLE IF NOT EXISTS note_reflections (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL,
    user_id    INTEGER NOT NULL DEFAULT 1,
    blocks     TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(note_id, user_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS memories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL DEFAULT 1,
    content         TEXT NOT NULL,
    pinned          INTEGER NOT NULL DEFAULT 0,
    source_entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS locked_tags (
    user_id    INTEGER NOT NULL DEFAULT 1,
    tag        TEXT    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tag)
  );

  CREATE TABLE IF NOT EXISTS core_tags (
    user_id    INTEGER NOT NULL DEFAULT 1,
    tag        TEXT    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tag)
  );

  CREATE TABLE IF NOT EXISTS threads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active',
    weight      TEXT NOT NULL DEFAULT 'medium',
    insight     TEXT NOT NULL DEFAULT '',
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS thread_nodes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id    INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    content_id   INTEGER NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_thread_nodes_thread ON thread_nodes(thread_id);
`);

// Add new columns if they don't exist yet (migration for existing databases)
const addColumnSafe = (table, column, typeAndDefault) => {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeAndDefault}`); } catch {}
};
addColumnSafe('portrait', 'chinese_zodiac', 'TEXT');
addColumnSafe('portrait', 'chinese_element', 'TEXT');
addColumnSafe('portrait', 'character_description', 'TEXT');
addColumnSafe('portrait', 'character_description_edited', 'INTEGER DEFAULT 0');
addColumnSafe('portrait', 'slider_character_influence', 'INTEGER');
addColumnSafe('portrait', 'slider_candor', 'INTEGER DEFAULT 50');
addColumnSafe('portrait', 'preferred_name', "TEXT DEFAULT ''");
addColumnSafe('portrait', 'life_path_number', 'INTEGER');
addColumnSafe('portrait', 'soul_card', 'TEXT');
addColumnSafe('portrait', 'life_path_card', 'TEXT');
addColumnSafe('portrait', 'working_tarot_card', 'TEXT');
addColumnSafe('portrait', 'season_of_life', 'TEXT');
addColumnSafe('portrait', 'current_intention', 'TEXT');
addColumnSafe('portrait', 'sex', 'TEXT DEFAULT \'\'');
addColumnSafe('portrait', 'pronouns', 'TEXT DEFAULT \'\'');
addColumnSafe('portrait', 'custom_archetypes', "TEXT NOT NULL DEFAULT '[]'");
addColumnSafe('portrait', 'archetype_voices', "TEXT NOT NULL DEFAULT '{}'");
addColumnSafe('portrait', 'slider_sky_weight', 'INTEGER DEFAULT 50');
addColumnSafe('portrait', 'slider_portrait_weight', 'INTEGER DEFAULT 50');
addColumnSafe('portrait', 'slider_friend_stranger', 'INTEGER DEFAULT 30');
addColumnSafe('portrait', 'swearing_enabled', 'INTEGER DEFAULT 0');
addColumnSafe('portrait', 'slider_swearing', 'INTEGER DEFAULT 0');
addColumnSafe('portrait', 'sexual_content_enabled', 'INTEGER DEFAULT 0');
addColumnSafe('portrait', 'weather_city', 'TEXT');
addColumnSafe('portrait', 'weather_lat', 'REAL');
addColumnSafe('portrait', 'weather_lng', 'REAL');

addColumnSafe('users', 'onboarding_complete', 'INTEGER DEFAULT 0');
addColumnSafe('users', 'avatar_path', 'TEXT');
addColumnSafe('users', 'terms_accepted_at', 'DATETIME');
// Onboarding personality quiz: classifies the user as 'witness' | 'seeker' |
// 'attuned' which drives both home-screen layout and slider defaults.
// 'liminal' is the legacy default for users who pre-date the quiz.
addColumnSafe('users', 'layout_preference', "TEXT DEFAULT 'liminal'");
addColumnSafe('users', 'quiz_completed', 'INTEGER DEFAULT 0');
// Guided-tour state. JSON array of completed tour IDs (e.g. ["home"]).
// Drives both first-visit auto-triggers (tour fires when its id is absent)
// and the Settings → Replay tutorials UI.
addColumnSafe('users', 'tutorials_seen', "TEXT DEFAULT '[]'");
// Per-user encryption (see backend/services/userCrypto.js).
// BLOB columns. encryption_version: 0 = legacy plaintext, 1 = row-encrypted.
addColumnSafe('users', 'password_salt',             'BLOB');
addColumnSafe('users', 'recovery_salt',             'BLOB');
addColumnSafe('users', 'user_key_by_password',      'BLOB');
addColumnSafe('users', 'user_key_by_recovery',      'BLOB');
addColumnSafe('users', 'recovery_key_by_password',  'BLOB');
addColumnSafe('users', 'encryption_version',        'INTEGER DEFAULT 0');
// Brute-force unlock lockout. Counts wrong password / recovery-key attempts.
// After 5 wrong attempts: cooldown by `consecutive_lockouts` (1h, 1h, 3h, 6h,
// 12h, 24h capped). Successful unlock zeros both counters. See services/
// lockout.js for the schedule + helper functions.
addColumnSafe('users', 'failed_attempts',       'INTEGER NOT NULL DEFAULT 0');
addColumnSafe('users', 'consecutive_lockouts',  'INTEGER NOT NULL DEFAULT 0');
addColumnSafe('users', 'lockout_until',         'INTEGER');
// Mark pre-existing users as onboarded
db.prepare('UPDATE users SET onboarding_complete = 1 WHERE onboarding_complete = 0 AND last_login IS NOT NULL').run();

addColumnSafe('memories',        'is_core', 'INTEGER NOT NULL DEFAULT 0');
// status: 'active' (default) or 'resolved'. Resolved memories don't disappear
// — they get a 0.5x multiplier on relevance score during retrieval, so they
// only surface when raw relevance is high enough or there are no active
// alternatives. Manually toggled in the Memory tab.
addColumnSafe('memories',        'status',  "TEXT NOT NULL DEFAULT 'active'");
// manual_thread_id: when set, overrides the auto-derived thread membership
// (which goes through source_entry_id → thread_nodes). NULL = auto. Lets the
// user re-file a memory the LLM mis-categorised. ON DELETE SET NULL so
// deleting the thread doesn't break the memory.
addColumnSafe('memories',        'manual_thread_id', 'INTEGER REFERENCES threads(id) ON DELETE SET NULL');
addColumnSafe('entries',         'user_id', 'INTEGER DEFAULT 1');
addColumnSafe('entries',         'locked',  'INTEGER DEFAULT 0');
addColumnSafe('notes',           'user_id', 'INTEGER DEFAULT 1');
addColumnSafe('notes',           'title', "TEXT DEFAULT ''");
addColumnSafe('notes',           'tags', "TEXT NOT NULL DEFAULT '[]'");
addColumnSafe('notes',           'locked',  'INTEGER DEFAULT 0');
// Retire the legacy 'none' note type — all such notes migrate to 'idea'.
try { db.prepare("UPDATE notes SET type = 'idea' WHERE type = 'none'").run(); } catch {}
addColumnSafe('life_context',    'user_id', 'INTEGER DEFAULT 1');
addColumnSafe('oracle_sessions', 'tag',     'TEXT');
addColumnSafe('oracle_sessions', 'tags',    "TEXT NOT NULL DEFAULT '[]'");

// Auto-tags: parallel JSON array for tags applied by the LLM (background
// auto-tagger or suggestion pills). Kept separate from `tags` so the filter
// column can render user-typed tags above LLM-applied ones with a separator,
// and so promotion from auto → manual is a simple move between two arrays.
addColumnSafe('entries',         'auto_tags', "TEXT NOT NULL DEFAULT '[]'");
addColumnSafe('notes',           'auto_tags', "TEXT NOT NULL DEFAULT '[]'");
addColumnSafe('oracle_sessions', 'auto_tags', "TEXT NOT NULL DEFAULT '[]'");

addColumnSafe('entries', 'moon_phase', 'TEXT');
addColumnSafe('entries', 'moon_sign',  'TEXT');
addColumnSafe('entries', 'sky_notes',  'TEXT');

// Breakthrough intensity: raw dash count preceding 🫠 in the original Notion title.
// Null for non-breakthrough entries. Rendered as pip scale at display time.
addColumnSafe('entries',     'breakthrough_level', 'INTEGER');

// Reflection provenance: 'generated' (Liminal Mirror) vs 'imported' (pasted from
// a Notion archive). Lets the UI demote regenerate buttons on legacy blocks.
addColumnSafe('reflections', 'source', "TEXT NOT NULL DEFAULT 'generated'");

// Thread origin: 'canonical' (one of the 8 seeded life arcs), 'novel' (LLM-discovered
// per-user theme), or 'custom' (user-created). Drives sort order and edit affordances.
addColumnSafe('threads', 'kind', "TEXT NOT NULL DEFAULT 'novel'");

// Incremental threading stamp. NULL = never threaded (will be picked up by the
// next sweep or Re-thread). NOT NULL with no matching thread_nodes row = orphan,
// eligible for novel-theme clustering once ≥3 peers accumulate.
addColumnSafe('entries',         'threaded_at', 'TIMESTAMP');
addColumnSafe('notes',           'threaded_at', 'TIMESTAMP');
addColumnSafe('oracle_sessions', 'threaded_at', 'TIMESTAMP');

// Link oracle sessions to their source entry or note (the "Let's talk about this" feature).
// A session can be linked to at most one entry or one note. Bidirectional: entries/notes
// store the linked session ID so the UI can show "conversation linked" indicators.
addColumnSafe('oracle_sessions', 'source_entry_id', 'INTEGER');
addColumnSafe('oracle_sessions', 'source_note_id',  'INTEGER');
addColumnSafe('entries',         'linked_session_id', 'INTEGER');
addColumnSafe('notes',           'linked_session_id', 'INTEGER');

// Recreate portrait table to remove id=1 constraint and add user_id
const portraitCols = db.prepare("PRAGMA table_info(portrait)").all().map(c => c.name);
if (!portraitCols.includes('user_id')) {
  db.exec(`
    CREATE TABLE portrait_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      mbti TEXT DEFAULT '',
      enneagram TEXT DEFAULT '',
      human_design TEXT DEFAULT '',
      sun_sign TEXT DEFAULT '',
      moon_sign TEXT DEFAULT '',
      rising_sign TEXT DEFAULT '',
      birth_date TEXT DEFAULT '',
      birth_time TEXT DEFAULT '',
      birth_location TEXT DEFAULT '',
      context_note TEXT DEFAULT '',
      slider_rational_spiritual INTEGER DEFAULT 50,
      slider_gentle_direct INTEGER DEFAULT 50,
      slider_reflective_action INTEGER DEFAULT 50,
      slider_light_deep INTEGER DEFAULT 50,
      slider_conversational_poetic INTEGER DEFAULT 50,
      slider_encouraging_challenging INTEGER DEFAULT 50,
      archetypes TEXT NOT NULL DEFAULT '["Zen","Jungian","Stoic","Somatic","Taoist","Direct Friend"]',
      active_archetypes TEXT NOT NULL DEFAULT '["Zen","Jungian","Stoic","Direct Friend"]',
      language TEXT DEFAULT 'en',
      chinese_zodiac TEXT DEFAULT '',
      chinese_element TEXT DEFAULT '',
      character_description TEXT DEFAULT '',
      slider_character_influence INTEGER DEFAULT 50,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO portrait_new (user_id, mbti, enneagram, human_design, sun_sign, moon_sign, rising_sign, birth_date, birth_time, birth_location, context_note, slider_rational_spiritual, slider_gentle_direct, slider_reflective_action, slider_light_deep, slider_conversational_poetic, slider_encouraging_challenging, archetypes, active_archetypes, language, updated_at)
    SELECT 1, mbti, enneagram, human_design, sun_sign, moon_sign, rising_sign, birth_date, birth_time, birth_location, context_note, slider_rational_spiritual, slider_gentle_direct, slider_reflective_action, slider_light_deep, slider_conversational_poetic, slider_encouraging_challenging, archetypes, active_archetypes, language, updated_at FROM portrait;
    DROP TABLE portrait;
    ALTER TABLE portrait_new RENAME TO portrait;
  `);
}

// Recreate memory table to remove id=1 constraint and add user_id
const memoryCols = db.prepare("PRAGMA table_info(memory)").all().map(c => c.name);
if (!memoryCols.includes('user_id')) {
  db.exec(`
    CREATE TABLE memory_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      summary TEXT NOT NULL DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO memory_new (user_id, summary, updated_at)
    SELECT 1, summary, updated_at FROM memory;
    DROP TABLE memory;
    ALTER TABLE memory_new RENAME TO memory;
  `);
}

// Ensure user 1 has a portrait row
const portraitForUser1 = db.prepare('SELECT id FROM portrait WHERE user_id = 1').get();
if (!portraitForUser1) {
  db.prepare('INSERT INTO portrait (user_id) VALUES (1)').run();
}

// One-time cleanup: remove duplicate memories per user (keep oldest by id).
// Match on normalized content (lowercased + trimmed + whitespace collapsed).
try {
  const dupRes = db.prepare(`
    DELETE FROM memories
    WHERE id NOT IN (
      SELECT MIN(id) FROM memories
      GROUP BY user_id, LOWER(TRIM(REPLACE(REPLACE(content, CHAR(10), ' '), '  ', ' ')))
    )
  `).run();
  if (dupRes.changes > 0) {
    console.log(`[db] Removed ${dupRes.changes} duplicate memories`);
  }
} catch (err) {
  console.error('[db] Memory dedupe failed:', err.message);
}

// Migrate single-user auth → users table
const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
if (userCount === 0) {
  const oldAuth = db.prepare('SELECT password_hash FROM auth WHERE id = 1').get();
  if (oldAuth) {
    const displayName = db.prepare("SELECT value FROM settings WHERE key = 'display_name'").get();
    const username = displayName?.value?.trim() || 'user';
    db.prepare('INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (1, ?, ?)').run(username, oldAuth.password_hash);
  }
}

// Migrate life_context → memories (one-time)
const memoryCount = db.prepare('SELECT COUNT(*) as n FROM memories').get().n;
if (memoryCount === 0) {
  const lifeCtxRows = db.prepare('SELECT text, source_entry_id, user_id, created_at FROM life_context').all();
  if (lifeCtxRows.length) {
    const ins = db.prepare('INSERT INTO memories (user_id, content, pinned, source_entry_id, created_at) VALUES (?, ?, 1, ?, ?)');
    for (const r of lifeCtxRows) {
      ins.run(r.user_id || 1, r.text, r.source_entry_id || null, r.created_at);
    }
    console.log(`[db] Migrated ${lifeCtxRows.length} life_context items → memories (pinned)`);
  }
}

// Migrate global display_name → user 1's scoped key (one-time)
{
  const globalDN = db.prepare("SELECT value FROM settings WHERE key = 'display_name'").get();
  const scopedDN = db.prepare("SELECT key FROM settings WHERE key = 'display_name::1'").get();
  if (globalDN && globalDN.value && !scopedDN) {
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('display_name::1', ?, CURRENT_TIMESTAMP)")
      .run(globalDN.value);
  }
  // Clear global key so it doesn't leak to other users via fallback
  if (globalDN) {
    db.prepare("DELETE FROM settings WHERE key = 'display_name'").run();
  }
}

// Seed settings from .env on first run (only if keys not already in DB)
function seedSettingFromEnv(key, envVar) {
  const exists = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (!exists && process.env[envVar]) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, process.env[envVar]);
  }
}
seedSettingFromEnv('llm_provider',    'LLM_PROVIDER');
seedSettingFromEnv('anthropic_api_key', 'ANTHROPIC_API_KEY');
seedSettingFromEnv('openai_api_key',  'OPENAI_API_KEY');
seedSettingFromEnv('ollama_url',      'OLLAMA_URL');
seedSettingFromEnv('ollama_model',    'OLLAMA_MODEL');
seedSettingFromEnv('chatterbox_url',  'CHATTERBOX_URL');

// Sky cache
db.exec(`
  CREATE TABLE IF NOT EXISTS sky_cache (
    id         INTEGER PRIMARY KEY,
    cache_key  TEXT UNIQUE,
    data       TEXT,
    cached_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Daily card cache
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_cards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    date       TEXT    NOT NULL,
    deck       TEXT    NOT NULL,
    card_data  TEXT    NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
  );
`);

// Home cache (pulse, insight, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS home_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    cache_key   TEXT    NOT NULL,
    data        TEXT    NOT NULL DEFAULT '{}',
    entry_hash  TEXT    DEFAULT '',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, cache_key)
  );
`);

// YouTube transcript cache
db.exec(`
  CREATE TABLE IF NOT EXISTS youtube_transcripts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    video_id    TEXT    NOT NULL,
    title       TEXT    NOT NULL DEFAULT '',
    transcript  TEXT    NOT NULL DEFAULT '',
    fetched_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, video_id)
  );
`);

// Versioning tables
db.exec(`
  CREATE TABLE IF NOT EXISTS entry_versions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    body_text  TEXT NOT NULL DEFAULT '',
    saved_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS note_versions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id  INTEGER NOT NULL,
    user_id  INTEGER NOT NULL,
    body     TEXT NOT NULL DEFAULT '',
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  );
`);

// Oracle tables
db.exec(`
  CREATE TABLE IF NOT EXISTS oracle_sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL DEFAULT 1,
    archetype        TEXT    NOT NULL DEFAULT 'Zen',
    title            TEXT    DEFAULT 'New conversation',
    tag              TEXT,
    tags             TEXT    NOT NULL DEFAULT '[]',
    auto_tags        TEXT    NOT NULL DEFAULT '[]',
    threaded_at      TIMESTAMP,
    source_entry_id  INTEGER,
    source_note_id   INTEGER,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS oracle_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES oracle_sessions(id) ON DELETE CASCADE,
    role       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    archetype  TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_oracle_sessions_user    ON oracle_sessions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_oracle_messages_session ON oracle_messages(session_id, created_at ASC);
`);

// Home layouts
db.exec(`
  CREATE TABLE IF NOT EXISTS home_layouts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL DEFAULT 1,
    name        TEXT    NOT NULL,
    widget_order TEXT   NOT NULL DEFAULT '[]',
    is_active   BOOLEAN DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
