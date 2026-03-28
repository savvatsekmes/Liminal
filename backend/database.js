const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    summary    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS portrait (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
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
`);

// Add new columns if they don't exist yet (migration for existing databases)
const addColumnSafe = (table, column, typeAndDefault) => {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeAndDefault}`); } catch {}
};
addColumnSafe('portrait', 'chinese_zodiac', 'TEXT');
addColumnSafe('portrait', 'chinese_element', 'TEXT');
addColumnSafe('portrait', 'character_description', 'TEXT');
addColumnSafe('portrait', 'slider_character_influence', 'INTEGER');
addColumnSafe('portrait', 'sex', 'TEXT DEFAULT \'\'');
addColumnSafe('portrait', 'pronouns', 'TEXT DEFAULT \'\'');

addColumnSafe('entries',         'user_id', 'INTEGER DEFAULT 1');
addColumnSafe('notes',           'user_id', 'INTEGER DEFAULT 1');
addColumnSafe('life_context',    'user_id', 'INTEGER DEFAULT 1');
addColumnSafe('oracle_sessions', 'tag',     'TEXT');

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
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL DEFAULT 1,
    archetype  TEXT    NOT NULL DEFAULT 'Zen',
    title      TEXT    DEFAULT 'New conversation',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

module.exports = db;
