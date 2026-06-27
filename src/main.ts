/**
 * voice_claude — Electron + Chrome App + 路由
 * Uses the cross-platform Platform abstraction for window ops.
 */
import { app, BrowserWindow, Tray, clipboard, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { exec } from 'child_process';
import { createPlatform } from './platform';
import { InstanceRegistry } from './instance/registry';
import { Router } from './instance/router';
import { logger } from './logger';

const log = (cmp: string, msg: string, extra?: any) => logger.info(cmp, msg, extra);

if (!app.requestSingleInstanceLock()) { process.exit(0); }

const platform = createPlatform();
const slp = (ms: number) => new Promise(r => setTimeout(r, ms));

// 实例 + 路由
const reg = new InstanceRegistry(platform);
const router = new Router(reg);

async function deliver(text: string): Promise<string> {
  if (!text) return 'empty';
  const { inst, reason } = await router.resolve(text);
  if (router.isCmd) {
    if (inst) { platform.focusWindow(inst.hwnd); }
    return reason;
  }

  const start = Date.now();
  clipboard.writeText(text);
  if (inst) { platform.focusWindow(inst.hwnd); }
  await slp(150);
  platform.sendKeys('ctrl', 'v');
  await slp(200);
  platform.sendKeys('enter');
  const ms = Date.now() - start;
  logger.delivery(inst?.name || 'foreground', text, ms);
  return inst?.name || '前台';
}

// HTTP
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'speech.html'), 'utf-8');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const t0 = Date.now();
  if (req.method === 'GET' && req.url === '/status') {
    const ws = reg.list().map(i => `${i.name}: ${i.title.slice(0, 30)}`).join(', ');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ target: router.target || 'terminal', count: reg.list().length, windows: ws }));
    return;
  }
  if (req.method === 'GET' && req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logger.metricsJSON()));
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
  logger.info('http', '启动', { port: 9877 });
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const chrome2 = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
  const url = 'http://127.0.0.1:9877';
  exec(`"${chrome}" --proxy-server=http://127.0.0.1:7890 --proxy-bypass-list="127.0.0.1;localhost" --app=${url}`);
});

// Window discovery + live monitoring
reg.scan();
const watcher = reg.watch(e => { log('window', `${e.event}: ${e.title.slice(0, 30)}`); reg.scan(); });

function icon(c: string) { return nativeImage.createFromDataURL(`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${c}"/></svg>`)}`); }

let win: BrowserWindow | null = null, isQuitting = false;

app.whenReady().then(() => {
  logger.info('app', 'ready');
  win = new BrowserWindow({ width: 400, height: 200, frame: false, transparent: true, resizable: false });
  win.loadFile(path.join(__dirname, '..', 'status.html'));
  win.on('close', e => { if (!isQuitting) { e.preventDefault(); win?.hide(); } });
  new Tray(icon('#00e676')).on('click', () => win?.isVisible() ? win?.hide() : win?.show());
  win.show();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; watcher.stop(); });
