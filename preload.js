// Liminal — Electron preload
//
// Exposes a small `window.liminal` API to the renderer for things that must
// originate in the main process. Currently used by the unified right-click
// menu so the renderer can:
//   - receive context-menu params (selection text, misspelled word + dictionary
//     suggestions) which are only available on the main-process `context-menu`
//     event.
//   - apply spell-check fixes (replace misspelling, add to user dictionary).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liminal', {
  // Subscribe to context-menu events from the main process. Returns an
  // unsubscribe function so the renderer can clean up on unmount.
  onContextMenu(callback) {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('liminal:context-menu', handler);
    return () => ipcRenderer.removeListener('liminal:context-menu', handler);
  },
  replaceMisspelling(word) {
    ipcRenderer.send('liminal:replace-misspelling', word);
  },
  addToDictionary(word) {
    ipcRenderer.send('liminal:add-to-dictionary', word);
  },

  // ── TTS on-demand ──────────────────────────────────────────────────────────
  ensureTts() {
    return ipcRenderer.invoke('liminal:ensure-tts');
  },

  // ── Backup system ──────────────────────────────────────────────────────────
  pickBackupFolder() {
    return ipcRenderer.invoke('liminal:pick-backup-folder');
  },
  triggerBackup() {
    return ipcRenderer.invoke('liminal:trigger-backup');
  },
  setSessionPassword(pw, token) {
    ipcRenderer.send('liminal:set-session-password', pw, token);
  },
  onBackupStarting(callback) {
    const handler = (_event) => callback();
    ipcRenderer.on('liminal:backup-starting', handler);
    return () => ipcRenderer.removeListener('liminal:backup-starting', handler);
  },

  // ── Clipboard ──────────────────────────────────────────────────────────────
  clipboardWrite(payload) {
    return ipcRenderer.invoke('liminal:clipboard-write', payload);
  },
  clipboardRead() {
    return ipcRenderer.invoke('liminal:clipboard-read');
  },

  // ── Open on startup ────────────────────────────────────────────────────────
  getLoginItem() {
    return ipcRenderer.invoke('liminal:get-login-item');
  },
  setLoginItem(enabled) {
    return ipcRenderer.invoke('liminal:set-login-item', enabled);
  },
});
