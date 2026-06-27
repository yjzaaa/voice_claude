/**
 * voice_claude — Electron + Vosk ASR + 路由
 * Uses the cross-platform Platform abstraction for window ops.
 */

// electron-reload: 开发模式自动重载（文件变化时重启 Electron）
try { require('electron-reload')(__dirname, { electron: require('electron') }); } catch {}

import { app, BrowserWindow, Tray, clipboard, nativeImage, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { createPlatform } from './platform';
import { InstanceRegistry } from './instance/registry';
import { Router } from './instance/router';
import { logger } from './logger';
import { transcribe } from './asr';
import { start as startVosk, isModelAvailable as isVoskModelAvailable } from './asr/vosk';

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
  // ASR fallback endpoint — receive PCM audio, return recognized text (Doubao)
  if (req.method === 'POST' && req.url === '/asr') {
    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', async () => {
      try {
        logger.info('asr', 'PCM fallback', { bytes: chunks.reduce((s, c) => s + c.length, 0) });
        const audio = Buffer.concat(chunks);
        const text = await transcribe(audio, { sampleRate: 16000 });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: text || '', ok: !!text }));
      } catch (e: any) {
        logger.error('asr', 'fallback error', { message: e.message });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: '', ok: false }));
      }
    });
    return;
  }
  // Serve Vosk model files for vosk-browser (WASM)
  if (req.method === 'GET' && req.url?.startsWith('/model/')) {
    const modelFile = path.join(__dirname, '..', 'models', decodeURIComponent(req.url.slice(7)));
    if (fs.existsSync(modelFile)) {
      res.writeHead(200, { 'Content-Type': 'application/gzip' });
      res.end(fs.readFileSync(modelFile));
    } else {
      res.writeHead(404); res.end('Model not found');
    }
    return;
  }
  res.writeHead(404); res.end();
}).listen(9877, '127.0.0.1', () => {
  logger.info('http', '启动', { port: 9877 });
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

  // Start Vosk ASR as primary recognition (hidden BrowserWindow with vosk-browser WASM)
  if (isVoskModelAvailable()) {
    logger.info('vosk', 'starting Vosk ASR');
    startVosk((text: string) => {
      logger.info('vosk', 'recognized', { text: text.slice(0, 60) });
      deliver(text);
    });
  } else {
    logger.info('vosk', 'model not found — Vosk ASR disabled');
    logger.info('vosk', 'place vosk-model-small-cn-0.22.tar.gz in models/ directory');
  }
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; watcher.stop(); });
