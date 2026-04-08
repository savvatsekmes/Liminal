// Liminal — Electron preload (intentionally minimal).
//
// The renderer talks to the backend over plain HTTP on localhost:3001 and does
// not currently need any privileged Electron APIs. This file exists so that the
// BrowserWindow can be configured with `contextIsolation: true` and a defined
// preload path; expose IPC bridges here if/when the renderer needs them.

// Example for the future:
//   const { contextBridge, ipcRenderer } = require('electron');
//   contextBridge.exposeInMainWorld('liminal', {
//     openExternal: (url) => ipcRenderer.invoke('open-external', url),
//   });
