import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { App, BrowserWindow as BrowserWindowType, IpcMain, Shell } from 'electron';

const require = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain, shell } = require('electron') as {
  app: App;
  BrowserWindow: typeof BrowserWindowType;
  ipcMain: IpcMain;
  shell: Shell;
};

app.disableHardwareAcceleration();

if (process.env.NODE_ENV_ELECTRON_VITE === 'development') {
  app.setPath('userData', join(tmpdir(), 'driving-school-management-dev'));
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('open-external-url', async (_event, url: string) => {
    if (!url.startsWith('https://wa.me/')) {
      throw new Error('External URL is not allowed.');
    }

    await shell.openExternal(url);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
