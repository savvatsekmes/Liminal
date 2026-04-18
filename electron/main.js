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
let tray = null;

// ── TTS idle management ─────────────────────────────────────────────────────
const TTS_IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
let ttsIdleTimer = null;

function resetTtsIdleTimer() {
  if (ttsIdleTimer) clearTimeout(ttsIdleTimer);
  ttsIdleTimer = setTimeout(() => {
    if (ttsProc && !ttsProc.killed) {
      killChild(ttsProc);
      ttsProc = null;
      try {
        fs.appendFileSync(logFile('tts_server'),
          `\n[${new Date().toISOString()}] TTS idle timeout — process stopped to free VRAM\n`);
      } catch {}
    }
  }, TTS_IDLE_TIMEOUT_MS);
}

function ensureTtsRunning() {
  if (ttsProc && !ttsProc.killed) {
    resetTtsIdleTimer();
    return Promise.resolve();
  }
  ttsProc = spawnTts();
  if (!ttsProc) return Promise.reject(new Error('TTS server could not be started'));
  resetTtsIdleTimer();
  // Wait for TTS to become healthy
  const deadline = Date.now() + 30000;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        { host: '127.0.0.1', port: TTS_PORT, path: '/v1/models', timeout: 1000 },
        (res) => { if (res.statusCode === 200) return resolve(); retry(); }
      );
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('TTS health check timed out'));
      setTimeout(tick, 500);
    };
    tick();
  });
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
    if (req.url === '/relaunch' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => {
        app.relaunch();
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

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

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
      // Use taskkill to ensure the whole subprocess tree dies on Windows.
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    } else {
      child.kill('SIGTERM');
    }
  } catch {}
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

  // Write to user-specific subfolder inside backup dir
  const userDir = sessionUsername ? path.join(backupDir, sessionUsername) : backupDir;
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
  if (isQuitting) return; // Already handling a quit — let it finish
  event.preventDefault();
  isQuitting = true;

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
