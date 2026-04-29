// Liminal — Electron main process
//
// Responsibilities:
//   1. Spawn the Node backend (port 3001) as a child process.
//      - Dev:  uses the project's local backend (cwd = repo/backend), local Python tts_server
//      - Prod: uses backend bundled into resources/, bundled tts_server binary
//   2. Spawn the Python tts_server (port 8100) — bundled PyInstaller binary in prod.
//   3. Wait for the backend to become healthy, then create a BrowserWindow that
//      loads http://localhost:3001/ (the backend serves the built SPA in prod).
//   4. On quit, gracefully kill child processes.
//
// In dev mode (NODE_ENV=development) you can `npm start` from the repo root and
// it will reuse the existing dev workflow: local Node, local Python interpreter,
// `backend/data/` for storage. The Windows .vbs scripts continue to work
// independently — this Electron entry point is purely additive.

const { app, BrowserWindow, ipcMain, shell, globalShortcut, dialog, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const os = require('os');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_PORT = 3001;

/** Collect all usable non-internal IPv4 addresses, grouped by type. */
function getNetworkIps() {
  const ifaces = os.networkInterfaces();
  const skip = /vethernet|wsl|hyper-v|docker|loopback|virtualbox|vmware/i;
  const ips = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (skip.test(name)) continue;
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        ips.push({ address: a.address, name });
      }
    }
  }
  return ips;
}
const TTS_PORT = 8100;

// ── Path resolution ──────────────────────────────────────────────────────────
// In dev: paths are relative to the repo root.
// In prod: bundled files live under process.resourcesPath (set by electron-builder
//          via the `extraResources` config in the root package.json).
const REPO_ROOT = path.resolve(__dirname, '..');
const RES = isDev ? REPO_ROOT : process.resourcesPath;

const BACKEND_DIR  = isDev ? path.join(REPO_ROOT, 'backend')        : path.join(RES, 'backend');
const FRONTEND_DIST = isDev ? path.join(REPO_ROOT, 'frontend', 'dist') : path.join(RES, 'frontend', 'dist');
const TTS_DIR      = isDev ? REPO_ROOT                              : path.join(RES, 'tts_server');

// User data dir is per-OS; Electron picks the right one for us.
//   Win:   %APPDATA%\Liminal\
//   macOS: ~/Library/Application Support/Liminal/
//   Linux: ~/.config/Liminal/
// Dev override: keep the per-user-encryption test run fully isolated from the
// real installed app's data dir so test registrations never touch the
// production journal. Must happen before anything else reads getPath('userData').
if (isDev && !process.env.LIMINAL_USE_PROD_DATA) {
  const appDataRoot = process.env.APPDATA
    || (process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Application Support')
          : path.join(os.homedir(), '.config'));
  const devUserData = path.join(appDataRoot, 'Liminal Dev PerUser');
  fs.mkdirSync(devUserData, { recursive: true });
  app.setPath('userData', devUserData);
}
const USER_DATA = app.getPath('userData');
fs.mkdirSync(USER_DATA, { recursive: true });

// ── Single-instance lock ─────────────────────────────────────────────────────
// If a previous instance is still cleaning up (tray-Quit runs an async
// backup/sweep that can take up to ~20s), the lock will be held when the user
// double-clicks the exe again. Rather than bouncing off with a notification
// and making the user click a second time, poll for the lock for ~20s before
// giving up. The old process, once it finishes cleanup, calls app.exit(0)
// which releases the lock.
let gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  const deadline = Date.now() + 20000;
  // Busy-wait synchronously — we're at the very top of main before Electron
  // has finished bootstrapping, so setTimeout/async isn't reliable here.
  // A tight sleep loop is fine for the ~20s worst case.
  const sleepSync = (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  };
  while (Date.now() < deadline && !gotLock) {
    sleepSync(500);
    gotLock = app.requestSingleInstanceLock();
  }
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
}

// ── Child process handles ────────────────────────────────────────────────────
let backendProc = null;
let ttsProc = null;
let mainWindow = null;
let tray = null;

// ── TTS idle management ─────────────────────────────────────────────────────
// TTS stays resident whenever the main window is visible (no wait on "wake up"
// during active use) AND whenever remote browser users have been active
// recently. Only when the window is hidden (tray) AND no speak has happened
// for a while do we release the VRAM.
const TTS_HIDDEN_IDLE_MS = 5 * 60 * 1000; // kill after 5 min tray-idle
let ttsLastActivity = Date.now();
let ttsHiddenIdleTimer = null;

function markTtsActivity() {
  ttsLastActivity = Date.now();
  // If we're currently in the "hidden idle" window, push the deadline out.
  if (ttsHiddenIdleTimer) scheduleTtsHiddenIdleCheck();
}

function scheduleTtsHiddenIdleCheck() {
  // Only schedule if the window is actually hidden. If it's visible, TTS
  // stays resident indefinitely.
  const windowVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
  if (windowVisible) return;
  if (ttsHiddenIdleTimer) clearTimeout(ttsHiddenIdleTimer);
  const elapsed = Date.now() - ttsLastActivity;
  const remaining = Math.max(1000, TTS_HIDDEN_IDLE_MS - elapsed);
  ttsHiddenIdleTimer = setTimeout(() => {
    // Only kill if the window is still hidden and TTS has stayed idle.
    const windowVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    if (windowVisible) return;
    if (Date.now() - ttsLastActivity < TTS_HIDDEN_IDLE_MS) {
      scheduleTtsHiddenIdleCheck();
      return;
    }
    if (ttsProc && !ttsProc.killed) {
      const proc = ttsProc;
      ttsProc = null;
      killChild(proc);
      try {
        fs.appendFileSync(logFile('tts_server'),
          `\n[${new Date().toISOString()}] TTS released — window hidden and idle for ${TTS_HIDDEN_IDLE_MS / 1000}s\n`);
      } catch {}
    }
    ttsHiddenIdleTimer = null;
  }, remaining);
}

function cancelTtsHiddenIdleCheck() {
  if (ttsHiddenIdleTimer) {
    clearTimeout(ttsHiddenIdleTimer);
    ttsHiddenIdleTimer = null;
  }
}

// Backwards-compat stub — old call sites just update activity.
function resetTtsIdleTimer() {
  markTtsActivity();
}

function healthCheckTts(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: TTS_PORT, path: '/v1/models', timeout: timeoutMs },
      (res) => resolve(res.statusCode === 200)
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// Single-flight guard: concurrent /tts/ensure calls (frontend status poll +
// speak request + remote client warmup) used to each kill+respawn the still-
// booting TTS server because the 1s health check raced the Turbo MPS load.
// Now they all await the same promise.
let ttsStartingPromise = null;

async function ensureTtsRunning() {
  if (ttsStartingPromise) return ttsStartingPromise;
  // Trust the OS process state. The child_process 'exit' handler nulls
  // ttsProc when Python actually crashes, and `killed` is only true if WE
  // called .kill() — so a non-null, non-killed handle means the process is
  // genuinely alive. A failed health check on an alive process almost always
  // means it's busy loading a model (Turbo→Multilingual swap is ~10–30s on
  // Mac MPS, longer on first-time download). Killing it there triggers a
  // full respawn + redownload cycle. Instead we let the real TTS request
  // proceed; if Python is truly hung, the speak fetch will time out at the
  // HTTP layer and the user can retry, by which point the exit handler
  // would have nulled ttsProc.
  if (ttsProc && !ttsProc.killed) {
    if (await healthCheckTts(2000)) resetTtsIdleTimer();
    return;
  }
  ttsStartingPromise = (async () => {
    try {
      ttsProc = spawnTts();
      if (!ttsProc) throw new Error('TTS server could not be started');
      markTtsActivity();
      scheduleTtsHiddenIdleCheck();
      // Mac MPS Turbo cold-load is ~10s; a multilingual swap on top can push
      // first-healthy past 30s. 90s leaves headroom without ever appearing
      // hung to the user (frontend shows a spinner during this).
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        if (ttsProc && ttsProc.killed) throw new Error('TTS server exited during startup');
        if (await healthCheckTts(2000)) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error('TTS health check timed out');
    } finally {
      ttsStartingPromise = null;
    }
  })();
  return ttsStartingPromise;
}

function logFile(name) {
  return path.join(USER_DATA, `${name}.log`);
}

function openLogStream(name) {
  return fs.createWriteStream(logFile(name), { flags: 'a' });
}

// Localhost-only control server so the backend (a child process) can ask
// Electron main to spawn the on-demand TTS server when a remote client
// (mobile / other computer) hits /api/tts/speak. Without this, TTS only
// worked for users physically on the Electron host.
let controlServerPort = null;
function startControlServer() {
  if (controlServerPort) return controlServerPort;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/tts/ensure' && req.method === 'POST') {
      try {
        await ensureTtsRunning();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    // Lightweight keepalive: just marks TTS activity so window-hidden idle
    // timers push their deadline forward. No health check, no spawn.
    if (req.url === '/tts/keepalive' && req.method === 'POST') {
      markTtsActivity();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === '/relaunch' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => {
        if (isQuitting) return;
        isQuitting = true;
        try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide(); } catch {}
        try { if (tray) { tray.destroy(); tray = null; } } catch {}
        app.relaunch();
        try { killChild(backendProc); } catch {}
        try { killChild(ttsProc); } catch {}
        app.exit(0);
      }, 300);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  // Pick a port outside Windows' dynamic excluded ranges (Hyper-V/WSL reserve
  // large swathes of the ephemeral range). 3099 fell inside 3002–3101 on many
  // machines, causing EACCES. 13099 is well outside typical exclusions.
  // If the port is still held (fast restart), retry then fall back to OS-assigned.
  controlServerPort = 13099;
  server.on('error', (err) => {
    if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
      const retries = server._retryCount || 0;
      if (retries < 3) {
        server._retryCount = retries + 1;
        setTimeout(() => server.listen(controlServerPort, '127.0.0.1'), 500);
      } else {
        server.listen(0, '127.0.0.1', () => {
          controlServerPort = server.address().port;
        });
      }
    }
  });
  server.listen(controlServerPort, '127.0.0.1');
  return controlServerPort;
}

// Cross-platform: return the PID of the listener on `port`, or null.
// Windows: parse `netstat -ano -p TCP`. macOS/Linux: `lsof -nP -iTCP:port -sTCP:LISTEN -t`.
function findPidOnPort(port) {
  const { execFileSync } = require('child_process');
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true });
      const line = out.split('\n').find(
        (l) => /LISTENING/.test(l) && new RegExp(`:${port}\\b`).test(l)
      );
      if (!line) return null;
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1], 10);
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } else {
      const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const pid = parseInt(out.trim().split('\n')[0], 10);
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    }
  } catch { return null; }
}

// Cross-platform forceful kill by PID.
function killPid(pid) {
  const { execFileSync } = require('child_process');
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      execFileSync('kill', ['-9', String(pid)], { stdio: 'ignore' });
    }
  } catch {}
}

// If a previous backend survived (Electron crash, Task Manager kill, power loss
// before before-quit completed) it still holds :3001 with the user's session
// keys decrypted in memory. Without this, our new spawnBackend hits EADDRINUSE
// and waitForBackend silently attaches to the orphan — frontend lands in the
// unlocked session with no password prompt.
async function killOrphanBackend() {
  const probe = (timeoutMs) => new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port: BACKEND_PORT, path: '/api/health', timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });

  const initial = await probe(1000);
  if (!initial || initial.status !== 200) return;

  // Confirm it's a Liminal backend before killing — refuse to kill an
  // unrelated process that happens to be on :3001.
  let parsed = null;
  try { parsed = JSON.parse(initial.body); } catch {}
  if (!parsed || parsed.status !== 'ok') return;

  const orphanPid = findPidOnPort(BACKEND_PORT);
  if (!orphanPid) return;
  killPid(orphanPid);

  // Wait for the port to actually release before spawnBackend tries to bind.
  for (let i = 0; i < 15; i++) {
    const stillThere = await probe(300);
    if (!stillThere) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  try {
    fs.appendFileSync(path.join(USER_DATA, 'backend.log'),
      `[${new Date().toISOString()}] Killed orphan backend pid=${orphanPid} on :${BACKEND_PORT}\n`);
  } catch {}
}

// Same problem for TTS: a previous tts_server (PyInstaller binary in prod,
// `python tts_server.py` in dev) can survive an Electron crash and hold :8100.
// New spawns then fail to bind with EADDRINUSE — frontend reports "not
// reachable" while leaked multiprocessing workers pile up.
//
// We kill the listener AND any leaked tts_server siblings (PyInstaller spawns
// multiple multiprocessing helpers; killing only the parent leaves the children
// clinging to GPU memory). On macOS/Linux, `pkill -9 -f tts_server` sweeps the
// whole process group in one go.
async function killOrphanTts() {
  const orphanPid = findPidOnPort(TTS_PORT);
  if (!orphanPid) return;

  // Confirm it's our TTS by process name before killing — never assume the
  // port is ours. On Win the bundled binary is `tts_server.exe`; on POSIX it's
  // `tts_server` (PyInstaller) or `python` running tts_server.py (dev).
  let isOurs = false;
  try {
    const { execFileSync } = require('child_process');
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${orphanPid}`, '/FO', 'CSV', '/NH'],
        { encoding: 'utf8', windowsHide: true });
      isOurs = /tts_server/i.test(out);
    } else {
      const out = execFileSync('ps', ['-p', String(orphanPid), '-o', 'command='],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      isOurs = /tts_server/i.test(out);
    }
  } catch {}

  if (!isOurs) return;

  // Sweep — on POSIX, pkill catches the parent + multiprocessing workers in one
  // shot. On Windows, taskkill /t /f does the same via the parent PID's tree.
  try {
    const { execFileSync } = require('child_process');
    if (process.platform === 'win32') {
      killPid(orphanPid);
      execFileSync('taskkill', ['/f', '/im', 'tts_server.exe'],
        { stdio: 'ignore', windowsHide: true });
    } else {
      execFileSync('pkill', ['-9', '-f', 'tts_server'], { stdio: 'ignore' });
    }
  } catch {}

  // Wait for the port to release.
  for (let i = 0; i < 15; i++) {
    if (!findPidOnPort(TTS_PORT)) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  try {
    fs.appendFileSync(path.join(USER_DATA, 'tts_server.log'),
      `[${new Date().toISOString()}] Killed orphan TTS pid=${orphanPid} on :${TTS_PORT}\n`);
  } catch {}
}

function spawnBackend() {
  const controlPort = startControlServer();
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    LIMINAL_USER_DATA: USER_DATA,
    LIMINAL_FRONTEND_DIST: FRONTEND_DIST,
    LIMINAL_APP_VERSION: app.getVersion(),
    LIMINAL_CONTROL_URL: `http://127.0.0.1:${controlPort}`,
    NODE_ENV: isDev ? 'development' : 'production',
  };

  const serverEntry = path.join(BACKEND_DIR, 'server.js');
  // In a packaged app, electron itself can run plain Node scripts via
  // `electron <script>` because Electron's Node integration is enabled.
  // We use process.execPath so we don't need a system-installed Node.
  const node = process.execPath;
  const args = [serverEntry];

  const child = spawn(node, args, {
    cwd: BACKEND_DIR,
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const out = openLogStream('backend');
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.on('exit', (code, signal) => {
    out.write(`\n[backend exited code=${code} signal=${signal}]\n`);
  });

  return child;
}

function spawnTts() {
  // Dev: use the user's local Python (the existing dev workflow). We do NOT
  //      hardcode an interpreter path here — rely on `python` in PATH or fall
  //      back to skipping (the user can launch tts_server.py manually as today).
  // Prod: use the bundled PyInstaller binary.
  const env = {
    ...process.env,
    TTS_PORT: String(TTS_PORT),
    LIMINAL_USER_DATA: USER_DATA,
    VOICES_DIR: path.join(USER_DATA, 'voices'),
    // Whisper STT model: 'base' is the floor — readable on weak CPUs, ~150 MB.
    // Override via setting later if we expose model size in Settings.
    LIMINAL_WHISPER_MODEL: 'base',
  };

  let cmd, args, cwd;

  if (isDev) {
    // Dev: try `python tts_server.py` from repo root. If python isn't on PATH
    // the user is expected to have started it manually (the original workflow).
    cmd = process.platform === 'win32' ? 'python' : 'python3';
    args = ['tts_server.py'];
    cwd = REPO_ROOT;
  } else {
    const binName = process.platform === 'win32' ? 'tts_server.exe' : 'tts_server';
    cmd = path.join(TTS_DIR, binName);
    args = [];
    cwd = TTS_DIR;
    if (!fs.existsSync(cmd)) {
      console.warn(`[main] tts_server binary not found at ${cmd} — TTS disabled`);
      return null;
    }
  }

  try {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const out = openLogStream('tts_server');
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    child.on('error', (err) => {
      out.write(`\n[tts spawn error] ${err.message}\n`);
      if (ttsProc === child) ttsProc = null;
    });
    child.on('exit', (code, signal) => {
      out.write(`\n[tts exited code=${code} signal=${signal}]\n`);
      // Crash or manual stop — drop the reference so the next /tts/ensure
      // call respawns instead of short-circuiting on a zombie handle.
      if (ttsProc === child) ttsProc = null;
    });
    return child;
  } catch (err) {
    console.warn('[main] Failed to spawn tts_server:', err.message);
    return null;
  }
}

// Poll the backend health endpoint until it responds, or give up after timeoutMs.
function waitForBackend(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        { host: '127.0.0.1', port: BACKEND_PORT, path: '/api/health', timeout: 1000 },
        (res) => {
          if (res.statusCode === 200) return resolve();
          retry();
        }
      );
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('Backend health check timed out'));
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f0f10',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Window visibility drives TTS residency: visible → keep TTS in VRAM;
  // hidden → start countdown to release, bumped by remote browser activity.
  mainWindow.on('hide', () => scheduleTtsHiddenIdleCheck());
  mainWindow.on('minimize', () => scheduleTtsHiddenIdleCheck());
  mainWindow.on('show', () => cancelTtsHiddenIdleCheck());
  mainWindow.on('restore', () => cancelTtsHiddenIdleCheck());

  // External links open in the user's default browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // The actual `context-menu` listener is registered in
  // app.on('web-contents-created') below — that runs at the very moment the
  // WebContents is born, which is the canonical place to attach it. We had
  // tried registering here in createWindow before and the event never fired
  // for reasons we never identified; the earlier attachment point fixes it.

  // Renderer asks main to replace the misspelled word the user right-clicked
  // (uses Electron's webContents.replaceMisspelling, which knows the spell-
  // check anchor in the focused editable element).
  ipcMain.on('liminal:debug', (_event, msg) => {
    try {
      fs.appendFileSync(path.join(USER_DATA, 'ctxmenu-debug.log'),
        `[${new Date().toISOString()}] [renderer] ${msg}\n`);
    } catch {}
  });

  ipcMain.on('liminal:replace-misspelling', (_event, word) => {
    if (typeof word === 'string') mainWindow.webContents.replaceMisspelling(word);
  });
  ipcMain.on('liminal:add-to-dictionary', (_event, word) => {
    if (typeof word === 'string' && word.length) {
      mainWindow.webContents.session.addWordToSpellCheckerDictionary(word);
    }
  });

  await mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}/`);


  // macOS renders Electron content noticeably larger than Windows for the same
  // CSS sizes — 90% brings the two platforms to roughly the same visual density.
  if (process.platform === 'darwin') {
    mainWindow.webContents.setZoomFactor(0.9);
  }

  // Register a reliable DevTools shortcut. Electron's default Ctrl+Shift+I is
  // sometimes swallowed by the autoHideMenuBar config; a globalShortcut bypasses
  // the menu accelerator path entirely.
  globalShortcut.register('Control+Shift+I', () => {
    if (mainWindow && mainWindow.isFocused()) {
      mainWindow.webContents.toggleDevTools();
    }
  });
  globalShortcut.register('F12', () => {
    if (mainWindow && mainWindow.isFocused()) {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

// Focus existing window if user launches a second instance. The window may be
// hidden (closed-to-tray) — in that case restore/focus alone won't make it
// visible, so we explicitly show() it. If the window object is gone for any
// reason, recreate it instead of leaving the user staring at nothing.
//
// During quit cleanup (isQuitting), do NOT surface a window — the process is
// about to die. Showing the dying instance would let the user start typing
// into a session that's about to terminate. Tell them to wait instead.
app.on('second-instance', () => {
  if (isQuitting) {
    try {
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        new Notification({
          title: 'Liminal is closing',
          body: 'Finishing up — please wait a moment, then try again.',
          silent: true,
        }).show();
      }
    } catch {}
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// Register the WebContents `context-menu` listener at creation time. This
// gives us spell-check params (`misspelledWord`, `dictionarySuggestions`)
// which are NOT available anywhere in the renderer. Forwarded over IPC; the
// renderer-side SelectionMenu merges these into the popup it already opened
// from the DOM contextmenu event, so spell suggestions appear inline.
app.on('web-contents-created', (_event, contents) => {
  try {
    fs.appendFileSync(path.join(USER_DATA, 'ctxmenu-debug.log'),
      `[${new Date().toISOString()}] web-contents-created — attaching context-menu listener\n`);
  } catch {}

  contents.on('context-menu', (_e, params) => {
    try {
      fs.appendFileSync(path.join(USER_DATA, 'ctxmenu-debug.log'),
        `[${new Date().toISOString()}] context-menu fired misspelled="${params.misspelledWord||''}" suggestions=${(params.dictionarySuggestions||[]).length}\n`);
    } catch {}
    contents.send('liminal:context-menu', {
      x: params.x,
      y: params.y,
      isEditable: params.isEditable,
      selectionText: params.selectionText || '',
      misspelledWord: params.misspelledWord || '',
      dictionarySuggestions: params.dictionarySuggestions || [],
    });
  });
});

// Detect if launched silently at login (openAtLogin + --hidden arg).
// On Windows, Electron also reports `wasOpenedAsHidden` via getLoginItemSettings.
const launchedHidden = process.argv.includes('--hidden')
  || (process.platform === 'win32' && app.getLoginItemSettings().wasOpenedAsHidden);

app.whenReady().then(async () => {
  await Promise.all([killOrphanBackend(), killOrphanTts()]);
  backendProc = spawnBackend();
  // TTS is NOT started on boot — spawned on-demand to save VRAM

  try {
    await waitForBackend();
  } catch (err) {
    console.error('[main]', err.message, '— see backend.log in', USER_DATA);
  }

  // Always create the tray so the user can bring up the window from it.
  createTray();

  // If auto-started at login, stay in the tray — only open the window when
  // the user explicitly clicks the tray icon.
  if (!launchedHidden) {
    await createWindow();
  }
});

app.on('window-all-closed', (e) => {
  // Don't quit when window is closed — keep running in tray
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createWindow();
  }
});

// ── Share Access window ─────────────────────────────────────────────────────

let shareWindow = null;

async function showShareAccess() {
  if (shareWindow && !shareWindow.isDestroyed()) {
    shareWindow.focus();
    return;
  }

  const QRCode = require('qrcode');
  const ips = getNetworkIps();

  // Build link entries — each IP gets a QR + copyable link
  const entries = await Promise.all(ips.map(async ({ address, name }) => {
    const url = `http://${address}:${BACKEND_PORT}/`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: '#1a1a2e', light: '#ffffff' } });
    return { url, name, address, qrDataUrl };
  }));

  // Separate LAN vs Tailscale entries
  const lanEntries = entries.filter(e => !e.address.startsWith('100.'));
  const tsEntries = entries.filter(e => e.address.startsWith('100.'));
  const hasTailscale = tsEntries.length > 0;

  function renderEntries(list, startIdx) {
    return list.map((e, i) => {
      const idx = startIdx + i;
      return `
      <div class="entry">
        <div class="label">${e.name}</div>
        <div class="qr"><img src="${e.qrDataUrl}" /></div>
        <div class="link-row">
          <div class="url" onclick="copyLink(${idx})" title="Click to copy">${e.url}</div>
          <span class="copied" id="copied-${idx}">Copied!</span>
        </div>
      </div>`;
    }).join('');
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #f8f8fa; color: #1a1a2e; padding: 24px; user-select: none; }
  h1 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #888; margin-bottom: 20px; line-height: 1.5; }
  .section-title { font-size: 13px; font-weight: 600; color: #1a1a2e; margin: 18px 0 8px; }
  .section-desc { font-size: 11px; color: #888; line-height: 1.5; margin-bottom: 12px; }
  .section-desc a { color: #5b6abf; text-decoration: none; }
  .section-desc a:hover { text-decoration: underline; }
  .entry { background: #fff; border: 1px solid #e8e8ec; border-radius: 12px; padding: 20px; margin-bottom: 14px; text-align: center; }
  .label { font-size: 11px; color: #888; margin-bottom: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
  .qr { margin-bottom: 12px; }
  .qr img { width: 160px; height: 160px; border-radius: 8px; }
  .link-row { text-align: center; margin-top: 4px; position: relative; }
  .url { display: inline-block; font-family: 'Consolas', monospace; font-size: 13px; color: #1a1a2e; background: #f0f0f4; padding: 8px 14px; border-radius: 8px; border: 1px solid #e0e0e4; cursor: pointer; transition: background 0.15s; }
  .url:hover { background: #e8e8ec; }
  .copied { display: block; font-size: 11px; color: #27ae60; margin-top: 4px; opacity: 0; transition: opacity 0.2s; }
  .copied.show { opacity: 1; }
  .divider { height: 1px; background: #e8e8ec; margin: 20px 0; }
</style></head><body>
  <h1>Share Access</h1>
  <div class="subtitle">Scan the QR code on your phone, or click the link to copy it.</div>

  <div class="section-title">Local Network</div>
  <div class="section-desc">Works for devices on the same Wi-Fi or LAN. No extra software needed.</div>
  ${lanEntries.length ? renderEntries(lanEntries, 0) : '<div class="section-desc">No local network detected.</div>'}

  ${hasTailscale ? `
    <div class="divider"></div>
    <div class="section-title">Remote Access via Tailscale</div>
    <div class="section-desc">
      Works from anywhere — home, work, or on the go. Requires
      <a href="https://tailscale.com/download" onclick="openExternal(this.href); return false;">Tailscale</a>
      running on both this computer and the companion device.
      Free for up to 3 users and 100 devices.
    </div>
    ${renderEntries(tsEntries, lanEntries.length)}
  ` : `
    <div class="divider"></div>
    <div class="section-desc" style="margin-top: 16px;">
      Want remote access from anywhere? Install
      <a href="https://tailscale.com/download" onclick="openExternal(this.href); return false;">Tailscale</a>
      (free for up to 3 users) on this computer and your companion device. A remote link will appear here automatically.
    </div>
  `}

  <script>
    const { clipboard, shell } = require('electron');
    function copyLink(i) {
      const urls = ${JSON.stringify(entries.map(e => e.url))};
      clipboard.writeText(urls[i]);
      const el = document.getElementById('copied-' + i);
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 1500);
    }
    function openExternal(url) {
      shell.openExternal(url);
    }
  </script>
</body></html>`;

  shareWindow = new BrowserWindow({
    width: 340,
    height: Math.min(280 + entries.length * 280, 800),
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Liminal — Share Access',
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  shareWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  shareWindow.on('closed', () => { shareWindow = null; });
}

// ── System tray ─────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'icons', 'icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('Liminal');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Liminal',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Open in Browser',
      submenu: getNetworkIps().map(({ address, name }) => ({
        label: `${address} (${name})`,
        click: () => shell.openExternal(`http://${address}:${BACKEND_PORT}/`),
      })),
    },
    {
      label: 'Share Access',
      click: () => showShareAccess(),
    },
    { type: 'separator' },
    {
      label: 'Restart',
      click: () => {
        // Fast path: skip the full before-quit cleanup (thread sweep +
        // auto-backup) which is appropriate for Quit but adds 15-25s to a
        // Restart. The user is restarting in-place, so a backup will run
        // on actual Quit later. We still need to kill children synchronously
        // — otherwise the orphan backend keeps :3001 and the relaunched
        // instance attaches to it (the old auth-skip bug).
        // Idempotent: if Restart was already clicked, don't queue another
        // relaunch (each app.relaunch() adds to a list that all fires on
        // exit, which previously spawned multiple Liminal windows).
        if (isQuitting) return;
        isQuitting = true;
        try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide(); } catch {}
        try { if (tray) { tray.destroy(); tray = null; } } catch {}
        app.relaunch();
        try { killChild(backendProc); } catch {}
        try { killChild(ttsProc); } catch {}
        app.exit(0);
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') {
      // Synchronous taskkill — the previous async spawn would not actually
      // run before app.exit() killed the parent, leaving orphan node/python
      // processes that hold the single-instance lock and block restart.
      const { execFileSync } = require('child_process');
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      // taskkill returns as soon as the kill signal is dispatched — Windows
      // may keep the PID in the process table for ~100-500ms after. Without
      // waiting here, app.exit() fires while the doomed process is still
      // listed, which trips the NSIS-web installer's "Liminal cannot be
      // closed" prompt because the backend runs as `Liminal.exe` (via
      // ELECTRON_RUN_AS_NODE) and shares the executable name the installer
      // scans for.
      waitForProcessExit(child.pid, 2000);
    } else {
      child.kill('SIGTERM');
    }
  } catch {}
}

// Block until the given PID is gone from the Windows process table, or
// timeoutMs elapses. The tasklist call itself takes ~50-150ms, so we don't
// need a separate sleep between polls.
function waitForProcessExit(pid, timeoutMs = 2000) {
  if (process.platform !== 'win32') return;
  const { execFileSync } = require('child_process');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const out = execFileSync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, encoding: 'utf-8' }
      ).toString();
      // Live row starts with a quoted image name; "INFO: No tasks…" means gone.
      if (!out.startsWith('"')) return;
    } catch {
      return; // tasklist failed — assume the PID is unreachable, i.e. gone.
    }
  }
}

// ── Clipboard ───────────────────────────────────────────────────────────────
// Native clipboard access for the right-click menu. Going through Electron's
// main-process clipboard avoids the renderer-side focus/selection quirks that
// break document.execCommand('copy') when the menu is open.
ipcMain.handle('liminal:clipboard-write', (_e, payload) => {
  try {
    const { clipboard } = require('electron');
    const data = {};
    if (payload?.text) data.text = payload.text;
    if (payload?.html) data.html = payload.html;
    if (Object.keys(data).length) clipboard.write(data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('liminal:clipboard-read', () => {
  try {
    const { clipboard } = require('electron');
    return { text: clipboard.readText() || '', html: clipboard.readHTML() || '' };
  } catch (err) {
    return { text: '', html: '', error: err.message };
  }
});

// ── Open on startup ─────────────────────────────────────────────────────────

ipcMain.handle('liminal:get-login-item', () => {
  return app.getLoginItemSettings();
});

ipcMain.handle('liminal:set-login-item', (_event, enabled) => {
  // Pass --hidden so on auto-start we stay in the tray until the user clicks it.
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? ['--hidden'] : [],
  });
  return app.getLoginItemSettings();
});

// ── On-demand TTS ───────────────────────────────────────────────────────────

ipcMain.handle('liminal:ensure-tts', async () => {
  try {
    await ensureTtsRunning();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Called when the app auto-locks — release VRAM immediately instead of
// waiting for the hidden-window idle timer.
ipcMain.handle('liminal:release-tts', async () => {
  cancelTtsHiddenIdleCheck();
  if (ttsProc && !ttsProc.killed) {
    const proc = ttsProc;
    ttsProc = null;
    killChild(proc);
    try {
      fs.appendFileSync(logFile('tts_server'),
        `\n[${new Date().toISOString()}] TTS released — app auto-locked\n`);
    } catch {}
  }
  return { ok: true };
});

// ── Backup system ────────────────────────────────────────────────────────────

let sessionPassword = null;
let sessionToken = null;
let sessionUsername = null;

ipcMain.on('liminal:set-session-password', (_event, pw, token) => {
  sessionPassword = pw;
  if (token) {
    sessionToken = token;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      sessionUsername = payload.username || payload.sub || null;
    } catch {}
  }
  // Warm TTS on login so the first Read-aloud press is instant. Safe because
  // the window-hidden idle timer will release VRAM after 5 min in the tray.
  ensureTtsRunning().catch(err => {
    console.warn('[tts] login warmup failed:', err.message);
  });
});

ipcMain.handle('liminal:pick-backup-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose backup location',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

/** Fetch JSON from the running backend. */
function backendFetch(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET';
    const headers = { ...(options.headers || {}) };
    // Inject auth token for authenticated endpoints
    if (sessionToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    const reqOpts = {
      host: '127.0.0.1',
      port: BACKEND_PORT,
      path: urlPath,
      method,
      timeout: options.timeout || 15000,
      headers,
    };
    const req = http.request(reqOpts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, buf, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Backend request timed out')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

/** Perform an encrypted backup to the given directory. Returns the file path. */
async function performBackup(backupDir, maxBackups) {
  // Request encrypted backup from backend
  const res = await backendFetch('/api/settings/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: sessionPassword }),
    timeout: 30000,
  });

  if (res.status !== 200) {
    const errText = res.buf.toString('utf8');
    throw new Error(`Backup request failed (${res.status}): ${errText}`);
  }

  // Nest under <backupDir>/Liminal_Backup/<username>/ so picking a generic
  // folder (Documents, Dropbox, etc.) doesn't dump .liminal files alongside
  // the user's other content. The Liminal_Backup wrapper keeps everything
  // Liminal-related in one tidy place; the per-user subfolder isolates
  // accounts on shared machines.
  const userDir = sessionUsername
    ? path.join(backupDir, 'Liminal_Backup', sessionUsername)
    : path.join(backupDir, 'Liminal_Backup');
  fs.mkdirSync(userDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `liminal-backup-${ts}.liminal`;
  const filepath = path.join(userDir, filename);
  fs.writeFileSync(filepath, res.buf);

  // Rotate
  rotateBackups(userDir, maxBackups || 10);

  return filepath;
}

/** Keep only the newest `maxKeep` backup files, delete the rest. */
function rotateBackups(dir, maxKeep) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('liminal-backup-') && f.endsWith('.liminal'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (let i = maxKeep; i < files.length; i++) {
      try { fs.unlinkSync(path.join(dir, files[i].name)); } catch {}
    }
  } catch {}
}

ipcMain.handle('liminal:trigger-backup', async () => {
  if (!sessionPassword) return { success: false, error: 'No session password — please log in first' };
  try {
    const settingsRes = await backendFetch('/api/settings');
    const settings = JSON.parse(settingsRes.buf.toString('utf8'));
    const backupDir = (settings.backup_location || '').trim() || path.join(USER_DATA, 'backups');
    const maxBackups = parseInt(settings.max_backups, 10) || 10;
    const filepath = await performBackup(backupDir, maxBackups);
    try {
      await backendFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_backup_time: new Date().toISOString() }),
      });
    } catch {}
    return { success: true, path: filepath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Auto-backup on quit ──────────────────────────────────────────────────────

let isQuitting = false;

app.on('before-quit', async (event) => {
  if (isQuitting) {
    // Second Quit click while cleanup is in flight = user wants out now.
    // Skip the remaining sweep/backup and exit immediately. Sweep is
    // additive/idempotent so partial completion is safe; an interrupted
    // backup is logged and retried on next quit.
    try {
      fs.appendFileSync(path.join(USER_DATA, 'backup.log'),
        `[${new Date().toISOString()}] Quit force-exited by second tray click — sweep/backup may be incomplete\n`);
    } catch {}
    try { killChild(backendProc); } catch {}
    try { killChild(ttsProc); } catch {}
    app.exit(0);
    return;
  }
  event.preventDefault();
  isQuitting = true;

  // Instant visual feedback so the user doesn't think Quit was ignored.
  // Cleanup below can take up to ~15s on slow thread sweeps + backup.
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide(); } catch {}
  try { if (tray) { tray.destroy(); tray = null; } } catch {}


  // Hard ceiling on cleanup. If backend is stuck (or auto-backup is huge)
  // we still want the process to die so the single-instance lock releases
  // and the user can relaunch. 20s gives the 10s sweep poll + a normal
  // backup room to finish, then forces exit.
  const hardExitTimer = setTimeout(() => {
    try { killChild(backendProc); } catch {}
    try { killChild(ttsProc); } catch {}
    app.exit(0);
  }, 20000);
  hardExitTimer.unref?.();

  // Incremental thread sweep: catches entries/notes/sessions the user saved
  // but didn't Reflect on. Bounded to 20 items server-side so it can't stall
  // quit. We poll for completion for up to 10s — longer backlogs simply carry
  // over to the next quit (previously 30s, but that left the user staring at
  // a vanished tray icon for half a minute).
  try {
    if (sessionPassword) {
      await backendFetch('/api/threads/sweep', { method: 'POST', timeout: 5000 });
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        try {
          const { buf } = await backendFetch('/api/threads/detect-status', { timeout: 3000 });
          const status = JSON.parse(buf.toString('utf8'));
          if (!status.running) break;
        } catch { break; }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } catch (err) {
    console.error('[quit] thread sweep failed:', err.message);
  }

  try {
    if (sessionPassword) {
      const settingsRes = await backendFetch('/api/settings', { timeout: 5000 });
      const settings = JSON.parse(settingsRes.buf.toString('utf8'));

      if (settings.auto_backup_enabled === 'true') {
        const backupDir = (settings.backup_location || '').trim();
        if (backupDir) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('liminal:backup-starting');
          }
          const maxBackups = parseInt(settings.max_backups, 10) || 10;
          await performBackup(backupDir, maxBackups);
          try {
            await backendFetch('/api/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ last_backup_time: new Date().toISOString() }),
            });
          } catch {}
          try {
            fs.appendFileSync(path.join(USER_DATA, 'backup.log'),
              `[${new Date().toISOString()}] Auto-backup saved to ${backupDir}\n`);
          } catch {}
        }
      }
    }
  } catch (err) {
    try {
      fs.appendFileSync(path.join(USER_DATA, 'backup.log'),
        `[${new Date().toISOString()}] Auto-backup failed: ${err.message}\n`);
    } catch {}
  }

  // Clean up children and force exit. app.exit() bypasses before-quit so we
  // guarantee the process terminates on a single Quit click.
  if (ttsIdleTimer) clearTimeout(ttsIdleTimer);
  killChild(backendProc);
  killChild(ttsProc);
  app.exit(0);
});
