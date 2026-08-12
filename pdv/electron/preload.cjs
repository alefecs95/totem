const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdvDesktop', {
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  printFichasSilent: (pages, deviceName) =>
    ipcRenderer.invoke('print-fichas-silent', { pages, deviceName }),
  setFullscreen: (on) => ipcRenderer.invoke('set-fullscreen', on),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
});
