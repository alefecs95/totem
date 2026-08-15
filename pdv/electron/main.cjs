const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isDev = !app.isPackaged;
let mainWindow = null;

Menu.setApplicationMenu(null);

function isUsableMain() {
  return Boolean(mainWindow && !mainWindow.isDestroyed());
}

/** Nao restaura se o operador minimizou. */
function focusMainWindow({ force = false } = {}) {
  if (!isUsableMain()) return false;
  try {
    if (mainWindow.isMinimized() && !force) return false;
    if (!mainWindow.isVisible() && !force) return false;
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
    fullscreen: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.maximize();

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5180');
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
  if (!isUsableMain()) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch {
    return [];
  }
});

ipcMain.handle('focus-main', () => focusMainWindow());

ipcMain.handle('minimize-main', () => {
  if (!isUsableMain()) return false;
  if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  mainWindow.minimize();
  return true;
});

ipcMain.handle('set-fullscreen', (_event, on) => {
  if (!isUsableMain()) return false;
  mainWindow.setFullScreen(Boolean(on));
  return mainWindow.isFullScreen();
});

ipcMain.handle('toggle-fullscreen', () => {
  if (!isUsableMain()) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return mainWindow.isFullScreen();
});

ipcMain.handle('is-fullscreen', () => {
  if (!isUsableMain()) return false;
  return mainWindow.isFullScreen();
});

/**
 * Impressao RAW ESC/POS.
 * webContents.print({ silent: true }) no Windows manda job que so corta
 * o papel, sem queimar tinta — bug conhecido do Chromium/Electron.
 */
ipcMain.handle('print-fichas-silent', async (_event, payload) => {
  const raw = Array.isArray(payload?.pages) ? payload.pages : [];
  const deviceName = await resolvePrinterName(payload?.deviceName || '');
  if (raw.length === 0) return { ok: false, error: 'no_pages' };
  if (!deviceName) return { ok: false, error: 'no_printer' };

  let printed = 0;
  let lastError = '';
  for (const item of raw) {
    const dataUrl = typeof item === 'string' ? item : item?.dataUrl;
    if (!dataUrl) continue;
    const result = await printOneBitmapRaw(dataUrl, deviceName);
    if (result.ok) printed += 1;
    else lastError = result.error || 'print_fail';
    await delay(120);
  }
  if (printed === 0) return { ok: false, error: lastError || 'print_fail' };
  return { ok: true, count: printed };
});

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolvePrinterName(deviceName) {
  const wanted = String(deviceName || '').trim();
  if (!isUsableMain()) return wanted;
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    if (wanted) {
      const hit = list.find(
        (p) => p.name === wanted || p.displayName === wanted
      );
      return hit?.name || wanted;
    }
    const def = list.find((p) => p.isDefault) || list[0];
    return def?.name || '';
  } catch {
    return wanted;
  }
}

function imageToEscPos(imgPath) {
  let img = nativeImage.createFromPath(imgPath);
  if (img.isEmpty()) throw new Error('empty_image');
  const size0 = img.getSize();
  const targetW = 576;
  const targetH = Math.max(
    8,
    Math.round((size0.height * targetW) / Math.max(1, size0.width))
  );
  img = img.resize({ width: targetW, height: targetH, quality: 'best' });
  const { width, height } = img.getSize();
  const bgra = img.toBitmap();

  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const b = bgra[i] ?? 255;
      const g = bgra[i + 1] ?? 255;
      const r = bgra[i + 2] ?? 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 168) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        break;
      }
    }
  }
  if (maxY < 0) {
    minY = 0;
    maxY = height - 1;
  }
  const pad = 6;
  minY = Math.max(0, minY - pad);
  maxY = Math.min(height - 1, maxY + pad);
  const outH = maxY - minY + 1;

  const widthBytes = Math.ceil(width / 8);
  const raster = Buffer.alloc(widthBytes * outH);

  for (let y = minY; y <= maxY; y += 1) {
    const row = y - minY;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const b = bgra[i] ?? 255;
      const g = bgra[i + 1] ?? 255;
      const r = bgra[i + 2] ?? 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 168) {
        raster[row * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  const header = Buffer.from([
    0x1b, 0x40,
    0x1b, 0x61, 0x01,
    0x1d, 0x76, 0x30, 0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    outH & 0xff,
    (outH >> 8) & 0xff,
  ]);
  // Avanco minimo so para o corte nao passar por cima do texto (~2-3 mm).
  const tail = Buffer.from([0x1b, 0x64, 0x01, 0x1d, 0x56, 0x41, 0x01]);
  return Buffer.concat([header, raster, tail]);
}

function sendRawToPrinter(printerName, binPath) {
  return new Promise((resolve) => {
    // PowerShell nao le arquivos dentro do app.asar — copia para TEMP.
    const packed = path.join(__dirname, 'rawPrint.ps1');
    const helper = path.join(os.tmpdir(), 'totem-pdv-rawPrint.ps1');
    try {
      fs.writeFileSync(helper, fs.readFileSync(packed));
    } catch (e) {
      resolve({ ok: false, error: String(e.message || e) });
      return;
    }
    const p = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        helper,
        '-PrinterName',
        printerName,
        '-FilePath',
        binPath,
      ],
      { windowsHide: true }
    );
    let err = '';
    p.stderr.on('data', (d) => {
      err += String(d);
    });
    p.on('error', (e) => resolve({ ok: false, error: String(e.message || e) }));
    p.on('close', (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: err.trim() || `raw_exit_${code}` });
    });
  });
}

async function printOneBitmapRaw(dataUrl, printerName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-print-'));
  try {
    const m = String(dataUrl).match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
    if (!m) return { ok: false, error: 'bad_image' };
    const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpg';
    const imgPath = path.join(dir, `ficha.${ext}`);
    const binPath = path.join(dir, 'job.bin');
    fs.writeFileSync(imgPath, Buffer.from(m[2], 'base64'));
    fs.writeFileSync(binPath, imageToEscPos(imgPath));
    return await sendRawToPrinter(printerName, binPath);
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
