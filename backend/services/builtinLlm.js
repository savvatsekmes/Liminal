/**
 * Built-in local model — a bundled llama.cpp server (`llama-server`) that
 * Liminal starts itself, so local AI works without installing anything else.
 * It sits alongside the other providers (Ollama, Claude, OpenAI); nothing
 * about Ollama changes.
 *
 * Lifecycle: started on the first request with the chosen model, restarted
 * when the model changes, stopped after IDLE_MS without use (frees the VRAM
 * for Chatterbox/Whisper and other apps) and when the backend exits. A
 * pidfile lets a fresh backend clear one left behind by a crash.
 *
 * Models: any .gguf file in DATA_DIR/models, plus the models already
 * downloaded through Ollama (Ollama stores each as a plain GGUF blob, which
 * llama.cpp opens directly — no second copy needed).
 *
 * It speaks the OpenAI-style /v1/chat/completions API.
 */

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const fetch = require('node-fetch');
const { DATA_DIR } = require('../paths');

const BIN_NAME = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
const MODELS_DIR = path.join(DATA_DIR, 'models');
const PID_FILE = path.join(DATA_DIR, 'llama_server.pid');
const LOG_FILE = path.join(DATA_DIR, 'llama_server.log');
const DEFAULT_CTX = 16384;            // chat asks for up to 16K; one slot gets all of it
const IDLE_MS = 10 * 60 * 1000;       // unload after 10 minutes unused
const LOAD_TIMEOUT_MS = 180000;       // big models from a cold disk can take a while
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const STALL_MS = 180000;              // streaming: give up after 3 minutes of silence

// ── Where the engine lives ───────────────────────────────────────────────────
// Packaged: resources/llama_server (next to resources/backend).
// Dev: <repo>/dist/llama_server (fetched there, not committed).
function binDir() {
  const candidates = [
    process.env.LIMINAL_LLAMA_DIR,
    path.join(__dirname, '..', '..', 'llama_server'),
    path.join(__dirname, '..', '..', 'dist', 'llama_server'),
  ].filter(Boolean);
  return candidates.find((d) => fs.existsSync(path.join(d, BIN_NAME))) || null;
}

function available() {
  return !!binDir();
}

// ── Models ───────────────────────────────────────────────────────────────────
function ollamaModelsDir() {
  return process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models');
}

// Families llama.cpp can't run as a chat model (embedding models; Meta's
// mllama vision architecture).
const UNSUPPORTED_FAMILIES = new Set(['bert', 'nomic-bert', 'mllama']);

function blobPath(root, digest) {
  return path.join(root, 'blobs', String(digest).replace(':', '-'));
}

function listOllamaModels() {
  const root = ollamaModelsDir();
  const manifests = path.join(root, 'manifests');
  if (!fs.existsSync(manifests)) return [];
  const out = [];
  const walk = (dir, parts) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(p, [...parts, ent.name]); continue; }
      try {
        const manifest = JSON.parse(fs.readFileSync(p, 'utf8'));
        const layer = (manifest.layers || []).find((l) => l.mediaType === 'application/vnd.ollama.image.model');
        if (!layer) continue;
        const file = blobPath(root, layer.digest);
        if (!fs.existsSync(file)) continue;
        let config = {};
        try { config = JSON.parse(fs.readFileSync(blobPath(root, manifest.config?.digest), 'utf8')); } catch {}
        const family = String(config.model_family || '').toLowerCase();
        if (UNSUPPORTED_FAMILIES.has(family) || /embed/i.test(parts.join('/'))) continue;
        // parts: [registry, namespace, model] → "model:tag", or "ns/model:tag"
        // outside the official library.
        const [registry, namespace, ...rest] = parts;
        const model = namespace === 'library' && registry === 'registry.ollama.ai'
          ? rest.join('/')
          : [namespace, ...rest].join('/');
        const name = `${model}:${ent.name}`;
        out.push({
          id: `ollama:${name}`,
          label: name,
          detail: [config.model_type, config.file_type].filter(Boolean).join(' '),
          source: 'ollama',
          path: file,
          size: layer.size,
        });
      } catch { /* not a manifest */ }
    }
  };
  walk(manifests, []);
  return out;
}

function listLocalModels() {
  // Created on first look so there's a folder to drop .gguf files into.
  try { fs.mkdirSync(MODELS_DIR, { recursive: true }); } catch {}
  return fs.readdirSync(MODELS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.gguf') && !/mmproj/i.test(f))
    .map((f) => {
      const file = path.join(MODELS_DIR, f);
      return { id: `file:${f}`, label: f.replace(/\.gguf$/i, ''), detail: '', source: 'liminal', path: file, size: fs.statSync(file).size };
    });
}

function listModels() {
  const all = [...listLocalModels(), ...listOllamaModels()];
  return all.sort((a, b) => a.label.localeCompare(b.label));
}

function resolveModel(id) {
  return listModels().find((m) => m.id === id) || null;
}

// ── GPUs ─────────────────────────────────────────────────────────────────────
let _devices = null;
function listDevices() {
  if (_devices) return _devices;
  const dir = binDir();
  if (!dir) return [];
  try {
    const text = execFileSync(path.join(dir, BIN_NAME), ['--list-devices'], {
      cwd: dir, encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    // "  Vulkan1: NVIDIA GeForce RTX 5090 (32186 MiB, 31418 MiB free)"
    _devices = [...text.matchAll(/^\s*(\S+):\s*(.+?)\s*\((\d+)\s*MiB,\s*(\d+)\s*MiB free\)/gm)]
      .map((m) => ({ id: m[1], name: m[2], totalMiB: +m[3], freeMiB: +m[4] }));
  } catch {
    _devices = [];
  }
  return _devices;
}

// The engine's own GPU choice ('auto' | a GPU name | 'cpu') — separate from
// Ollama's pin, which restarts Ollama. Auto = the GPU with the most free
// memory, so a model isn't split across a big and a small card.
function deviceArgs() {
  const pref = require('./settingsService').get('builtin_device') || 'auto';
  if (pref === 'cpu') return { args: ['--device', 'none', '-ngl', '0'], label: 'CPU', pref };
  // Free memory changes (Chatterbox, Ollama, games…), so re-read it for Auto.
  if (pref === 'auto') _devices = null;
  const devices = listDevices();
  if (!devices.length) return { args: ['-ngl', '999'], label: 'default', pref };
  const pinned = pref !== 'auto' && devices.find((d) => d.name.toLowerCase().includes(String(pref).toLowerCase()));
  const pick = pinned || [...devices].sort((a, b) => b.freeMiB - a.freeMiB)[0];
  return { args: ['--device', pick.id, '-ngl', '999'], label: pick.name, pref };
}

// ── Process management ───────────────────────────────────────────────────────
let server = null;   // { proc, url, modelId, device, ctx, ready: Promise }
let lastUsed = 0;
let inFlight = 0;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch { /* already gone */ }
}

// A previous backend that crashed can leave its engine holding VRAM. Kill it
// only if that pid really is a llama-server — pids get reused.
let orphanChecked = false;
function killOrphan() {
  if (orphanChecked) return;
  orphanChecked = true;
  let pid;
  try { pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10); } catch { return; }
  if (!pid) return;
  try {
    const isOurs = process.platform === 'win32'
      ? execFileSync('tasklist', ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }).toLowerCase().includes(BIN_NAME.toLowerCase())
      : execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }).includes('llama-server');
    if (isOurs) killPid(pid);
  } catch { /* gone */ }
  try { fs.unlinkSync(PID_FILE); } catch {}
}

function stop() {
  const s = server;
  server = null;
  if (!s) return; // nothing of ours running — leave a crashed run's pidfile for killOrphan
  if (s.proc && s.proc.exitCode == null) killPid(s.proc.pid);
  try { fs.unlinkSync(PID_FILE); } catch {}
}

function tailLog(n = 6) {
  try {
    return fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-n).join('\n');
  } catch { return ''; }
}

async function start(model, ctx) {
  const dir = binDir();
  if (!dir) throw new Error('The built-in engine is missing from this install of Liminal.');
  killOrphan();
  const port = await freePort();
  const device = deviceArgs();
  const args = [
    '-m', model.path,
    '--host', '127.0.0.1', '--port', String(port),
    '-c', String(ctx),
    '-np', '1',                 // one request at a time, with the full context
    '--no-webui',
    ...device.args,
  ];
  const log = fs.openSync(LOG_FILE, 'w');
  const proc = spawn(path.join(dir, BIN_NAME), args, {
    cwd: dir,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  fs.closeSync(log);
  try { fs.writeFileSync(PID_FILE, String(proc.pid)); } catch {}
  console.log(`[builtin-llm] starting ${model.label} on ${device.label} (ctx ${ctx}, port ${port})`);

  const url = `http://127.0.0.1:${port}`;
  const entry = { proc, url, modelId: model.id, device: device.label, devicePref: device.pref, ctx, ready: null };
  proc.on('exit', (code) => {
    if (server === entry) server = null;
    if (code) console.warn(`[builtin-llm] engine exited (${code}). Last log lines:\n${tailLog()}`);
  });

  entry.ready = (async () => {
    const deadline = Date.now() + LOAD_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (proc.exitCode != null) {
        throw new Error(`The built-in engine couldn't load "${model.label}". It may be a model llama.cpp doesn't support.\n${tailLog(3)}`);
      }
      try {
        const r = await fetch(`${url}/health`, { timeout: 2000 });
        if (r.ok) { console.log(`[builtin-llm] ready: ${model.label}`); return; }
      } catch { /* still starting */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    killPid(proc.pid);
    throw new Error('The built-in engine took too long to load the model.');
  })();
  server = entry;
  entry.ready.catch(() => { if (server === entry) stop(); });
  return entry;
}

let _ensuring = null;
async function ensure() {
  const s = require('./settingsService');
  const modelId = s.get('builtin_model');
  if (!modelId) throw new Error('Choose a model for the built-in engine in Settings → AI.');
  const ctx = Math.max(4096, parseInt(s.get('builtin_ctx'), 10) || DEFAULT_CTX);
  const devicePref = s.get('builtin_device') || 'auto';
  killOrphan();
  // Serialise: two requests arriving together must not start two engines.
  while (_ensuring) await _ensuring.catch(() => {});
  const p = (async () => {
    if (server && server.modelId === modelId && server.ctx === ctx && server.devicePref === devicePref && server.proc.exitCode == null) {
      await server.ready;
      return server;
    }
    const model = resolveModel(modelId);
    if (!model) throw new Error('The model chosen for the built-in engine is no longer on this computer. Pick another in Settings → AI.');
    stop();
    const entry = await start(model, ctx);
    await entry.ready;
    return entry;
  })();
  _ensuring = p;
  try { return await p; } finally { if (_ensuring === p) _ensuring = null; }
}

// Unload after a quiet spell.
setInterval(() => {
  if (server && inFlight === 0 && Date.now() - lastUsed > IDLE_MS) {
    console.log('[builtin-llm] idle — unloading the model');
    stop();
  }
}, 60000).unref();

process.on('exit', stop);

function status() {
  return {
    available: available(),
    running: !!server && server.proc.exitCode == null,
    model: server?.modelId || null,
    device: server?.device || null,
    modelsDir: MODELS_DIR,
    devices: listDevices().map(({ name, totalMiB }) => ({ name, totalMiB })),
  };
}

// ── Chat ─────────────────────────────────────────────────────────────────────
// Thinking models (Gemma 4, Qwen 3.5) spend the whole budget reasoning unless
// told not to — the same choice Liminal makes for Ollama (think: false).
function body(messages, options, streamFlag) {
  const b = {
    messages,
    stream: streamFlag,
    chat_template_kwargs: { enable_thinking: !!options.think },
  };
  if (options.maxTokens) b.max_tokens = options.maxTokens;
  if (options.temperature != null) b.temperature = options.temperature;
  return b;
}

function cleanText(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

async function chat(messages, options = {}) {
  const srv = await ensure();
  inFlight++;
  lastUsed = Date.now();
  try {
    const res = await fetch(`${srv.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(messages, options, false)),
      timeout: REQUEST_TIMEOUT_MS,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Built-in model request failed: ${res.status}${detail ? ' — ' + detail.slice(0, 300) : ''}`);
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    // Content empty because it only "thought": show the thinking rather than nothing.
    return cleanText(msg.content) || cleanText(msg.reasoning_content);
  } finally {
    inFlight--;
    lastUsed = Date.now();
  }
}

async function* streamChat(messages, options = {}) {
  const srv = await ensure();
  inFlight++;
  lastUsed = Date.now();
  const controller = new AbortController();
  let stallTimer = setTimeout(() => controller.abort(), STALL_MS);
  const resetStall = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => controller.abort(), STALL_MS); };
  try {
    const res = await fetch(`${srv.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(messages, options, true)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Built-in model stream failed: ${res.status}${detail ? ' — ' + detail.slice(0, 300) : ''}`);
    }
    let buffer = '';
    let inThink = false;
    for await (const chunk of res.body) {
      resetStall();
      lastUsed = Date.now();
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        let text;
        try { text = JSON.parse(payload).choices?.[0]?.delta?.content; } catch { continue; }
        if (!text) continue;
        if (text.includes('<think>')) inThink = true;
        if (inThink) {
          if (!text.includes('</think>')) continue;
          text = text.split('</think>').pop();
          inThink = false;
        }
        if (text) yield text;
      }
    }
  } catch (err) {
    if (controller.signal.aborted) throw new Error('The built-in model stopped responding (no output for 3 minutes).');
    throw err;
  } finally {
    clearTimeout(stallTimer);
    controller.abort(); // stops generation if the caller quit early
    inFlight--;
    lastUsed = Date.now();
  }
}

module.exports = { available, listModels, listDevices, status, ensure, stop, chat, streamChat, MODELS_DIR };
