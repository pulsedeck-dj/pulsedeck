const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('djApi', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (payload) => ipcRenderer.invoke('config:save', payload),
  connect: (payload) => ipcRenderer.invoke('dj:connect', payload),
  disconnect: () => ipcRenderer.invoke('dj:disconnect'),
  onEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('dj:event', listener);
    return () => {
      ipcRenderer.removeListener('dj:event', listener);
    };
  }
});
