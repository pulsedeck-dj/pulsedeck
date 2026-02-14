const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('djApi', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (payload) => ipcRenderer.invoke('config:save', payload),
  buildGuestQr: (payload) => ipcRenderer.invoke('dj:build-guest-qr', payload),
  connect: (payload) => ipcRenderer.invoke('dj:connect', payload),
  disconnect: () => ipcRenderer.invoke('dj:disconnect'),
  markPlayed: (payload) => ipcRenderer.invoke('dj:mark-played', payload),
  markQueued: (payload) => ipcRenderer.invoke('dj:mark-queued', payload),
  onEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('dj:event', listener);
    return () => {
      ipcRenderer.removeListener('dj:event', listener);
    };
  }
});
