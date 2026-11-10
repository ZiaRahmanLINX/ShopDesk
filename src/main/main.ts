// ShopDesk — Electron main process.
import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { registerIpc, bootstrapDatabase } from './ipc';
import { autoBackupIfNeeded } from './services/backup';

const isDev = !!process.env.ELECTRON_START_URL;

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'ShopDesk — Shop Management & Partnership Accounting',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    await win.loadURL(process.env.ELECTRON_START_URL as string);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  }
  return win;
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await bootstrapDatabase();
  } catch (e) {
    // Never let a DB/seed failure become an unhandled rejection that leaves
    // the user staring at a dead window — log it and still open the app so
    // the failure is visible instead of silent.
    console.error('Database bootstrap failed:', e);
  }
  const win = await createWindow();
  registerIpc(win);
  // Daily auto-backup (one per day, 30-day retention).
  try {
    await autoBackupIfNeeded();
  } catch (e) {
    console.error('Auto-backup failed:', e);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
