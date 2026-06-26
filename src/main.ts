/**
 * voice_claude — Electron + TypeScript
 */
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import * as path from 'path';
import { Pipeline } from './pipeline/pipeline';
import { loadConfig } from './config';

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.on('second-instance', () => {
  if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

// 代理 — Chromium Web Speech 需要翻墙
app.commandLine.appendSwitch('proxy-server', 'http://127.0.0.1:7890');
app.commandLine.appendSwitch('ignore-certificate-errors');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pipeline: Pipeline | null = null;

function icon(color: string) {
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer.html'));
  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow?.hide(); }
  });
}

function createTray() {
  tray = new Tray(icon('#00e676'));
  tray.setToolTip('voice_claude');
  const update = () => {
    const s = pipeline?.stats();
    tray?.setContextMenu(Menu.buildFromTemplate([
      { label: `📋 收${s?.collected||0} 增${s?.enhanced||0} 发${s?.delivered||0}`, enabled: false },
      { type: 'separator' },
      { label: '🖥 显示面板', click: () => mainWindow?.show() },
      { label: '❌ 退出', click: () => { isQuitting = true; pipeline?.stop(); app.quit(); } },
    ]));
  };
  setInterval(update, 3000);
  tray.on('click', () => mainWindow?.isVisible() ? mainWindow?.hide() : mainWindow?.show());
}

// IPC: 渲染进程 → 主进程 文字投喂
ipcMain.handle('voice:text', async (_e, text: string) => {
  pipeline?.feed(text);
});

app.whenReady().then(() => {
  const config = loadConfig();
  pipeline = new Pipeline(config);
  pipeline.start();
  createWindow();
  createTray();
  mainWindow?.show();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; pipeline?.stop(); });
