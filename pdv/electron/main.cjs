const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
let mainWindow = null;

// Remove menu File/Edit/View — visual de caixa/kiosk
Menu.setApplicationMenu(null);

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.focus();
  } catch {
    /* ignore */
  }
  return true;
}

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

  mainWindow.on('blur', () => {
    // Apos impressao silenciosa o Windows as vezes rouba o foco.
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const others = BrowserWindow.getAllWindows().filter(
        (w) => w !== mainWindow && !w.isDestroyed() && w.isVisible()
      );
      if (others.length === 0 && !mainWindow.isFocused()) {
        focusMainWindow();
      }
    }, 400);
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5180');
    // DevTools detachado rouba foco — so abre se PDV_DEVTOOLS=1
    if (process.env.PDV_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
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

ipcMain.handle('focus-main', () => focusMainWindow());

ipcMain.handle('set-fullscreen', (_event, on) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setFullScreen(Boolean(on));
  return mainWindow.isFullScreen();
});

ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  focusMainWindow();
  return next;
});

ipcMain.handle('is-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isFullScreen();
});

/**
 * Imprime cada PNG (data URL) em silencio — 1 pagina = 1 corte no POS.
 * Aceita string[] (legado, 25mm) ou { dataUrl, heightMm }[].
 */
ipcMain.handle('print-fichas-silent', async (_event, payload) => {
  const raw = Array.isArray(payload?.pages) ? payload.pages : [];
  const deviceName = payload?.deviceName || '';
  if (raw.length === 0) return { ok: false, error: 'no_pages' };

  try {
    for (const item of raw) {
      const dataUrl = typeof item === 'string' ? item : item?.dataUrl;
      const heightMm =
        typeof item === 'object' && item && Number(item.heightMm) > 0
          ? Number(item.heightMm)
          : 25;
      if (!dataUrl) continue;
      await printOneBitmap(dataUrl, deviceName, heightMm);
      await delay(350);
    }
    return { ok: true, count: raw.length };
  } finally {
    focusMainWindow();
  }
});

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printOneBitmap(dataUrl, deviceName, heightMm = 25) {
  return new Promise((resolve) => {
    const h = Math.max(20, Math.min(120, Number(heightMm) || 25));
    const win = new BrowserWindow({
      show: false,
      width: 320,
      height: Math.round(h * 4),
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      modal: false,
      focusable: false,
      skipTaskbar: true,
      webPreferences: { sandbox: true },
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  @page { size: 80mm ${h}mm; margin: 0; }
  html, body { margin: 0; padding: 0; width: 80mm; height: ${h}mm; }
  img { display: block; width: 80mm; height: ${h}mm; object-fit: fill; }
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
              height: h * 1000,
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
