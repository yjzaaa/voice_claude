/**
 * voice_claude — Electron 桌面版 (TypeScript)
 */
import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function makeIcon(color: string) {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${color}"/></svg>`
    )}`
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400, height: 340, frame: false, transparent: true,
    resizable: false, skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'dist', 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow?.hide(); }
  });
}

function createTray() {
  tray = new Tray(makeIcon('#00e676'));
  tray.setToolTip('voice_claude');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '🖥 显示', click: () => mainWindow?.show() },
    { label: '💬 打开桥接', click: () => shell.openExternal('http://127.0.0.1:9877') },
    { type: 'separator' },
    { label: '❌ 退出', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => mainWindow?.isVisible() ? mainWindow?.hide() : mainWindow?.show());
}

app.whenReady().then(() => {
  createWindow(); createTray(); mainWindow?.show();
});
app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; });
