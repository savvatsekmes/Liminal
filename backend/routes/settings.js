const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database');
const s = require('../services/settingsService');
const llm = require('../services/llmService');

// ── GET /api/settings ─────────────────────────────────────────────────────────
// Returns all settings with secrets masked
router.get('/', (req, res) => {
  const all = s.getAll();
  // Add hasKey booleans for secrets so the UI knows they're set
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

  // Clamp numeric TTS values
  for (const k of ['chatterbox_exaggeration', 'chatterbox_cfg_weight', 'chatterbox_temperature']) {
    if (k in updates) updates[k] = String(parseFloat(updates[k]) || 0);
  }

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
// Returns list of CUDA GPUs available on this machine
router.get('/gpus', (req, res) => {
  const { execSync } = require('child_process');
  const python = process.env.PYTHON_PATH ||
    'C:\\Users\\Savva Tsekmes\\AppData\\Local\\Programs\\Python\\Python313\\python.exe';
  try {
    const out = execSync(
      `"${python}" -c "import torch,json; gpus=[{'id':i,'name':torch.cuda.get_device_name(i),'vram_gb':round(torch.cuda.get_device_properties(i).total_memory/1e9,1)} for i in range(torch.cuda.device_count())]; print(json.dumps({'cuda':torch.cuda.is_available(),'gpus':gpus}))"`,
      { timeout: 10000 }
    );
    res.json(JSON.parse(out.toString().trim()));
  } catch {
    res.json({ cuda: false, gpus: [] });
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
        cfg_weight:   parseFloat(s.get('chatterbox_cfg_weight')   || '0.9'),
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
// Download full Liminal backup as JSON (all user data)
router.get('/export', (req, res) => {
  const entries = db.prepare(`
    SELECT id, title, body, body_text, date, tags, created_at, updated_at
    FROM entries ORDER BY date DESC, created_at DESC
  `).all().map(e => ({ ...e, tags: parseJSON(e.tags, []) }));

  const notes = db.prepare(`
    SELECT id, type, body, attribution, target_date, custom_tag, created_at, updated_at
    FROM notes ORDER BY created_at DESC
  `).all();

  const oracleSessions = db.prepare(`
    SELECT id, archetype, title, created_at FROM oracle_sessions ORDER BY created_at DESC
  `).all().map(session => ({
    ...session,
    messages: db.prepare(
      'SELECT role, content, archetype, created_at FROM oracle_messages WHERE session_id = ? ORDER BY created_at'
    ).all(session.id),
  }));

  const reflections = db.prepare(`
    SELECT entry_id, blocks, created_at, updated_at FROM reflections ORDER BY created_at DESC
  `).all().map(r => ({ ...r, blocks: parseJSON(r.blocks, []) }));

  const noteReflections = db.prepare(`
    SELECT note_id, blocks, created_at, updated_at FROM note_reflections ORDER BY created_at DESC
  `).all().map(r => ({ ...r, blocks: parseJSON(r.blocks, []) }));

  const portrait = db.prepare('SELECT * FROM portrait WHERE id = 1').get();
  const memory   = db.prepare('SELECT summary, updated_at FROM memory WHERE id = 1').get();
  const memories = db.prepare('SELECT content, pinned, source_entry_id, created_at FROM memories ORDER BY created_at DESC').all();

  const entryVersions = db.prepare(`
    SELECT entry_id, title, body, body_text, saved_at FROM entry_versions ORDER BY saved_at DESC
  `).all();

  const noteVersions = db.prepare(`
    SELECT note_id, body, saved_at FROM note_versions ORDER BY saved_at DESC
  `).all();

  const exportData = {
    exported_at: new Date().toISOString(),
    version: 2,
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
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="liminal-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(exportData);
});

// ── DELETE /api/settings/data ─────────────────────────────────────────────────
// Wipe all journal entries. Requires { password } in body for verification.
// Does NOT delete auth, portrait, or memories.
router.delete('/data', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required to confirm deletion' });

  const bcrypt = require('bcryptjs');
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  db.prepare('DELETE FROM entries').run();
  db.prepare('DELETE FROM reflections').run();
  db.prepare('DELETE FROM entry_embeddings').run();

  // Wipe vectra index
  const vectraDir = path.join(__dirname, '..', 'data', 'vectra');
  if (fs.existsSync(vectraDir)) {
    fs.rmSync(vectraDir, { recursive: true, force: true });
  }

  res.json({ success: true, message: 'All journal entries deleted.' });
});

// ── PUT /api/settings/username ────────────────────────────────────────────────
router.put('/username', (req, res) => {
  const { display_name } = req.body;
  if (typeof display_name !== 'string') {
    return res.status(400).json({ error: 'display_name required' });
  }
  s.set('display_name', display_name.trim());
  res.json({ success: true, display_name: display_name.trim() });
});

// ── POST /api/settings/restart ────────────────────────────────────────────────
// Spawns restart.vbs detached, then exits this process.
// The VBS kills the frontend and relaunches everything via start.vbs.
router.post('/restart', (req, res) => {
  res.json({ ok: true });
  const { spawn } = require('child_process');
  const vbs = path.join(__dirname, '../../restart.vbs');
  setTimeout(() => {
    spawn('wscript', [vbs], { detached: true, stdio: 'ignore' }).unref();
    process.exit(0);
  }, 400);
});

// ── POST /api/settings/import-json ───────────────────────────────────────────
// Import full Liminal backup (entries, notes, oracle, reflections, portrait, memories, versions)
router.post('/import-json', express.json({ limit: '50mb' }), (req, res) => {
  const data = req.body || {};
  // Support both raw array (legacy) and full backup object
  const entries = Array.isArray(data) ? data : (data.entries || []);
  const notes = data.notes || [];
  const oracleSessions = data.oracle_sessions || [];
  const reflections = data.reflections || [];
  const noteReflections = data.note_reflections || [];
  const portrait = data.portrait || null;
  const memorySummary = data.memory_summary || null;
  const memories = data.memories || [];
  const entryVersions = data.entry_versions || [];
  const noteVersions = data.note_versions || [];

  if (entries.length === 0 && notes.length === 0 && oracleSessions.length === 0 && !portrait) {
    return res.status(400).json({ error: 'No data found in backup file' });
  }

  const counts = { entries: 0, notes: 0, oracle_sessions: 0, reflections: 0, note_reflections: 0, memories: 0, entry_versions: 0, note_versions: 0, skipped: 0 };

  // Maps from old IDs to new IDs for foreign key remapping
  const entryIdMap = {};
  const noteIdMap = {};
  const sessionIdMap = {};

  const run = db.transaction(() => {
    // 1. Entries
    const insertEntry = db.prepare(`
      INSERT INTO entries (title, body, body_text, date, tags, created_at, updated_at)
      VALUES (@title, @body, @body_text, @date, @tags, @created_at, @updated_at)
    `);
    for (const e of entries) {
      try {
        const title = e.title || 'Untitled';
        const body = e.body || e.body_text || '';
        const body_text = e.body_text || body.replace(/<[^>]*>/g, '');
        const date = e.date || (e.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
        const tags = JSON.stringify(Array.isArray(e.tags) ? e.tags : []);
        const created_at = e.created_at || new Date().toISOString();
        const updated_at = e.updated_at || created_at;
        const result = insertEntry.run({ title, body, body_text, date, tags, created_at, updated_at });
        if (e.id) entryIdMap[e.id] = result.lastInsertRowid;
        counts.entries++;
      } catch { counts.skipped++; }
    }

    // 2. Notes
    const insertNote = db.prepare(`
      INSERT INTO notes (type, body, attribution, target_date, custom_tag, created_at, updated_at)
      VALUES (@type, @body, @attribution, @target_date, @custom_tag, @created_at, @updated_at)
    `);
    for (const n of notes) {
      try {
        const result = insertNote.run({
          type: n.type || 'general',
          body: n.body || '',
          attribution: n.attribution || null,
          target_date: n.target_date || null,
          custom_tag: n.custom_tag || null,
          created_at: n.created_at || new Date().toISOString(),
          updated_at: n.updated_at || n.created_at || new Date().toISOString(),
        });
        if (n.id) noteIdMap[n.id] = result.lastInsertRowid;
        counts.notes++;
      } catch { counts.skipped++; }
    }

    // 3. Oracle sessions + messages
    const insertSession = db.prepare(`
      INSERT INTO oracle_sessions (user_id, archetype, title, created_at)
      VALUES (@user_id, @archetype, @title, @created_at)
    `);
    const insertMessage = db.prepare(`
      INSERT INTO oracle_messages (session_id, role, content, archetype, created_at)
      VALUES (@session_id, @role, @content, @archetype, @created_at)
    `);
    for (const sess of oracleSessions) {
      try {
        const result = insertSession.run({
          user_id: req.userId || 1,
          archetype: sess.archetype || 'mirror',
          title: sess.title || null,
          created_at: sess.created_at || new Date().toISOString(),
        });
        const newSessionId = result.lastInsertRowid;
        if (sess.id) sessionIdMap[sess.id] = newSessionId;
        for (const msg of (sess.messages || [])) {
          insertMessage.run({
            session_id: newSessionId,
            role: msg.role || 'user',
            content: msg.content || '',
            archetype: msg.archetype || sess.archetype || null,
            created_at: msg.created_at || new Date().toISOString(),
          });
        }
        counts.oracle_sessions++;
      } catch { counts.skipped++; }
    }

    // 4. Reflections (remap entry_id)
    const insertReflection = db.prepare(`
      INSERT INTO reflections (entry_id, user_id, blocks, created_at, updated_at)
      VALUES (@entry_id, @user_id, @blocks, @created_at, @updated_at)
    `);
    for (const r of reflections) {
      try {
        const newEntryId = entryIdMap[r.entry_id] || r.entry_id;
        insertReflection.run({
          entry_id: newEntryId,
          user_id: req.userId || 1,
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
        const newNoteId = noteIdMap[r.note_id] || r.note_id;
        insertNoteReflection.run({
          note_id: newNoteId,
          user_id: req.userId || 1,
          blocks: typeof r.blocks === 'string' ? r.blocks : JSON.stringify(r.blocks || []),
          created_at: r.created_at || new Date().toISOString(),
          updated_at: r.updated_at || r.created_at || new Date().toISOString(),
        });
        counts.note_reflections++;
      } catch { counts.skipped++; }
    }

    // 6. Portrait (merge into existing row)
    if (portrait && Object.keys(portrait).length > 0) {
      const existing = db.prepare('SELECT id FROM portrait WHERE id = 1').get();
      if (existing) {
        const fields = ['preferred_name','age','location','occupation','big_goals','core_values',
          'communication_style','growth_edges','triggers','comfort_activities','important_people',
          'daily_routines','health_notes','spiritual_orientation','love_languages','mbti',
          'enneagram','strengths','shadow_traits','current_season','updated_at'];
        for (const f of fields) {
          if (portrait[f] !== undefined && portrait[f] !== null && portrait[f] !== '') {
            try { db.prepare(`UPDATE portrait SET ${f} = ? WHERE id = 1`).run(portrait[f]); } catch {}
          }
        }
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
          user_id: req.userId || 1,
          content: m.content || '',
          pinned: m.pinned || 0,
          source_entry_id: m.source_entry_id ? (entryIdMap[m.source_entry_id] || m.source_entry_id) : null,
          created_at: m.created_at || new Date().toISOString(),
        });
        counts.memories++;
      } catch { counts.skipped++; }
    }

    // 8. Memory summary
    if (memorySummary) {
      const existing = db.prepare('SELECT id FROM memory WHERE id = 1').get();
      if (existing) {
        db.prepare('UPDATE memory SET summary = ?, updated_at = ? WHERE id = 1')
          .run(memorySummary, new Date().toISOString());
      } else {
        db.prepare('INSERT INTO memory (id, summary, updated_at) VALUES (1, ?, ?)')
          .run(memorySummary, new Date().toISOString());
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
          user_id: req.userId || 1,
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
          user_id: req.userId || 1,
          body: v.body || '',
          saved_at: v.saved_at || new Date().toISOString(),
        });
        counts.note_versions++;
      } catch { counts.skipped++; }
    }
  });

  run();
  res.json({ success: true, ...counts });
});

function parseJSON(raw, fallback) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

module.exports = router;
