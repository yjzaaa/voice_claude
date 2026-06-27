/**
 * voice_claude — Electron + Chrome App + 路由
 */
import { app, BrowserWindow, Tray, clipboard, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { exec } from 'child_process';
import { createPlatform } from './platform';
import { InstanceRegistry } from './instance/registry';
import { Router } from './instance/router';
import { transcribe } from './asr';

const LOG = path.join(__dirname, '..', 'voice.log');
function log(...args: any[]) { const m=args.join(' '); console.log(m); fs.appendFileSync(LOG, m+'\n'); }

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

  log('[voice]→', inst?.name || 'foreground', text.slice(0, 30));
  clipboard.writeText(text);
  if (inst) { platform.focusWindow(inst.hwnd); }
  await slp(150);
  platform.sendKeys('ctrl', 'v');
  await slp(200);
  platform.sendKeys('enter');
  return inst?.name || '前台';
}

// HTTP
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'speech.html'), 'utf-8');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const ts = new Date().toISOString().slice(11,23);
  log(ts, req.method, req.url, req.headers['content-type']||'');
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
  // ASR fallback endpoint — 接收 PCM 音频，返回识别文本
  if (req.method === 'POST' && req.url === '/asr') {
    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', async () => {
      try {
        log(`[asr] PCM ${(chunks.reduce((s, c) => s + c.length, 0) / 32000).toFixed(1)}s`);
        const audio = Buffer.concat(chunks);
        const text = await transcribe(audio, { sampleRate: 16000 });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: text || '', ok: !!text }));
      } catch (e: any) {
        log(`[asr] error: ${e.message}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: '', ok: false }));
      }
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(9877, '127.0.0.1', () => {
  log('HTTP :9877');
  const CHROME_PATHS = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  const chromePath = CHROME_PATHS.find(p => fs.existsSync(p));
  const url = 'http://127.0.0.1:9877';
  if (chromePath) {
    exec(`"${chromePath}" --proxy-server=http://127.0.0.1:7890 --proxy-bypass-list="127.0.0.1;localhost" --app=${url}`);
  } else {
    log('[asr] Chrome not found, starting Doubao ASR fallback');
  }
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

  // 如果 Chrome 不可用，启动 Doubao ASR 回退页面
  const hasChrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].some(p => fs.existsSync(p));
  if (!hasChrome) {
    log('[asr] starting Doubao fallback capture page');
    setTimeout(() => {
      const capWin = new BrowserWindow({ width: 1, height: 1, show: false });
      capWin.loadFile(path.join(__dirname, '..', 'capture.html'));
    }, 500);
  }
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; watcher.stop(); });
