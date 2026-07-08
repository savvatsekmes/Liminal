const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database');
const s = require('../services/settingsService');
const llm = require('../services/llmService');
const { DATA_DIR } = require('../paths');
const { encryptField, safeDecrypt } = require('../services/rowCrypto');

// Soft-auth: this router doesn't use requireAuth (some flows like restore
// run with the user identified manually via resolveUserId), but we still
// want s.get/s.set inside these handlers to use the correct per-user
// namespace. Read the JWT if present and bind the user context for the
// remainder of the request.
router.use((req, res, next) => {
  const userId = resolveUserId(req);
  if (userId) {
    s.runWithUserContext(userId, () => next());
  } else {
    next();
  }
});

// ── GET /api/settings ─────────────────────────────────────────────────────────
// Returns all settings with secrets masked
router.get('/', (req, res) => {
  // Auth middleware has already established the per-user settings context,
  // so getAll() and hasSecret() return this user's values automatically.
  const all = s.getAll();
  all.has_anthropic_key = s.hasSecret('anthropic_api_key');
  all.has_openai_key    = s.hasSecret('openai_api_key');
  all.has_tavily_key    = s.hasSecret('tavily_api_key');
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

  // Clamp numeric TTS values. cfg_weight must stay strictly inside (0, 1) —
  // Chatterbox crashes at the boundaries — so clamp to [0.05, 0.95].
  for (const k of ['chatterbox_exaggeration', 'chatterbox_cfg_weight', 'chatterbox_temperature']) {
    if (k in updates) {
      let v = parseFloat(updates[k]) || 0;
      if (k === 'chatterbox_cfg_weight') v = Math.min(0.95, Math.max(0.05, v));
      updates[k] = String(v);
    }
  }

  // Auth middleware has set the per-user context, so setMany writes every
  // key under this user's namespace automatically. No special-casing needed.
  s.setMany(updates);
  const result = s.getAll();
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
        voice: voice || s.get('chatterbox_voice') || 'Imogen.wav',
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
      // First clear existing embeddings so everything gets re-indexed.
      // - entry_embeddings table: tracks which entries we've indexed
      // - vectra/index.json: the actual vector store
      // Both need wiping or the rebuild merges into whatever's there
      // (including ciphertext-embedded garbage from older runs of the
      // buggy notionImport.embedAllEntries that pre-dates row-encryption
      // awareness).
      db.prepare('DELETE FROM entry_embeddings').run();
      const vectraDir = path.join(DATA_DIR, 'vectra');
      if (fs.existsSync(vectraDir)) {
        try { fs.rmSync(vectraDir, { recursive: true, force: true }); } catch {}
      }
      // Drop the cached LocalIndex instance — it's bound to the (now
      // deleted) on-disk files. Without this, the next indexEntry call
      // would write through the stale handle and either resurrect ghost
      // entries or fail outright.
      const embeddingSvc = require('../services/embeddingService');
      embeddingSvc.invalidateIndexCache(embeddingSvc.VECTRA_DIR);
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

// NOTE: the old unauthenticated GET /api/settings/export route was removed — it
// returned the full journal as PLAINTEXT JSON with no password check (soft-auth
// fell back to the first user). Nothing in the app called it; the encrypted,
// password-gated POST /api/settings/backup flow (buildExportData with
// keepFieldCipher) is the supported path. buildExportData stays for that.

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

  // Threads — rosary-bead arcs derived from entries / notes / sessions.
  // thread_nodes has ON DELETE CASCADE on thread_id, so deleting threads
  // sweeps the nodes too. Was missing from the original wipe.
  db.prepare('DELETE FROM threads WHERE user_id = ?').run(uid);

  // Wipe vectra index
  const vectraDir = path.join(DATA_DIR, 'vectra');
  if (fs.existsSync(vectraDir)) {
    fs.rmSync(vectraDir, { recursive: true, force: true });
  }
  // Wipe vectra-memories index too — keeps the memory retrieval layer in
  // sync if the user later re-imports or restarts a clean corpus.
  const vectraMemoriesDir = path.join(DATA_DIR, 'vectra-memories');
  if (fs.existsSync(vectraMemoriesDir)) {
    fs.rmSync(vectraMemoriesDir, { recursive: true, force: true });
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

  // Verify the password against the LOGGED-IN user — not just whichever user
  // happens to have id=1. With multi-account, the old `ORDER BY id LIMIT 1`
  // query always rejected non-primary accounts (bug surfaced when a second
  // account tried to back up with their own password).
  const bcrypt = require('bcryptjs');
  const userId = resolveUserId(req);
  const user = userId
    ? db.prepare('SELECT id, password_hash, password_salt, yubikey_enabled, yubikey_credential_id, yubikey_prf_salt, user_key_by_password FROM users WHERE id = ?').get(userId)
    : db.prepare('SELECT id, password_hash, password_salt, yubikey_enabled, yubikey_credential_id, yubikey_prf_salt, user_key_by_password FROM users ORDER BY id LIMIT 1').get();
  if (!user) return res.status(401).json({ error: 'No user account found' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  // v5 backup creation never needs a YubiKey tap. The outer layer is
  // password-only; the inner protection comes from sensitive content
  // remaining encrypted with the backup-time user_key inside the envelope.
  // The user_key gets wrapped by whichever of (yubikey-derived KEK |
  // password-derived KEK) is in use on the live account at backup time.
  //
  // YubiKey-enabled account: wrap with the existing user_key_by_yubikey path.
  //   We don't have prf_output here (no tap), so we wrap the FRESH live
  //   user_key with a salt-stable, prf-derived key by *reusing the existing
  //   user_key_by_yubikey blob from the DB directly*. The renderer at
  //   restore time taps the same physical key + same prf_salt → produces
  //   the same prf_output → unwraps user_key. No tap at backup time.
  //
  // Non-YubiKey account: wrap with a password-derived KEK. The renderer at
  //   restore time uses the same password to unwrap user_key.

  const yubikeyEnabled = !!user.yubikey_enabled && !!user.yubikey_credential_id && !!user.yubikey_prf_salt;

  try {
    const exportData = buildExportData(userId, { keepFieldCipher: true });

    // We need the live account's user_key (32 bytes). The backend caches it
    // in rowCrypto after login.
    const rowCryptoSvc = require('../services/rowCrypto');
    let userKey;
    try { userKey = rowCryptoSvc.getUserKey(userId); }
    catch { return res.status(401).json({ error: 'Session key unavailable — log out and back in.' }); }

    const backupCrypto = require('../services/backupCrypto');
    let yubikeyInfo = null;
    let passwordWrap = null;

    if (yubikeyEnabled) {
      // Reuse the live user_key_by_yubikey blob verbatim. It's already
      // AES-GCM(prf-derived-key, user_key); we just need to include it in
      // the envelope along with the credential_id + prf_salt the user's
      // YubiKey will need to reproduce the prf-derived key on restore.
      //
      // Note: backupCrypto.buildV5 expects { credentialId, prfSalt,
      // prfOutput } and wraps the user_key itself. Instead of duplicating
      // that path, we pass the already-wrapped blob through by faking the
      // envelope assembly here. Cleaner approach: extend buildV5 with a
      // "passthrough wrapped blob" option. For now, derive the wrap
      // ourselves via a deterministic-on-yubikey path is not possible
      // without the tap — so we ALWAYS reuse the existing wrapped blob.
      yubikeyInfo = {
        // signal to a custom builder path below
        credentialId: Buffer.from(user.yubikey_credential_id),
        prfSalt: Buffer.from(user.yubikey_prf_salt),
        existingWrappedUserKey: db.prepare('SELECT user_key_by_yubikey FROM users WHERE id = ?').get(userId).user_key_by_yubikey,
      };
    } else {
      if (!user.user_key_by_password || !user.password_salt) {
        return res.status(500).json({ error: 'Account is missing its password key slot — cannot back up.' });
      }
      passwordWrap = {
        existingSalt: Buffer.from(user.password_salt),
        existingWrappedUserKey: Buffer.from(user.user_key_by_password),
      };
    }

    // Build the v5 envelope ourselves (skip buildV5's wrap step since we
    // already have the wrapped user_key blob stored on the live row — no
    // need to re-derive the wrapping key and re-encrypt).
    const envelope = {
      inner_version: 1,
      yubikey: yubikeyInfo ? {
        credential_id: yubikeyInfo.credentialId.toString('base64'),
        prf_salt: yubikeyInfo.prfSalt.toString('base64'),
        user_key_wrapped: Buffer.from(yubikeyInfo.existingWrappedUserKey).toString('base64'),
      } : null,
      password_wrap: passwordWrap ? {
        salt: passwordWrap.existingSalt.toString('base64'),
        user_key_wrapped: passwordWrap.existingWrappedUserKey.toString('base64'),
      } : null,
      data: exportData,
    };

    // Outer encryption — password-only scrypt + AES-GCM. Manually mirror
    // the format buildV5 emits so parseHeader recognises this as v5.
    const crypto = require('crypto');
    const outerSalt = crypto.randomBytes(16);
    const outerIv = crypto.randomBytes(12);
    const outerKey = crypto.scryptSync(password, outerSalt, 32, { N: 16384, r: 8, p: 1 });
    const cipher = crypto.createCipheriv('aes-256-gcm', outerKey, outerIv);
    const envBuf = Buffer.from(JSON.stringify(envelope), 'utf8');
    const outerCt = Buffer.concat([cipher.update(envBuf), cipher.final()]);
    const outerTag = cipher.getAuthTag();
    const encrypted = Buffer.concat([
      Buffer.from('LMNL', 'ascii'),
      Buffer.from([0x05]),
      outerSalt,
      outerIv,
      outerTag,
      outerCt,
    ]);

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
// 500 MB cap. Real-world backups can pass the original 100 MB ceiling once
// users have a few years of entries + reflections + threads. v5 backups are
// slightly larger than v3 because sensitive fields stay encrypted (ciphertext
// is ~33% bulkier than plaintext after base64 + GCM overhead).
const backupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

router.post('/restore-backup', backupUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

  const { password, prf_output } = req.body || {};
  const buf = req.file.buffer;
  let data;
  // backupUserKey is set when we successfully unwrap the backup-time
  // user_key from a v5 envelope. The import step uses it to decrypt content
  // blobs before re-encrypting with the importing user's key.
  let backupUserKey = null;

  const backupCrypto = require('../services/backupCrypto');
  const { isEncrypted, parseHeader, decryptLegacy, decryptV5Outer,
    unwrapUserKeyWithPrfFromEnvelope, unwrapUserKeyWithPasswordFromEnvelope } = backupCrypto;

  if (isEncrypted(buf)) {
    if (!password) return res.status(400).json({ error: 'Password required to decrypt this backup' });

    let header;
    try { header = parseHeader(buf); }
    catch (err) { return res.status(400).json({ error: err.message }); }

    if (header.kind === 'v5') {
      // Step 1: decrypt outer layer with password to get the envelope.
      let envelope;
      try { envelope = decryptV5Outer(buf, password); }
      catch (err) { return res.status(400).json({ error: err.message }); }

      // Step 2: unwrap the backup-time user_key. Try yubikey first if the
      // envelope has yubikey metadata and the renderer hasn't already sent
      // prf_output. Fall through to password wrap if no yubikey wrapping
      // exists (non-yubikey backup).
      if (envelope.yubikey) {
        if (!prf_output) {
          return res.status(422).json({
            error: 'This backup was made on a YubiKey-protected account. Tap your YubiKey to continue.',
            yubikey_required: true,
            credential_id: envelope.yubikey.credential_id,
            prf_salt: envelope.yubikey.prf_salt,
          });
        }
        let prfBuf;
        try { prfBuf = Buffer.from(prf_output, 'base64'); } catch { prfBuf = null; }
        if (!prfBuf || prfBuf.length !== 32) {
          return res.status(400).json({ error: 'Invalid prf_output' });
        }
        backupUserKey = unwrapUserKeyWithPrfFromEnvelope(envelope, prfBuf);
        if (!backupUserKey) {
          return res.status(401).json({ error: 'Hardware key did not match the credential used at backup time.' });
        }
      } else if (envelope.password_wrap) {
        backupUserKey = unwrapUserKeyWithPasswordFromEnvelope(envelope, password);
        if (!backupUserKey) {
          return res.status(401).json({ error: 'Could not unwrap backup user_key with password. The file may be corrupted.' });
        }
      } else {
        return res.status(400).json({ error: 'Backup envelope is missing both yubikey and password wrap. File may be corrupted.' });
      }

      data = envelope.data || {};
    } else {
      // v3 / v4 legacy reader — plaintext inside the outer layer.
      let prfBuf = null;
      if (prf_output) {
        try { prfBuf = Buffer.from(prf_output, 'base64'); } catch { prfBuf = null; }
        if (!prfBuf || prfBuf.length !== 32) {
          return res.status(400).json({ error: 'Invalid prf_output' });
        }
      }
      try {
        const json = decryptLegacy(buf, password, prfBuf ? { prfOutput: prfBuf } : {});
        data = JSON.parse(json);
      } catch (err) {
        if (err.code === 'YUBIKEY_REQUIRED') {
          return res.status(422).json({
            error: err.message,
            yubikey_required: true,
            credential_id: err.credential_id?.toString('base64'),
            prf_salt: err.prf_salt?.toString('base64'),
          });
        }
        return res.status(400).json({ error: err.message });
      }
    }
  } else {
    // Legacy unencrypted JSON
    try {
      data = JSON.parse(buf.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid backup file — not encrypted and not valid JSON' });
    }
  }

  // v5 backups carry sensitive fields as ciphertext (encrypted with the
  // backup-time user_key, which we unwrapped above). Walk the data tree
  // once and replace each lenc:v1:... blob with its plaintext, so
  // importDataIntoDb (which expects plaintext input and re-encrypts with
  // the importing user's key) works unchanged.
  if (backupUserKey) {
    const { safeDecryptWithKey } = require('../services/rowCrypto');
    const dec = (v) => safeDecryptWithKey(backupUserKey, v);
    if (Array.isArray(data.entries)) {
      for (const e of data.entries) {
        if (typeof e.body === 'string') e.body = dec(e.body);
        if (typeof e.body_text === 'string') e.body_text = dec(e.body_text);
      }
    }
    if (Array.isArray(data.notes)) {
      for (const n of data.notes) {
        if (typeof n.body === 'string') n.body = dec(n.body);
      }
    }
    if (Array.isArray(data.oracle_sessions)) {
      for (const s of data.oracle_sessions) {
        if (Array.isArray(s.messages)) {
          for (const m of s.messages) if (typeof m.content === 'string') m.content = dec(m.content);
        }
      }
    }
    if (Array.isArray(data.reflections)) {
      for (const r of data.reflections) {
        // r.blocks was already JSON-parsed at export time; nothing to do.
        // If it ever arrives as a string it'd be ciphertext.
        if (typeof r.blocks === 'string') {
          try { r.blocks = JSON.parse(dec(r.blocks)); } catch {}
        }
      }
    }
    if (Array.isArray(data.note_reflections)) {
      for (const r of data.note_reflections) {
        if (typeof r.blocks === 'string') {
          try { r.blocks = JSON.parse(dec(r.blocks)); } catch {}
        }
      }
    }
    if (Array.isArray(data.memories)) {
      for (const m of data.memories) if (typeof m.content === 'string') m.content = dec(m.content);
    }
    if (Array.isArray(data.entry_versions)) {
      for (const v of data.entry_versions) {
        if (typeof v.body === 'string') v.body = dec(v.body);
        if (typeof v.body_text === 'string') v.body_text = dec(v.body_text);
      }
    }
    if (Array.isArray(data.note_versions)) {
      for (const v of data.note_versions) {
        if (typeof v.body === 'string') v.body = dec(v.body);
      }
    }
    if (data.memory_summary && typeof data.memory_summary.summary === 'string') {
      data.memory_summary.summary = dec(data.memory_summary.summary);
    }
    if (Array.isArray(data.threads)) {
      for (const t of data.threads) {
        if (typeof t.name === 'string') t.name = dec(t.name);
        if (typeof t.description === 'string') t.description = dec(t.description);
        if (typeof t.insight === 'string') t.insight = dec(t.insight);
      }
    }
    // Zero out the key buffer now that we're done with it. Best-effort —
    // V8 may have copies elsewhere — but explicit beats implicit.
    try { backupUserKey.fill(0); } catch {}
    backupUserKey = null;
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
function buildExportData(userId, opts = {}) {
  // ── User-scoped data ────────────────────────────────────────────────────────
  // Two modes for sensitive fields:
  //
  //   plaintext (default, opts.keepFieldCipher = false):
  //     decrypt with the current user's key on the way out. Used for the
  //     plaintext-JSON export and for legacy backup formats (v3/v4) where
  //     the outer file encryption is the only barrier. Lets the importing
  //     user re-encrypt with their own key on restore.
  //
  //   ciphertext (opts.keepFieldCipher = true):
  //     pass the lenc:v1:... blobs through verbatim. Used for v5 backups
  //     where the envelope contains the backup-time user_key (wrapped by
  //     yubikey or password). The restorer must produce that user_key
  //     before they can read any content. Closes the password-only backup
  //     bypass for yubikey-enabled accounts.
  const dec = opts.keepFieldCipher ? ((v) => v) : ((v) => safeDecrypt(userId, v));
  // For JSON-encoded encrypted blobs (reflections.blocks etc.), the plaintext
  // path decrypts + JSON.parses; the keepFieldCipher path leaves the lenc:v1:
  // blob untouched so the restorer can decrypt-and-parse on its end.
  const decAndParse = opts.keepFieldCipher
    ? ((v) => v)
    : ((v) => parseJSON(safeDecrypt(userId, v), []));

  const entries = db.prepare(`
    SELECT id, title, body, body_text, date, tags, auto_tags, threaded_at, created_at, updated_at
    FROM entries WHERE user_id = ? ORDER BY date DESC, created_at DESC
  `).all(userId).map(e => ({
    ...e,
    body: dec(e.body),
    body_text: dec(e.body_text),
    tags: parseJSON(e.tags, []),
    auto_tags: parseJSON(e.auto_tags, []),
  }));

  const entryIds = new Set(entries.map(e => e.id));

  const notes = db.prepare(`
    SELECT id, type, title, body, attribution, target_date, custom_tag, tags, auto_tags, threaded_at, created_at, updated_at
    FROM notes WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(n => ({
    ...n,
    body: dec(n.body),
    tags: parseJSON(n.tags, []),
    auto_tags: parseJSON(n.auto_tags, []),
  }));

  const noteIds = new Set(notes.map(n => n.id));

  const oracleSessions = db.prepare(`
    SELECT id, archetype, title, threaded_at, created_at FROM oracle_sessions WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(session => ({
    ...session,
    messages: db.prepare(
      'SELECT role, content, archetype, created_at FROM oracle_messages WHERE session_id = ? ORDER BY created_at'
    ).all(session.id).map(m => ({ ...m, content: dec(m.content) })),
  }));

  const reflections = db.prepare(`
    SELECT entry_id, blocks, created_at, updated_at FROM reflections WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(r => ({ ...r, blocks: decAndParse(r.blocks) }));

  const noteReflections = db.prepare(`
    SELECT note_id, blocks, created_at, updated_at FROM note_reflections WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(r => ({ ...r, blocks: decAndParse(r.blocks) }));

  const memories = db.prepare(`
    SELECT content, pinned, source_entry_id, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId).map(m => ({ ...m, content: dec(m.content) }));

  const entryVersions = db.prepare(`
    SELECT entry_id, title, body, body_text, saved_at FROM entry_versions WHERE user_id = ? ORDER BY saved_at DESC
  `).all(userId).map(v => ({ ...v, body: dec(v.body), body_text: dec(v.body_text) }));

  const noteVersions = db.prepare(`
    SELECT note_id, body, saved_at FROM note_versions WHERE user_id = ? ORDER BY saved_at DESC
  `).all(userId).map(v => ({ ...v, body: dec(v.body) }));

  // ── Per-user singleton data ──────────────────────────────────────────────────
  const portrait = db.prepare('SELECT * FROM portrait WHERE user_id = ?').get(userId);
  const memoryRow = db.prepare('SELECT summary, updated_at FROM memory WHERE user_id = ?').get(userId);
  const memory = memoryRow ? { ...memoryRow, summary: dec(memoryRow.summary) } : null;

  // Home layouts
  const homeLayouts = db.prepare(
    'SELECT name, widget_order, is_active, created_at FROM home_layouts WHERE user_id = ? ORDER BY created_at ASC'
  ).all(userId).map(r => ({ ...r, widget_order: parseJSON(r.widget_order, []), is_active: !!r.is_active }));

  // Threads — rosary-bead graph of canonical / novel / custom themes with
  // per-item nodes pointing at entries, notes, and oracle sessions. Nodes
  // carry the source id so the import side can remap them through the
  // entry/note/session id maps.
  const threadRows = db.prepare(
    'SELECT id, name, description, status, weight, kind, insight, detected_at, updated_at FROM threads WHERE user_id = ? ORDER BY detected_at ASC'
  ).all(userId);
  const threads = threadRows.map(t => ({
    ...t,
    name: dec(t.name),
    description: dec(t.description),
    insight: dec(t.insight),
    nodes: db.prepare(
      'SELECT content_type, content_id, created_at FROM thread_nodes WHERE thread_id = ? ORDER BY created_at ASC'
    ).all(t.id),
  }));

  // Flatten this user's settings to plain keys: globals first (as fallback),
  // then this user's per-user values override them. Restoring this on the
  // other end will re-write everything as the importing user's per-user
  // values via setMany() in the user-aware context.
  const settingsObj = {};
  const globalRows = db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '%::%'").all();
  for (const { key, value } of globalRows) settingsObj[key] = value;
  const userRows = db.prepare("SELECT key, value FROM settings WHERE key LIKE ?").all(`%::${userId}`);
  for (const { key, value } of userRows) {
    const baseKey = key.slice(0, key.indexOf('::'));
    settingsObj[baseKey] = value;
  }

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
    threads,
  };
}

/** Shared import logic used by both import-json and restore-backup.
 *  Clears existing user data first, then inserts everything from the backup.
 */
function importDataIntoDb(data, entries, notes, oracleSessions, reflections, noteReflections, portrait, memorySummary, memories, entryVersions, noteVersions, counts, entryIdMap, noteIdMap, sessionIdMap, userId) {
  // Re-encrypt every body / content / message / memory / reflection / thread
  // text with the IMPORTING user's key. The export side already decrypted
  // (or passed through legacy unencrypted) so values arrive here as plaintext.
  // encryptField is a no-op on null/empty; safe to call unconditionally.
  const enc = (v) => encryptField(userId, v);
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
  // Threads: ON DELETE CASCADE on thread_nodes.thread_id takes care of nodes.
  db.prepare('DELETE FROM threads WHERE user_id = ?').run(userId);

  // 1. Entries
  const insertEntry = db.prepare(`
    INSERT INTO entries (title, body, body_text, date, tags, auto_tags, threaded_at, created_at, updated_at, user_id)
    VALUES (@title, @body, @body_text, @date, @tags, @auto_tags, @threaded_at, @created_at, @updated_at, @user_id)
  `);
  for (const e of entries) {
    try {
      const result = insertEntry.run({
        title: e.title || '',
        body: enc(e.body || ''),
        body_text: enc(e.body_text || ''),
        date: e.date || e.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
        tags: typeof e.tags === 'string' ? e.tags : JSON.stringify(e.tags || []),
        auto_tags: typeof e.auto_tags === 'string' ? e.auto_tags : JSON.stringify(e.auto_tags || []),
        threaded_at: e.threaded_at || null,
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
    INSERT INTO notes (type, title, body, attribution, target_date, custom_tag, tags, auto_tags, threaded_at, created_at, updated_at, user_id)
    VALUES (@type, @title, @body, @attribution, @target_date, @custom_tag, @tags, @auto_tags, @threaded_at, @created_at, @updated_at, @user_id)
  `);
  for (const n of notes) {
    try {
      const result = insertNote.run({
        type: n.type || 'free',
        title: n.title || '',
        body: enc(n.body || ''),
        attribution: n.attribution || null,
        target_date: n.target_date || null,
        custom_tag: n.custom_tag || null,
        tags: typeof n.tags === 'string' ? n.tags : JSON.stringify(n.tags || []),
        auto_tags: typeof n.auto_tags === 'string' ? n.auto_tags : JSON.stringify(n.auto_tags || []),
        threaded_at: n.threaded_at || null,
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
    INSERT INTO oracle_sessions (archetype, title, threaded_at, created_at, user_id)
    VALUES (@archetype, @title, @threaded_at, @created_at, @user_id)
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
        threaded_at: sess.threaded_at || null,
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
            content: enc(msg.content || ''),
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
        blocks: enc(typeof r.blocks === 'string' ? r.blocks : JSON.stringify(r.blocks || [])),
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
        blocks: enc(typeof r.blocks === 'string' ? r.blocks : JSON.stringify(r.blocks || [])),
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
        content: enc(m.content || ''),
        pinned: m.pinned || 0,
        source_entry_id: m.source_entry_id ? (entryIdMap[m.source_entry_id] || m.source_entry_id) : null,
        created_at: m.created_at || new Date().toISOString(),
      });
      counts.memories++;
    } catch { counts.skipped++; }
  }

  // 8. Memory summary (per-user)
  if (memorySummary) {
    const encSummary = enc(memorySummary);
    const existingMem = db.prepare('SELECT id FROM memory WHERE user_id = ?').get(userId);
    if (existingMem) {
      db.prepare('UPDATE memory SET summary = ?, updated_at = ? WHERE user_id = ?')
        .run(encSummary, new Date().toISOString(), userId);
    } else {
      db.prepare('INSERT INTO memory (user_id, summary, updated_at) VALUES (?, ?, ?)')
        .run(userId, encSummary, new Date().toISOString());
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
        body: enc(v.body || ''),
        body_text: enc(v.body_text || ''),
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
        body: enc(v.body || ''),
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

  // 11b. Threads — restore the rosary-bead graph. Inserts threads with new
  // ids, then nodes with content_id remapped through the appropriate id map
  // for its content_type ('entry' / 'note' / 'conversation'). Nodes whose
  // source id isn't in the map are dropped silently — they'd be dangling
  // anyway.
  if (Array.isArray(data.threads) && data.threads.length > 0) {
    const insertThread = db.prepare(`
      INSERT INTO threads (user_id, name, description, status, weight, kind, insight, detected_at, updated_at)
      VALUES (@user_id, @name, @description, @status, @weight, @kind, @insight, @detected_at, @updated_at)
    `);
    const insertNode = db.prepare(`
      INSERT INTO thread_nodes (thread_id, content_type, content_id, created_at)
      VALUES (@thread_id, @content_type, @content_id, @created_at)
    `);
    // Defensive: a thread name/description/insight should arrive here as
    // PLAINTEXT (the export decrypts, or the v5 restore decrypts with the
    // backup key before this point). If it's still ciphertext, encryptField
    // would store it unchanged (its isEncrypted guard skips re-encryption),
    // producing a thread whose name can't be decrypted with the importing
    // user's key — exactly the "lenc:v1: junk thread" corruption. Recover by
    // trying the current user's key; if that also fails, the thread is
    // unrecoverable, so skip it rather than create undecryptable junk.
    const SENT = 'lenc:v1:';
    const ensurePlain = (v) => {
      const s = v == null ? '' : String(v);
      if (!s.startsWith(SENT)) return s;            // already plaintext
      const tryPlain = safeDecrypt(userId, s);       // maybe it's our own ciphertext
      return String(tryPlain).startsWith(SENT) ? null : tryPlain; // null = unrecoverable
    };
    let skippedCorruptThreads = 0;
    for (const th of data.threads) {
      try {
        const plainName = ensurePlain(th.name);
        if (plainName === null) { skippedCorruptThreads++; counts.skipped++; continue; }
        const plainDesc = ensurePlain(th.description);
        const plainInsight = ensurePlain(th.insight);
        const res = insertThread.run({
          user_id: userId,
          name: enc(plainName || ''),
          description: enc(plainDesc || ''),
          status: th.status || 'active',
          weight: th.weight || 'medium',
          kind: th.kind || 'novel',
          insight: enc(plainInsight || ''),
          detected_at: th.detected_at || new Date().toISOString(),
          updated_at: th.updated_at || th.detected_at || new Date().toISOString(),
        });
        const newThreadId = res.lastInsertRowid;
        counts.threads = (counts.threads || 0) + 1;
        for (const node of (th.nodes || [])) {
          const map = node.content_type === 'entry' ? entryIdMap
                    : node.content_type === 'note' ? noteIdMap
                    : node.content_type === 'conversation' ? sessionIdMap
                    : null;
          const newContentId = map ? (map[node.content_id] || null) : null;
          if (!newContentId) { counts.skipped++; continue; }
          try {
            insertNode.run({
              thread_id: newThreadId,
              content_type: node.content_type,
              content_id: newContentId,
              created_at: node.created_at || new Date().toISOString(),
            });
            counts.thread_nodes = (counts.thread_nodes || 0) + 1;
          } catch { counts.skipped++; }
        }
      } catch { counts.skipped++; }
    }
    if (skippedCorruptThreads > 0) {
      console.warn(`[restore] skipped ${skippedCorruptThreads} thread(s) whose name could not be decrypted — prevented undecryptable junk threads.`);
    }
  }

  // 12. Settings — replace this user's settings + leave global / other users
  //     untouched. Auth middleware put us in user context, so s.set writes
  //     each restored value under <key>::<userId> automatically.
  if (data.settings && typeof data.settings === 'object') {
    // Wipe just this user's per-user rows so restore is a clean replace.
    db.prepare("DELETE FROM settings WHERE key LIKE ?").run(`%::${userId}`);
    for (const [key, value] of Object.entries(data.settings)) {
      try {
        s.set(key, value); // writes <key>::<userId> via the user context
        counts.settings = (counts.settings || 0) + 1;
      } catch { counts.skipped++; }
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

  // 13. Onboarding flag — if the backup came from an account that had
  // completed onboarding (or shipped any portrait data, which only the
  // onboarding flow ever sets), carry that flag forward to the restoring
  // user. Otherwise restoring a backup leaves onboarding_complete=false on
  // the new account: the user fills in date of birth, hits Skip for now,
  // and onboarding pops back up every login until they walk through the
  // whole flow they already completed years ago on the source account.
  const sourceUser = Array.isArray(data.users) && data.users[0];
  // Be liberal in what we accept: SQLite returns INTEGER 1, JSON could be
  // boolean true, string "1", or number 1.0. Coerce to truthy.
  const sourceCompleted = !!(sourceUser && sourceUser.onboarding_complete);
  const hadPortrait = portrait && Object.keys(portrait).length > 0;
  if (sourceCompleted || hadPortrait) {
    try {
      db.prepare('UPDATE users SET onboarding_complete = 1 WHERE id = ?').run(userId);
    } catch {}
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
