import { app, BrowserWindow, Tray, clipboard, shell, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

const LOG = path.join(__dirname, '..', 'voice.log');
function log(...args: any[]) { const m=args.join(' '); console.log(m); fs.appendFileSync(LOG, m+'\n'); }

if (!app.requestSingleInstanceLock()) { process.exit(0); }

const koffi = require('koffi');
const kb = koffi.load('user32.dll').func('void keybd_event(uchar vk, uchar scan, int flags, size_t extra)');
const V = { CTRL: 0x11, V: 0x56, ENTER: 0x0D, UP: 2 };
const slp = (ms: number) => new Promise(r => setTimeout(r, ms));
async function paste() {
  kb(V.CTRL, 0, 0, 0); await slp(50); kb(V.V, 0, 0, 0); await slp(50);
  kb(V.V, 0, V.UP, 0); await slp(50); kb(V.CTRL, 0, V.UP, 0); await slp(100);
  kb(V.ENTER, 0, 0, 0); await slp(50); kb(V.ENTER, 0, V.UP, 0);
}

const HTML = fs.readFileSync(path.join(__dirname, '..', 'renderer.html'), 'utf-8');
const sent = new Set<string>();

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(HTML); return; }
  if (req.method === 'POST' && req.url === '/send') {
    let body = ''; req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
        if (text && !sent.has(text)) {
          let dup = false; for (const s of sent) { if (s.includes(text) || text.includes(s)) { dup = true; break; } }
          if (!dup) { sent.add(text); log('[voice]', text); clipboard.writeText(text); paste(); }
        }
      } catch (e: any) { log('ERR', e.message); }
      res.writeHead(200); res.end('ok');
    }); return;
  }
  res.writeHead(404); res.end();
}).listen(9877, '0.0.0.0', () => {
  log('HTTP :9877 — 右键托盘打开 Chrome');
  shell.openExternal('http://localhost:9877');
});

function icon(c: string) { return nativeImage.createFromDataURL(`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${c}"/></svg>`)}`); }

let win: BrowserWindow | null = null, isQuitting = false;

app.whenReady().then(() => {
  log('Ready');
  win = new BrowserWindow({ width: 400, height: 200, frame: false, transparent: true, resizable: false });
  win.loadFile(path.join(__dirname, '..', 'status.html'));
  win.on('close', e => { if (!isQuitting) { e.preventDefault(); win?.hide(); } });
  const tray = new Tray(icon('#00e676'));
  tray.setToolTip('voice_claude');
  tray.setContextMenu(require('electron').Menu.buildFromTemplate([
    { label: '🌐 打开语音页面', click: () => shell.openExternal('http://localhost:9877') },
    { label: '❌ 退出', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => win?.isVisible() ? win?.hide() : win?.show());
  win.show();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; log('Quit'); });
