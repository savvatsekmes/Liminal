const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database');
const s = require('../services/settingsService');
const llm = require('../services/llmService');
const { DATA_DIR } = require('../paths');

// ── GET /api/settings ─────────────────────────────────────────────────────────
// Returns all settings with secrets masked
router.get('/', (req, res) => {
  const all = s.getAll();
  // Override display_name with user-scoped value
  const userId = resolveUserId(req);
  all.display_name = s.getForUser('display_name', userId);
  // Add hasKey booleans for secrets so the UI knows they're set
  all.has_anthropic_key = s.hasSecret('anthropic_api_key');
  all.has_openai_key    = s.hasSecret('openai_api_key');
  all.has_tavily_key    = s.hasSecret('tavily_api_key');
  all.has_github_token  = s.hasSecret('github_token');
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

  // Scope display_name per user
  const userId = resolveUserId(req);
  if ('display_name' in updates) {
    s.setForUser('display_name', updates.display_name, userId);
    delete updates.display_name;
  }

  s.setMany(updates);
  const result = s.getAll();
  result.display_name      = s.getForUser('display_name', userId);
  result.has_anthropic_key = s.hasSecret('anthropic_api_key');
  result.has_openai_key    = s.hasSecret('openai_api_key');
  result.has_tavily_key    = s.hasSecret('tavily_api_key');
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
// Returns list of GPUs available on this machine.
// Windows/Linux: nvidia-smi (CUDA). macOS: ask the running TTS server about MPS.
router.get('/gpus', async (req, res) => {
  // macOS: there's no nvidia-smi. Apple Silicon GPU is exposed via PyTorch MPS,
  // which only the Python tts_server can detect. Ask it directly.
  if (process.platform === 'darwin') {
    const ttsUrl = s.get('chatterbox_url') || 'http://localhost:8100';
    try {
      const r = await fetch(`${ttsUrl}/device`, { signal: AbortSignal.timeout(2000) });
      const d = await r.json();
      if (d.mps) {
        return res.json({
          cuda: false,
          mps: true,
          gpus: [{ id: 0, name: 'Apple Silicon GPU (Metal)', vram_gb: 'shared' }],
        });
      }
      return res.json({ cuda: false, mps: false, gpus: [] });
    } catch {
      // tts_server not up yet — return empty, UI will fall back to CPU option
      return res.json({ cuda: false, mps: false, gpus: [] });
    }
  }

  // Windows/Linux: nvidia-smi
  const { execSync } = require('child_process');
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader,nounits',
      { timeout: 10000, encoding: 'utf-8' }
    );
    const gpus = out.trim().split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [id, name, memMiB] = line.split(', ');
        return { id: parseInt(id), name: name.trim(), vram_gb: Math.round(parseFloat(memMiB) / 1024 * 10) / 10 };
      })
      .filter(g => !isNaN(g.id));
    return res.json({ cuda: gpus.length > 0, mps: false, gpus });
  } catch {
    // No nvidia-smi (no NVIDIA GPU, or driver not installed). CPU-only.
    return res.json({ cuda: false, mps: false, gpus: [] });
  }
});

// ── POST /api/settings/test-tts ───────────────────────────────────────────────
// Test Chatterbox by speaking a short phrase — returns audio or fallback status
router.post('/test-tts', async (req, res) => {
  const fetch = require('node-fetch');
  const { chatterbox_url, voice } = req.body;
  const url = chatterbox_url || s.get('chatterbox_url') || 'http://localhost:8100';

  try {
    const r = await fetch(`${url}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'chatterbox',
        input: 'Liminal is listening. Your voice is ready and working.',
        voice: voice || s.get('chatterbox_voice') || 'Abigail.wav',
        exaggeration: parseFloat(s.get('chatterbox_exaggeration') || '0.6'),
        cfg_weight:   parseFloat(s.get('chatterbox_cfg_weight')   || '0.10'),
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
// Download full Liminal backup as JSON (all user data, v3 format)
router.get('/export', (req, res) => {
  const exportData = buildExportData(resolveUserId(req));
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="liminal-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(exportData);
});

// ── DELETE helpers ────────────────────────────────────────────────────────────

async function verifyPassword(req, res, userId) {
  const { password } = req.body || {};
  if (!password) { res.status(400).json({ error: 'Password required to confirm deletion' }); return false; }
  if (!userId) { res.status(400).json({ error: 'Not authenticated' }); return false; }
  const bcrypt = require('bcryptjs');
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  if (!user) { res.status(400).json({ error: 'User not found' }); return false; }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) { res.status(400).json({ error: 'Incorrect password' }); return false; }
  return true;
}

// ── DELETE /api/settings/data/entries ─────────────────────────────────────────
router.delete('/data/entries', async (req, res) => {
  const uid = resolveUserId(req);
  if (!await verifyPassword(req, res, uid)) return;
  db.prepare('DELETE FROM reflections WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entry_versions WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entry_embeddings WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entries WHERE user_id = ?').run(uid);
  res.json({ success: true, message: 'Journal entries deleted.' });
});

// ── DELETE /api/settings/data/notes ──────────────────────────────────────────
router.delete('/data/notes', async (req, res) => {
  const uid = resolveUserId(req);
  if (!await verifyPassword(req, res, uid)) return;
  db.prepare('DELETE FROM note_reflections WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM notes WHERE user_id = ?').run(uid);
  res.json({ success: true, message: 'Notes deleted.' });
});

// ── DELETE /api/settings/data/conversations ──────────────────────────────────
router.delete('/data/conversations', async (req, res) => {
  const uid = resolveUserId(req);
  if (!await verifyPassword(req, res, uid)) return;
  db.prepare('DELETE FROM oracle_messages WHERE session_id IN (SELECT id FROM oracle_sessions WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM oracle_sessions WHERE user_id = ?').run(uid);
  res.json({ success: true, message: 'Conversations deleted.' });
});

// ── DELETE /api/settings/data ─────────────────────────────────────────────────
// Wipe all user content. Requires { password } in body for verification.
// Does NOT delete auth, portrait, or memories.
router.delete('/data', async (req, res) => {
  const uid = resolveUserId(req);
  if (!await verifyPassword(req, res, uid)) return;

  // Entries + related
  db.prepare('DELETE FROM reflections WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entry_versions WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entry_embeddings WHERE entry_id IN (SELECT id FROM entries WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM entries WHERE user_id = ?').run(uid);

  // Notes + related
  db.prepare('DELETE FROM note_reflections WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM note_versions WHERE note_id IN (SELECT id FROM notes WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM notes WHERE user_id = ?').run(uid);

  // Conversations
  db.prepare('DELETE FROM oracle_messages WHERE session_id IN (SELECT id FROM oracle_sessions WHERE user_id = ?)').run(uid);
  db.prepare('DELETE FROM oracle_sessions WHERE user_id = ?').run(uid);

  // Wipe vectra index
  const vectraDir = path.join(DATA_DIR, 'vectra');
  if (fs.existsSync(vectraDir)) {
    fs.rmSync(vectraDir, { recursive: true, force: true });
  }

  res.json({ success: true, message: 'All data deleted.' });
});

// ── PUT /api/settings/username ────────────────────────────────────────────────
router.put('/username', (req, res) => {
  const { display_name } = req.body;
  if (typeof display_name !== 'string') {
    return res.status(400).json({ error: 'display_name required' });
  }
  const userId = resolveUserId(req);
  s.setForUser('display_name', display_name.trim(), userId);
  res.json({ success: true, display_name: display_name.trim() });
});

// ── POST /api/settings/restart ────────────────────────────────────────────────
// Restart the Electron app. First try Electron's /relaunch control endpoint;
// if that 404s (old packaged build) or there's no control URL, fall back to
// spawning a detached relauncher that kills the parent Electron process and
// starts a fresh instance.
router.post('/restart', (req, res) => {
  res.json({ ok: true });
  setTimeout(doRestart, 400);
});

function doRestart() {
  const controlUrl = process.env.LIMINAL_CONTROL_URL;
  if (!controlUrl) return fallbackRestart();

  const http = require('http');
  const url = new URL(controlUrl + '/relaunch');
  const r = http.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
  }, (resp) => {
    if (resp.statusCode === 200) return; // Electron will relaunch
    fallbackRestart();
  });
  r.on('error', fallbackRestart);
  r.end();
}

function fallbackRestart() {
  // Spawn a detached relauncher that waits, kills the parent Electron (our
  // ppid), then starts a new Electron instance via process.execPath (Liminal.exe
  // in packaged build). On Windows we write a temp .bat, then launch it via
  // `start` through a shell — `start` creates a new process that orphans from
  // our spawned cmd (which exits immediately), so taskkill /T on Electron's
  // tree won't find and kill the running bat.
  const { spawn, exec } = require('child_process');
  const electronExe = process.execPath;
  const parentPid = process.ppid;
  const restartLog = path.join(DATA_DIR, 'restart.log');

  if (process.platform === 'win32') {
    const stamp = Date.now();
    const batDir = DATA_DIR;
    try { fs.mkdirSync(batDir, { recursive: true }); } catch {}

    // Best-effort cleanup of stale restart artifacts from previous runs so
    // these don't accumulate indefinitely. Keep anything written in the last
    // 60 seconds (in case two restarts race).
    try {
      const cutoff = Date.now() - 60_000;
      for (const f of fs.readdirSync(batDir)) {
        if (!/^restart-\d+\.(bat|log|vbs)$/.test(f)) continue;
        const full = path.join(batDir, f);
        try {
          const st = fs.statSync(full);
          if (st.mtimeMs < cutoff) fs.unlinkSync(full);
        } catch {}
      }
    } catch {}

    const batPath = path.join(batDir, `restart-${stamp}.bat`);
    const vbsPath = path.join(batDir, `restart-${stamp}.vbs`);
    const logPath = path.join(batDir, `restart-${stamp}.log`);
    const lines = [
      '@echo off',
      `echo [%date% %time%] relauncher start >> "${logPath}"`,
      'ping 127.0.0.1 -n 3 >nul',
      `echo [%date% %time%] taskkill >> "${logPath}"`,
      `taskkill /PID ${parentPid} /T /F >> "${logPath}" 2>&1`,
      'ping 127.0.0.1 -n 2 >nul',
      // Clear ELECTRON_RUN_AS_NODE so the launched Liminal.exe runs as the
      // Electron app, not as a headless Node interpreter (it was set for the
      // backend child process and inherited down the cmd chain).
      'set "ELECTRON_RUN_AS_NODE="',
      `echo [%date% %time%] starting "${electronExe}" >> "${logPath}"`,
      `start "" "${electronExe}"`,
      `echo [%date% %time%] done >> "${logPath}"`,
      // Self-delete the bat and vbs after we're done so artifacts don't pile up.
      `(goto) 2>nul & del "${vbsPath}" & del "%~f0"`,
    ];
    fs.writeFileSync(batPath, lines.join('\r\n'));

    // Run the .bat through a VBScript wrapper with windowStyle=0 so no
    // console window is ever visible. Previous approach used `start /min`
    // which still flashed (and sometimes stranded) a minimised cmd window.
    const vbsEscapedBat = batPath.replace(/"/g, '""');
    const vbsBody = `CreateObject("Wscript.Shell").Run "cmd /c ""${vbsEscapedBat}""", 0, False\r\n`;
    fs.writeFileSync(vbsPath, vbsBody);

    try { fs.appendFileSync(restartLog, `[${new Date().toISOString()}] wrote bat ${batPath}\n`); } catch {}

    spawn('wscript.exe', [vbsPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  } else {
    const script = `sleep 1; kill -9 ${parentPid} 2>/dev/null; "${electronExe}" &`;
    spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
  }
  setTimeout(() => process.exit(0), 200);
}

// ── POST /api/settings/import-json ───────────────────────────────────────────
// Import full Liminal backup (entries, notes, oracle, reflections, portrait, memories, versions, settings, users)
router.post('/import-json', express.json({ limit: '50mb' }), (req, res) => {
  const data = req.body || {};
  const entries = Array.isArray(data) ? data : (data.entries || []);
  const notes = data.notes || [];
  const oracleSessions = data.oracle_sessions || [];
  const portrait = data.portrait || null;

  if (entries.length === 0 && notes.length === 0 && oracleSessions.length === 0 && !portrait && !data.settings && !data.users) {
    return res.status(400).json({ error: 'No data found in backup file' });
  }

  const counts = { entries: 0, notes: 0, oracle_sessions: 0, reflections: 0, note_reflections: 0, memories: 0, entry_versions: 0, note_versions: 0, settings: 0, users: 0, skipped: 0 };
  const entryIdMap = {}, noteIdMap = {}, sessionIdMap = {};

  const run = db.transaction(() => {
    importDataIntoDb(data, entries, notes, oracleSessions,
      data.reflections || [], data.note_reflections || [],
      portrait, data.memory_summary || null, data.memories || [],
      data.entry_versions || [], data.note_versions || [],
      counts, entryIdMap, noteIdMap, sessionIdMap, resolveUserId(req));
  });

  run();
  res.json({ success: true, ...counts });
});

// ── POST /api/settings/backup ────────────────────────────────────────────────
// Generate an encrypted .liminal backup. Accepts { password } to derive the key.
router.post('/backup', express.json(), async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required for encrypted backup' });

  // Verify password against any existing user
  const bcrypt = require('bcryptjs');
  const user = db.prepare('SELECT password_hash FROM users ORDER BY id LIMIT 1').get();
  if (!user) return res.status(401).json({ error: 'No user account found' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  try {
    // Build v3 export data (reuse the export logic)
    const exportData = buildExportData(resolveUserId(req));

    const { encrypt } = require('../services/backupCrypto');
    const encrypted = encrypt(JSON.stringify(exportData), password);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="liminal-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.liminal"`);
    res.send(encrypted);
  } catch (err) {
    console.error('[backup] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/settings/restore-backup ────────────────────────────────────────
// Restore from an encrypted .liminal or legacy JSON backup.
const multer = require('multer');
const backupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.post('/restore-backup', backupUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

  const { password } = req.body || {};
  const buf = req.file.buffer;
  let data;

  const { isEncrypted, decrypt } = require('../services/backupCrypto');

  if (isEncrypted(buf)) {
    if (!password) return res.status(400).json({ error: 'Password required to decrypt this backup' });
    try {
      const json = decrypt(buf, password);
      data = JSON.parse(json);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  } else {
    // Legacy unencrypted JSON
    try {
      data = JSON.parse(buf.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid backup file — not encrypted and not valid JSON' });
    }
  }

  // Run the shared import logic
  const entries = Array.isArray(data) ? data : (data.entries || []);
  const portrait = data.portrait || null;

  if (entries.length === 0 && (data.notes || []).length === 0 && (data.oracle_sessions || []).length === 0 && !portrait && !data.settings && !data.users) {
    return res.status(400).json({ error: 'No data found in backup file' });
  }

  // Determine the current user from the JWT token
  let userId = resolveUserId(req);
  const counts = { entries: 0, notes: 0, oracle_sessions: 0, reflections: 0, note_reflections: 0, memories: 0, entry_versions: 0, note_versions: 0, settings: 0, users: 0, skipped: 0 };
  const entryIdMap = {}, noteIdMap = {}, sessionIdMap = {};

  try {
    const run = db.transaction(() => {
      importDataIntoDb(data, entries, data.notes || [], data.oracle_sessions || [],
        data.reflections || [], data.note_reflections || [],
        portrait, data.memory_summary || null, data.memories || [],
        data.entry_versions || [], data.note_versions || [],
        counts, entryIdMap, noteIdMap, sessionIdMap, userId);
    });

    run();
    res.json({ success: true, ...counts });
  } catch (err) {
    console.error('[restore-backup] Error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ── Shared helpers ──────────────────────────────────────────────────────────

/** Build the v3 export data object. Used by GET /export and POST /backup.
 *  @param {number} userId — export only this user's data (entries, notes, etc.)
 */
function buildExportData(userId) {
  // ── User-scoped data ────────────────────────────────────────────────────────
  const entries = db.prepare(`
    SELECT id, title, body, body_text, date, tags, auto_tags, created_at, updated_at
    FROM entries WHERE user_id = ? ORDER BY date DESC, created_at DESC
  `).all(userId).map(e => ({ ...e, tags: parseJSON(e.tags, []), auto_tags: parseJSON(e.auto_tags, []) }));

  const entryIds = new Set(entries.map(e => e.id));

  const notes = db.prepare(`
    SELECT id, type, title, body, attribution, target_date, custom_tag, tags, auto_tags, created_at, updated_at
    FROM notes WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(n => ({ ...n, tags: parseJSON(n.tags, []), auto_tags: parseJSON(n.auto_tags, []) }));

  const noteIds = new Set(notes.map(n => n.id));

  const oracleSessions = db.prepare(`
    SELECT id, archetype, title, created_at FROM oracle_sessions WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(session => ({
    ...session,
    messages: db.prepare(
      'SELECT role, content, archetype, created_at FROM oracle_messages WHERE session_id = ? ORDER BY created_at'
    ).all(session.id),
  }));

  const reflections = db.prepare(`
    SELECT entry_id, blocks, created_at, updated_at FROM reflections WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(r => ({ ...r, blocks: parseJSON(r.blocks, []) }));

  const noteReflections = db.prepare(`
    SELECT note_id, blocks, created_at, updated_at FROM note_reflections WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(r => ({ ...r, blocks: parseJSON(r.blocks, []) }));

  const memories = db.prepare(`
    SELECT content, pinned, source_entry_id, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId);

  const entryVersions = db.prepare(`
    SELECT entry_id, title, body, body_text, saved_at FROM entry_versions WHERE user_id = ? ORDER BY saved_at DESC
  `).all(userId);

  const noteVersions = db.prepare(`
    SELECT note_id, body, saved_at FROM note_versions WHERE user_id = ? ORDER BY saved_at DESC
  `).all(userId);

  // ── Per-user singleton data ──────────────────────────────────────────────────
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(userId);
  const memory   = db.prepare('SELECT summary, updated_at FROM memory WHERE user_id = ?').get(userId);

  // Home layouts
  const homeLayouts = db.prepare(
    'SELECT name, widget_order, is_active, created_at FROM home_layouts WHERE user_id = ? ORDER BY created_at ASC'
  ).all(userId).map(r => ({ ...r, widget_order: parseJSON(r.widget_order, []), is_active: !!r.is_active }));

  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settingsObj = {};
  for (const { key, value } of settingsRows) {
    // Skip user-scoped keys from export — export the current user's value as the plain key
    if (key.includes('::')) continue;
    settingsObj[key] = value;
  }
  // Export the current user's scoped display_name as plain "display_name"
  settingsObj.display_name = s.getForUser('display_name', userId);

  // Export only the current user (not all users)
  const user = db.prepare(`
    SELECT username, password_hash, created_at, last_login, onboarding_complete, avatar_path, terms_accepted_at
    FROM users WHERE id = ?
  `).get(userId);
  const users = user ? [user] : [];

  // Include avatar file as base64
  const avatars = [];
  if (user?.avatar_path) {
    const avatarFile = path.join(DATA_DIR, user.avatar_path);
    if (fs.existsSync(avatarFile)) {
      avatars.push({
        username: user.username,
        path: user.avatar_path,
        data: fs.readFileSync(avatarFile).toString('base64'),
      });
    }
  }

  return {
    exported_at: new Date().toISOString(),
    version: 3,
    entries,
    notes,
    oracle_sessions: oracleSessions,
    reflections,
    note_reflections: noteReflections,
    portrait: portrait || {},
    memory_summary: memory?.summary || '',
    memories,
    entry_versions: entryVersions,
    note_versions: noteVersions,
    settings: settingsObj,
    users,
    avatars,
    home_layouts: homeLayouts,
  };
}

/** Shared import logic used by both import-json and restore-backup.
 *  Clears existing user data first, then inserts everything from the backup.
 */
function importDataIntoDb(data, entries, notes, oracleSessions, reflections, noteReflections, portrait, memorySummary, memories, entryVersions, noteVersions, counts, entryIdMap, noteIdMap, sessionIdMap, userId) {
  // ── Clear existing user data to prevent duplicates ──────────────────────────
  db.prepare('DELETE FROM entry_versions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM note_versions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM reflections WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM note_reflections WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM oracle_messages WHERE session_id IN (SELECT id FROM oracle_sessions WHERE user_id = ?)').run(userId);
  db.prepare('DELETE FROM oracle_sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM memories WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM entries WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM home_layouts WHERE user_id = ?').run(userId);

  // 1. Entries
  const insertEntry = db.prepare(`
    INSERT INTO entries (title, body, body_text, date, tags, auto_tags, created_at, updated_at, user_id)
    VALUES (@title, @body, @body_text, @date, @tags, @auto_tags, @created_at, @updated_at, @user_id)
  `);
  for (const e of entries) {
    try {
      const result = insertEntry.run({
        title: e.title || '',
        body: e.body || '',
        body_text: e.body_text || '',
        date: e.date || e.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        tags: typeof e.tags === 'string' ? e.tags : JSON.stringify(e.tags || []),
        auto_tags: typeof e.auto_tags === 'string' ? e.auto_tags : JSON.stringify(e.auto_tags || []),
        created_at: e.created_at || new Date().toISOString(),
        updated_at: e.updated_at || e.created_at || new Date().toISOString(),
        user_id: userId,
      });
      entryIdMap[e.id] = result.lastInsertRowid;
      counts.entries++;
    } catch { counts.skipped++; }
  }

  // 2. Notes
  const insertNote = db.prepare(`
    INSERT INTO notes (type, title, body, attribution, target_date, custom_tag, tags, auto_tags, created_at, updated_at, user_id)
    VALUES (@type, @title, @body, @attribution, @target_date, @custom_tag, @tags, @auto_tags, @created_at, @updated_at, @user_id)
  `);
  for (const n of notes) {
    try {
      const result = insertNote.run({
        type: n.type || 'free',
        title: n.title || '',
        body: n.body || '',
        attribution: n.attribution || null,
        target_date: n.target_date || null,
        custom_tag: n.custom_tag || null,
        tags: typeof n.tags === 'string' ? n.tags : JSON.stringify(n.tags || []),
        auto_tags: typeof n.auto_tags === 'string' ? n.auto_tags : JSON.stringify(n.auto_tags || []),
        created_at: n.created_at || new Date().toISOString(),
        updated_at: n.updated_at || n.created_at || new Date().toISOString(),
        user_id: userId,
      });
      noteIdMap[n.id] = result.lastInsertRowid;
      counts.notes++;
    } catch { counts.skipped++; }
  }

  // 3. Oracle sessions + messages
  const insertSession = db.prepare(`
    INSERT INTO oracle_sessions (archetype, title, created_at, user_id)
    VALUES (@archetype, @title, @created_at, @user_id)
  `);
  const insertMessage = db.prepare(`
    INSERT INTO oracle_messages (session_id, role, content, archetype, created_at)
    VALUES (@session_id, @role, @content, @archetype, @created_at)
  `);
  for (const sess of oracleSessions) {
    try {
      const result = insertSession.run({
        archetype: sess.archetype || 'Auto',
        title: sess.title || '',
        created_at: sess.created_at || new Date().toISOString(),
        user_id: userId,
      });
      const newSessionId = result.lastInsertRowid;
      sessionIdMap[sess.id] = newSessionId;
      counts.oracle_sessions++;
      for (const msg of (sess.messages || [])) {
        try {
          insertMessage.run({
            session_id: newSessionId,
            role: msg.role || 'user',
            content: msg.content || '',
            archetype: msg.archetype || sess.archetype || null,
            created_at: msg.created_at || sess.created_at || new Date().toISOString(),
          });
        } catch {}
      }
    } catch { counts.skipped++; }
  }

  // 4. Reflections (remap entry_id)
  const insertReflection = db.prepare(`
    INSERT INTO reflections (entry_id, user_id, blocks, created_at, updated_at)
    VALUES (@entry_id, @user_id, @blocks, @created_at, @updated_at)
  `);
  for (const r of reflections) {
    try {
      insertReflection.run({
        entry_id: entryIdMap[r.entry_id] || r.entry_id,
        user_id: userId,
        blocks: typeof r.blocks === 'string' ? r.blocks : JSON.stringify(r.blocks || []),
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || r.created_at || new Date().toISOString(),
      });
      counts.reflections++;
    } catch { counts.skipped++; }
  }

  // 5. Note reflections (remap note_id)
  const insertNoteReflection = db.prepare(`
    INSERT INTO note_reflections (note_id, user_id, blocks, created_at, updated_at)
    VALUES (@note_id, @user_id, @blocks, @created_at, @updated_at)
  `);
  for (const r of noteReflections) {
    try {
      insertNoteReflection.run({
        note_id: noteIdMap[r.note_id] || r.note_id,
        user_id: userId,
        blocks: typeof r.blocks === 'string' ? r.blocks : JSON.stringify(r.blocks || []),
        created_at: r.created_at || new Date().toISOString(),
        updated_at: r.updated_at || r.created_at || new Date().toISOString(),
      });
      counts.note_reflections++;
    } catch { counts.skipped++; }
  }

  // 6. Portrait — full replace for the restoring user
  if (portrait && Object.keys(portrait).length > 0) {
    db.prepare('DELETE FROM portrait WHERE user_id = ?').run(userId);
    const columns = db.prepare("PRAGMA table_info(portrait)").all().map(c => c.name);
    // Skip 'id' (autoincrement) and force user_id to the restoring user
    const colsToSet = columns.filter(c => c !== 'id' && c !== 'user_id' && portrait[c] !== undefined);
    const colList = ['user_id', ...colsToSet].join(', ');
    const placeholders = ['?', ...colsToSet.map(() => '?')].join(', ');
    const values = [
      userId,
      ...colsToSet.map(col => {
        const v = portrait[col];
        return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
      }),
    ];
    try {
      db.prepare(`INSERT INTO portrait (${colList}) VALUES (${placeholders})`).run(...values);

    } catch (err) {
      console.error('[restore] Portrait insert FAILED:', err.message);
      console.error('[restore] colList:', colList);
      db.prepare('INSERT OR IGNORE INTO portrait (user_id) VALUES (?)').run(userId);
    }
  }

  // 7. Memories
  const insertMemory = db.prepare(`
    INSERT INTO memories (user_id, content, pinned, source_entry_id, created_at)
    VALUES (@user_id, @content, @pinned, @source_entry_id, @created_at)
  `);
  for (const m of memories) {
    try {
      insertMemory.run({
        user_id: userId,
        content: m.content || '',
        pinned: m.pinned || 0,
        source_entry_id: m.source_entry_id ? (entryIdMap[m.source_entry_id] || m.source_entry_id) : null,
        created_at: m.created_at || new Date().toISOString(),
      });
      counts.memories++;
    } catch { counts.skipped++; }
  }

  // 8. Memory summary (per-user)
  if (memorySummary) {
    const existingMem = db.prepare('SELECT id FROM memory WHERE user_id = ?').get(userId);
    if (existingMem) {
      db.prepare('UPDATE memory SET summary = ?, updated_at = ? WHERE user_id = ?')
        .run(memorySummary, new Date().toISOString(), userId);
    } else {
      db.prepare('INSERT INTO memory (user_id, summary, updated_at) VALUES (?, ?, ?)')
        .run(userId, memorySummary, new Date().toISOString());
    }
  }

  // 9. Entry versions (remap entry_id)
  const insertEntryVersion = db.prepare(`
    INSERT INTO entry_versions (entry_id, user_id, title, body, body_text, saved_at)
    VALUES (@entry_id, @user_id, @title, @body, @body_text, @saved_at)
  `);
  for (const v of entryVersions) {
    try {
      insertEntryVersion.run({
        entry_id: entryIdMap[v.entry_id] || v.entry_id,
        user_id: userId,
        title: v.title || '',
        body: v.body || '',
        body_text: v.body_text || '',
        saved_at: v.saved_at || new Date().toISOString(),
      });
      counts.entry_versions++;
    } catch { counts.skipped++; }
  }

  // 10. Note versions (remap note_id)
  const insertNoteVersion = db.prepare(`
    INSERT INTO note_versions (note_id, user_id, body, saved_at)
    VALUES (@note_id, @user_id, @body, @saved_at)
  `);
  for (const v of noteVersions) {
    try {
      insertNoteVersion.run({
        note_id: noteIdMap[v.note_id] || v.note_id,
        user_id: userId,
        body: v.body || '',
        saved_at: v.saved_at || new Date().toISOString(),
      });
      counts.note_versions++;
    } catch { counts.skipped++; }
  }

  // 11. Home layouts
  if (Array.isArray(data.home_layouts) && data.home_layouts.length > 0) {
    db.prepare('DELETE FROM home_layouts WHERE user_id = ?').run(userId);
    const insertLayout = db.prepare(
      'INSERT INTO home_layouts (user_id, name, widget_order, is_active, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const layout of data.home_layouts) {
      try {
        insertLayout.run(
          userId,
          layout.name || 'Default',
          typeof layout.widget_order === 'string' ? layout.widget_order : JSON.stringify(layout.widget_order || []),
          layout.is_active ? 1 : 0,
          layout.created_at || new Date().toISOString(),
        );
      } catch { counts.skipped++; }
    }
  }

  // 12. Settings — clear and replace, but preserve all user-scoped keys
  //     (display_name::N) so a restore doesn't overwrite another user's name.
  if (data.settings && typeof data.settings === 'object') {
    // Preserve all user-scoped settings before wiping
    const scopedRows = db.prepare("SELECT key, value FROM settings WHERE key LIKE '%::%'").all();
    db.prepare('DELETE FROM settings').run();
    for (const [key, value] of Object.entries(data.settings)) {
      try {
        // Import the backup's display_name as the restoring user's scoped key
        if (key === 'display_name') {
          s.setForUser('display_name', value, userId);
        } else {
          s.set(key, value);
        }
        counts.settings = (counts.settings || 0) + 1;
      } catch { counts.skipped++; }
    }
    // Restore all user-scoped keys that weren't for the restoring user
    for (const { key, value } of scopedRows) {
      if (key === `display_name::${userId}`) continue; // already set from backup
      s.set(key, value);
    }
  }

  // 12. Avatar — write file and update the RESTORING user's avatar_path
  if (Array.isArray(data.avatars) && data.avatars.length > 0) {
    const av = data.avatars[0]; // use the first avatar from backup
    try {
      // Write to a path based on the restoring user's ID, not the original path
      const ext = path.extname(av.path) || '.png';
      const newRelPath = `avatars/user_${userId}${ext}`;
      const dest = path.join(DATA_DIR, newRelPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(av.data, 'base64'));
      // Update the restoring user's avatar_path in the DB
      db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(newRelPath, userId);

    } catch (err) {
      console.error('[restore] Avatar failed:', err.message);
    }
  }
}

function parseJSON(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

/** Extract userId from JWT in Authorization header (without requiring auth middleware). */
function resolveUserId(req) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const jwt = require('jsonwebtoken');
      const { getSecret } = require('../middleware/auth');
      const decoded = jwt.verify(header.slice(7), getSecret());
      return decoded.userId;
    }
  } catch {}
  // Fallback: first user in DB
  const first = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
  return first?.id || 1;
}

module.exports = router;
