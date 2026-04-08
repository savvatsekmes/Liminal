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

const { app, BrowserWindow, shell, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_PORT = 3001;
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
const USER_DATA = app.getPath('userData');
fs.mkdirSync(USER_DATA, { recursive: true });

// ── Single-instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ── Child process handles ────────────────────────────────────────────────────
let backendProc = null;
let ttsProc = null;
let mainWindow = null;

function logFile(name) {
  return path.join(USER_DATA, `${name}.log`);
}

function openLogStream(name) {
  return fs.createWriteStream(logFile(name), { flags: 'a' });
}

function spawnBackend() {
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    LIMINAL_USER_DATA: USER_DATA,
    LIMINAL_FRONTEND_DIST: FRONTEND_DIST,
    LIMINAL_APP_VERSION: app.getVersion(),
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
    child.on('error', (err) => out.write(`\n[tts spawn error] ${err.message}\n`));
    child.on('exit', (code, signal) => {
      out.write(`\n[tts exited code=${code} signal=${signal}]\n`);
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

  // External links open in the user's default browser, not a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}/`);

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

// Focus existing window if user launches a second instance.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  backendProc = spawnBackend();
  ttsProc = spawnTts();

  try {
    await waitForBackend();
  } catch (err) {
    console.error('[main]', err.message, '— see backend.log in', USER_DATA);
  }

  await createWindow();
});

app.on('window-all-closed', () => {
  // Standard behaviour: quit on Win/Linux, stay alive on macOS until Cmd+Q.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function killChild(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') {
      // Use taskkill to ensure the whole subprocess tree dies on Windows.
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    } else {
      child.kill('SIGTERM');
    }
  } catch {}
}

app.on('before-quit', () => {
  killChild(backendProc);
  killChild(ttsProc);
});
