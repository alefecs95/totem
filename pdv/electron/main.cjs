const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
let mainWindow = null;

// Remove menu File/Edit/View — visual de caixa/kiosk
Menu.setApplicationMenu(null);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Totem PDV',
    fullscreen: !isDev,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5180');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('list-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch {
    return [];
  }
});

ipcMain.handle('set-fullscreen', (_event, on) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setFullScreen(Boolean(on));
  return mainWindow.isFullScreen();
});

ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('is-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isFullScreen();
});

/**
 * Imprime cada PNG (data URL) em silencio — 1 pagina = 1 corte no POS
 * com "Cutting: After one page" e papel 80x25 (2,5 cm).
 */
ipcMain.handle('print-fichas-silent', async (_event, payload) => {
  const pages = Array.isArray(payload?.pages) ? payload.pages : [];
  const deviceName = payload?.deviceName || '';
  if (pages.length === 0) return { ok: false, error: 'no_pages' };

  for (const dataUrl of pages) {
    await printOneBitmap(dataUrl, deviceName);
    await delay(350);
  }
  return { ok: true, count: pages.length };
});

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printOneBitmap(dataUrl, deviceName) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 320,
      height: 140,
      webPreferences: { sandbox: true },
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  @page { size: 80mm 25mm; margin: 0; }
  html, body { margin: 0; padding: 0; width: 80mm; height: 25mm; }
  img { display: block; width: 80mm; height: 25mm; object-fit: fill; }
</style></head><body>
<img src="${dataUrl}" />
</body></html>`;

    const done = () => {
      try {
        if (!win.isDestroyed()) win.close();
      } catch {
        /* ignore */
      }
      resolve();
    };

    win.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: deviceName || undefined,
            margins: { marginType: 'none' },
            pageSize: {
              width: 80 * 1000,
              height: 25 * 1000,
            },
          },
          () => done()
        );
      }, 200);
    });

    win.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    );
    setTimeout(done, 60_000);
  });
}
