const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('djApi', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (payload) => ipcRenderer.invoke('config:save', payload),
  buildGuestQr: (payload) => ipcRenderer.invoke('dj:build-guest-qr', payload),
  connect: (payload) => ipcRenderer.invoke('dj:connect', payload),
  disconnect: () => ipcRenderer.invoke('dj:disconnect'),
  markPlayed: (payload) => ipcRenderer.invoke('dj:mark-played', payload),
  markQueued: (payload) => ipcRenderer.invoke('dj:mark-queued', payload),
  markRejected: (payload) => ipcRenderer.invoke('dj:mark-rejected', payload),
  savePng: (payload) => ipcRenderer.invoke('file:save-png', payload),
  pickFolder: () => ipcRenderer.invoke('file:pick-folder'),
  openOverlay: () => ipcRenderer.invoke('overlay:open'),
  closeOverlay: () => ipcRenderer.invoke('overlay:close'),
  getOverlayState: () => ipcRenderer.invoke('overlay:state'),
  openUrl: (payload) => ipcRenderer.invoke('system:open-url', payload),
  openPath: (payload) => ipcRenderer.invoke('system:open-path', payload),
  openTerminal: () => ipcRenderer.invoke('system:open-terminal'),
  getPartyInfo: () => ipcRenderer.invoke('dj:party-info'),
  downloadsStart: (payload) => ipcRenderer.invoke('downloads:start', payload),
  downloadsStop: () => ipcRenderer.invoke('downloads:stop'),
  downloadsStatus: () => ipcRenderer.invoke('downloads:status'),
  ensurePartyFolder: (payload) => ipcRenderer.invoke('downloads:ensure-party-folder', payload),
  revealFile: (payload) => ipcRenderer.invoke('downloads:reveal', payload),
  onEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('dj:event', listener);
    return () => {
      ipcRenderer.removeListener('dj:event', listener);
    };
  }
});
