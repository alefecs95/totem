const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdvDesktop', {
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  printFichasSilent: (pages, deviceName) =>
    ipcRenderer.invoke('print-fichas-silent', { pages, deviceName }),
});
