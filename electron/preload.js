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

// Debug: send a message to main so it can log preload lifecycle to a file.
// (Can't use fs here because Electron's preload sandbox blocks Node built-ins.)
function dbg(msg) { try { ipcRenderer.send('liminal:debug', msg); } catch {} }
dbg('preload loaded, exposing window.liminal');

contextBridge.exposeInMainWorld('liminal', {
  // Subscribe to context-menu events from the main process. Returns an
  // unsubscribe function so the renderer can clean up on unmount.
  onContextMenu(callback) {
    dbg('onContextMenu subscribed by renderer');
    const handler = (_event, data) => {
      dbg('IPC liminal:context-menu received in preload');
      callback(data);
    };
    ipcRenderer.on('liminal:context-menu', handler);
    return () => ipcRenderer.removeListener('liminal:context-menu', handler);
  },
  replaceMisspelling(word) {
    ipcRenderer.send('liminal:replace-misspelling', word);
  },
  addToDictionary(word) {
    ipcRenderer.send('liminal:add-to-dictionary', word);
  },
});
