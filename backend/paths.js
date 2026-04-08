// Centralized path resolution for user data.
//
// Dev (default): backend/data/  — unchanged from the original layout.
// Production:    LIMINAL_USER_DATA env var (set by Electron main from
//                app.getPath('userData')) → cross-platform per-OS location:
//                  Windows: %APPDATA%\Liminal\
//                  macOS:   ~/Library/Application Support/Liminal/
//                  Linux:   ~/.config/Liminal/
//
// Anything that needs to read/write user data should import DATA_DIR from
// here instead of building its own path.join(__dirname, '..', 'data').

const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.LIMINAL_USER_DATA
  ? path.resolve(process.env.LIMINAL_USER_DATA)
  : path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Seed default voices on first launch.
//
// `backend/default-voices/` ships with the app and contains the baseline
// voice library. On every startup we copy any missing files into the user's
// VOICES_DIR (DATA_DIR/voices). Existing files are never overwritten so the
// user's own uploads and any tweaks survive across launches.
//
// This runs in dev too, but is a no-op there because dev's DATA_DIR is
// `backend/data/` and the same files already live in `backend/data/voices/`.
const VOICES_DIR = path.join(DATA_DIR, 'voices');
const DEFAULT_VOICES_DIR = path.join(__dirname, 'default-voices');
try {
  if (fs.existsSync(DEFAULT_VOICES_DIR)) {
    if (!fs.existsSync(VOICES_DIR)) fs.mkdirSync(VOICES_DIR, { recursive: true });
    let copied = 0;
    for (const f of fs.readdirSync(DEFAULT_VOICES_DIR)) {
      const dest = path.join(VOICES_DIR, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(DEFAULT_VOICES_DIR, f), dest);
        copied++;
      }
    }
    if (copied > 0) console.log(`[paths] Seeded ${copied} default voice(s) into ${VOICES_DIR}`);
  }
} catch (err) {
  console.warn('[paths] Failed to seed default voices:', err.message);
}

module.exports = { DATA_DIR };
