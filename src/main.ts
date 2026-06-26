/**
 * voice_claude — Electron + Chrome App + 路由
 */
import { app, BrowserWindow, Tray, clipboard, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { exec } from 'child_process';
import { InstanceRegistry } from './instance/registry';
import { Router } from './instance/router';

const LOG = path.join(__dirname, '..', 'voice.log');
function log(...args: any[]) { const m=args.join(' '); console.log(m); fs.appendFileSync(LOG, m+'\n'); }

if (!app.requestSingleInstanceLock()) { process.exit(0); }

const koffi = require('koffi');
const kb = koffi.load('user32.dll').func('void keybd_event(uchar vk, uchar scan, int flags, size_t extra)');
const { execSync } = require('child_process');
const PY = 'D:/autoclaw/resources/python/python.exe';
const FOCUS_WIN = path.join(__dirname, '..', 'focus_win.py');

function focusWindow(hwnd: number) {
  try { execSync(`"${PY}" "${FOCUS_WIN}" ${hwnd}`, { timeout: 2000 }); }
  catch {}
}
const slp = (ms: number) => new Promise(r => setTimeout(r, ms));

async function paste() { kb(0x11,0,0,0);await slp(50);kb(0x56,0,0,0);await slp(50);kb(0x56,0,2,0);await slp(50);kb(0x11,0,2,0);await slp(100);kb(0x0D,0,0,0);await slp(50);kb(0x0D,0,2,0); }

// 实例 + 路由
const reg = new InstanceRegistry();
const router = new Router(reg);

async function deliver(text: string): Promise<string> {
  if (!text) return 'empty';
  const { inst, reason } = await router.resolve(text);
  if (router.isCmd) {
    if (inst) { focusWindow(inst.hwnd); }
    return reason;
  }

  log('[voice]→', inst?.name || 'foreground', text.slice(0, 30));
  clipboard.writeText(text);
  if (inst) { await focusWindow(inst.hwnd); }
  await paste();
  return inst?.name || '前台';
}

// HTTP
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'speech.html'), 'utf-8');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET' && req.url === '/status') {
    const ws = reg.list().map(i => `${i.name}: ${i.title.slice(0,30)}`).join(', ');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ target: router.target || 'terminal', count: reg.list().length, windows: ws }));
    return;
  }
  if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  if (req.method === 'POST' && req.url === '/send') {
    let body = ''; req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { text } = JSON.parse(body);
        if (text) {
          const target = await deliver(text);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, target }));
        } else { res.writeHead(200); res.end(JSON.stringify({ ok: false })); }
      } catch { res.writeHead(200); res.end(JSON.stringify({ ok: false })); }
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(9877, '127.0.0.1', () => {
  log('HTTP :9877');
  exec('start chrome --app=http://localhost:9877');
});

// 窗口发现 + 实时监听
reg.scan();
const watcher = reg.watch(e => { log(`🪟 ${e.event}: ${e.title.slice(0, 30)}`); reg.scan(); });

function icon(c: string) { return nativeImage.createFromDataURL(`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${c}"/></svg>`)}`); }

let win: BrowserWindow | null = null, isQuitting = false;

app.whenReady().then(() => {
  log('Ready,', reg.list().length, 'wins,', router.status());
  win = new BrowserWindow({ width: 400, height: 200, frame: false, transparent: true, resizable: false });
  win.loadFile(path.join(__dirname, '..', 'status.html'));
  win.on('close', e => { if (!isQuitting) { e.preventDefault(); win?.hide(); } });
  new Tray(icon('#00e676')).on('click', () => win?.isVisible() ? win?.hide() : win?.show());
  win.show();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; watcher.kill(); });
