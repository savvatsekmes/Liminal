/**
 * Ollama proxy routes — avoids CORS issues from the frontend hitting localhost:11434 directly.
 */
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function getOllamaUrl() {
  return require('../services/settingsService').get('ollama_url') || 'http://localhost:11434';
}

function isLocalOllama() {
  const url = getOllamaUrl();
  return /localhost|127\.0\.0\.1|\[::1\]/.test(url);
}

function findOllamaExecutable() {
  const home = os.homedir();
  // Prefer ollama.exe (headless server — no GUI window on spawn) over
  // "ollama app.exe" (the tray/GUI wrapper, which flashes a window and is
  // harder to hide reliably). Liminal interacts with Ollama via HTTP, not
  // the tray, so the CLI server is sufficient.
  const candidates = [
    path.join(home, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
    'C:\\Program Files\\Ollama\\ollama.exe',
    path.join(home, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama app.exe'),
    'C:\\Program Files\\Ollama\\ollama app.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function resolveGpuUuid(gpuName) {
  const r = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,uuid', '--format=csv,noheader'],
    { encoding: 'utf8', windowsHide: true, timeout: 5000 }
  );
  const lines = ((r.stdout || '').toString()).split('\n').map(l => l.trim()).filter(Boolean);
  const needle = gpuName.toLowerCase();
  for (const line of lines) {
    // "NVIDIA GeForce RTX 4090, GPU-5905c857-..."
    const idx = line.lastIndexOf(',');
    if (idx < 0) continue;
    const name = line.slice(0, idx).trim();
    const uuid = line.slice(idx + 1).trim();
    if (name.toLowerCase().includes(needle) || needle.includes(name.toLowerCase())) {
      return { name, uuid };
    }
  }
  return null;
}

// Core pin logic — reused by the HTTP route and by the backend startup hook.
// Does NOT touch user-wide env vars (so other apps like Blender see all GPUs).
// The pin is applied only to the spawned Ollama process's environment.
async function applyOllamaPin(gpuName) {
  if (process.platform !== 'win32') {
    return { ok: false, status: 501, error: 'pin-gpu currently supports Windows only' };
  }
  if (!isLocalOllama()) {
    return { ok: false, status: 400, error: 'Ollama is configured at a remote URL — cannot restart it from here.' };
  }

  const isAuto = !gpuName || gpuName === 'auto';

  let pinnedName = null;
  let pinnedUuid = null;

  if (!isAuto) {
    const resolved = resolveGpuUuid(gpuName);
    if (!resolved) {
      return { ok: false, status: 400, error: `GPU '${gpuName}' not found by nvidia-smi. Is it present and healthy?` };
    }
    pinnedName = resolved.name;
    pinnedUuid = resolved.uuid;
  }

  // Kill any running Ollama (tray app + server). /t kills descendants; ignore missing processes.
  spawnSync('taskkill', ['/f', '/t', '/im', 'ollama app.exe'], { stdio: 'ignore', windowsHide: true });
  spawnSync('taskkill', ['/f', '/t', '/im', 'ollama.exe'], { stdio: 'ignore', windowsHide: true });

  // Brief pause so the server port releases before the new instance binds.
  await new Promise(r => setTimeout(r, 800));

  const ollamaExe = findOllamaExecutable();
  if (!ollamaExe) {
    return { ok: false, status: 500, error: 'Ollama executable not found at default install locations.' };
  }

  // Spawn detached with env scoped to this process only — no user-wide pollution.
  // Start from a fresh env that deliberately omits CUDA_VISIBLE_DEVICES so a
  // stale user-level value (from an earlier version) doesn't leak through.
  const childEnv = { ...process.env };
  delete childEnv.CUDA_VISIBLE_DEVICES;
  if (!isAuto) {
    childEnv.CUDA_VISIBLE_DEVICES = pinnedUuid;
  }
  // Direct spawn. windowsHide: true suppresses the console window for the
  // headless ollama.exe serve command. Note: on Liminal tray-Quit, Electron's
  // `taskkill /t /f` on the backend Node walks the parent-PID tree and kills
  // this Ollama as a descendant — so the PID marker goes stale across
  // Quit+relaunch cycles. Fixing that cleanly requires a Windows Job Object
  // or VBScript launcher; for now we accept the repin-on-boot cost.
  const isAppExe = /ollama app\.exe$/i.test(ollamaExe);
  const ollamaArgs = isAppExe ? [] : ['serve'];
  const child = spawn(ollamaExe, ollamaArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: childEnv,
  });
  child.unref();

  return {
    ok: true,
    mode: isAuto ? 'auto' : 'pinned',
    gpu: pinnedName,
    uuid: pinnedUuid,
    message: isAuto
      ? 'Ollama unpinned and restarted — back to default multi-GPU behaviour.'
      : `Ollama pinned to ${pinnedName} and restarted.`,
  };
}

// Marker file records the PID + UUID of the Ollama process we last pinned.
// On Liminal relaunch, if the current ollama.exe PID matches the marker, we
// know it's still our pinned instance and can skip the kill + respawn (which
// added 3-5s to every Liminal startup). If PIDs differ (reboot, manual
// Ollama restart), the marker is stale and we repin.
function getMarkerPath() {
  const { DATA_DIR } = require('../paths');
  return path.join(DATA_DIR, 'ollama-pin-marker.json');
}

function readMarker() {
  try {
    const raw = fs.readFileSync(getMarkerPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeMarker(uuid, pid) {
  try {
    fs.writeFileSync(getMarkerPath(), JSON.stringify({ uuid, pid, timestamp: new Date().toISOString() }));
  } catch {}
}

function getCurrentOllamaServerPid() {
  try {
    const r = spawnSync('tasklist', ['/fi', 'imagename eq ollama.exe', '/fo', 'csv', '/nh'],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    const line = ((r.stdout || '').toString().split('\n').find(l => l.includes('ollama.exe')) || '').trim();
    if (!line) return null;
    // "ollama.exe","12345","Console","1","500 K"
    const match = line.match(/"ollama\.exe","(\d+)"/i);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

// Called at backend startup: if user has a specific GPU set in llm_device,
// ensure Ollama is running pinned to that GPU. Uses a PID marker to skip the
// expensive kill+respawn when Ollama is already pinned from a prior Liminal
// session — only re-pins when the running Ollama isn't ours (fresh boot,
// manual restart, etc.). Silent no-op on failure (don't block server startup).
async function ensureOllamaPinnedOnStartup() {
  try {
    const s = require('../services/settingsService');
    const pref = s.get('llm_device');
    if (!pref || pref === 'auto') return;
    if (process.platform !== 'win32') return;
    if (!isLocalOllama()) return;

    const resolved = resolveGpuUuid(pref);
    if (!resolved) return; // can't verify; leave Ollama alone rather than break it

    const currentPid = getCurrentOllamaServerPid();
    const marker = readMarker();
    if (marker
        && marker.uuid === resolved.uuid
        && marker.pid
        && currentPid === marker.pid) {
      console.log(`[ollama] startup pin skipped — already pinned (pid=${currentPid}, uuid=${resolved.uuid})`);
      return;
    }

    const result = await applyOllamaPin(pref);
    if (result.ok) {
      // Give the new ollama.exe ~1s to appear in tasklist so we can capture its PID.
      await new Promise(r => setTimeout(r, 1500));
      const newPid = getCurrentOllamaServerPid();
      if (newPid && result.uuid) writeMarker(result.uuid, newPid);
      console.log(`[ollama] startup repin → ${result.gpu} (pid=${newPid})`);
    } else {
      console.warn(`[ollama] startup repin failed: ${result.error}`);
    }
  } catch (err) {
    console.warn(`[ollama] startup repin error: ${err.message}`);
  }
}

router.post('/pin-gpu', async (req, res) => {
  const { gpuName } = req.body || {};
  const result = await applyOllamaPin(gpuName);
  if (!result.ok) {
    return res.status(result.status || 500).json({ error: result.error });
  }
  // Capture new Ollama PID and write the marker so the next Liminal startup
  // recognises the pinned instance and skips the kill+respawn.
  if (result.uuid) {
    try {
      await new Promise(r => setTimeout(r, 1500));
      const newPid = getCurrentOllamaServerPid();
      if (newPid) writeMarker(result.uuid, newPid);
    } catch {}
  } else {
    // auto mode — clear the marker
    try { fs.unlinkSync(getMarkerPath()); } catch {}
  }
  res.json({
    ok: true,
    mode: result.mode,
    gpu: result.gpu,
    uuid: result.uuid,
    message: result.message,
  });
});


// ── GET /api/ollama/models ────────────────────────────────────────────────────
// List installed Ollama models
router.get('/models', async (req, res) => {
  const url = getOllamaUrl();
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.json({ online: true, models: data.models || [] });
  } catch (err) {
    res.json({ online: false, models: [], error: err.message });
  }
});

// ── POST /api/ollama/pull ─────────────────────────────────────────────────────
// Stream a model pull from Ollama — SSE-style chunked response
router.post('/pull', async (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });

  const url = getOllamaUrl();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const r = await fetch(`${url}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!r.ok) {
      res.write(`data: ${JSON.stringify({ error: `Ollama returned ${r.status}` })}\n\n`);
      res.end();
      return;
    }

    let buffer = '';
    let hadError = false;
    for await (const chunk of r.body) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.error) hadError = true;
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
        } catch {}
      }
    }
    if (!hadError) {
      res.write(`data: ${JSON.stringify({ status: 'done' })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

router.ensureOllamaPinnedOnStartup = ensureOllamaPinnedOnStartup;
module.exports = router;
