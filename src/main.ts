/**
 * voice_claude — Electron + Vosk ASR + 路由
 * Uses the cross-platform Platform abstraction for window ops.
 */

// electron-reload: 开发模式自动重载（文件变化时重启 Electron）
try { require('electron-reload')(__dirname, { electron: require('electron') }); } catch {}

import { app, BrowserWindow, Tray, screen, clipboard, nativeImage, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { createPlatform } from './platform';
import { InstanceRegistry } from './instance/registry';
import { Router } from './instance/router';
import { logger } from './logger';
import { transcribe } from './asr';
import { initRecorder, toggleRecording, isRecorderRecording } from './asr/recorder';

const log = (cmp: string, msg: string, extra?: any) => logger.info(cmp, msg, extra);

if (!app.requestSingleInstanceLock()) { process.exit(0); }

const platform = createPlatform();
const slp = (ms: number) => new Promise(r => setTimeout(r, ms));

// 实例 + 路由
const reg = new InstanceRegistry(platform);
const router = new Router(reg);

async function deliver(text: string): Promise<string> {
  if (!text) return 'empty';
  logger.info('delivery', 'start', { text: text.slice(0, 60) });
  try {
    const { inst, reason } = await router.resolve(text);
    if (router.isCmd) {
      if (inst) { platform.focusWindow(inst.hwnd); }
      logger.info('delivery', 'command resolved', { reason });
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
    logger.info('delivery', 'success', { target: inst?.name || 'foreground', ms });
    return inst?.name || '前台';
  } catch (err: any) {
    logger.error('delivery', 'failed', { error: err.message });
    return 'error';
  }
}

// HTTP
const isDev = !app.isPackaged;
const statusUrl = isDev
  ? 'http://localhost:5173/status.html'
  : path.join(__dirname, 'renderer', 'status.html');
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'html', 'speech.html'), 'utf-8');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const t0 = Date.now();
  if (req.method === 'GET' && req.url === '/status') {
    const ws = reg.list().map(i => `${i.name}: ${i.title.slice(0, 30)}`).join(', ');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ target: router.target || 'terminal', count: reg.list().length, windows: ws }));
    return;
  }
  if (req.method === 'GET' && (req.url || '').startsWith('/fixtures')) {
    const fixtureDir = path.join(__dirname, '..', 'test', 'asr', 'fixtures');
    try { fs.mkdirSync(fixtureDir, { recursive: true }); } catch {}
    const files = fs.readdirSync(fixtureDir).filter(f=>f.endsWith('.pcm')).map(f=>{
      const name=f.replace('.pcm','');
      const txtPath=path.join(fixtureDir,name+'.txt');
      const txt=fs.existsSync(txtPath)?fs.readFileSync(txtPath,'utf-8').trim():'';
      return {name,size:fs.statSync(path.join(fixtureDir,f)).size,text:txt};
    });
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({files}));return;
  }
  if (req.method === 'GET' && (req.url || '').startsWith('/fixture-info')) {
    const q=new URL(req.url||'/','http://localhost').searchParams;
    const name=q.get('name')||'';
    const txtPath=path.join(__dirname,'..','test','asr','fixtures',name+'.txt');
    const pcmPath=path.join(__dirname,'..','test','asr','fixtures',name+'.pcm');
    const text=fs.existsSync(txtPath)?fs.readFileSync(txtPath,'utf-8').trim():'';
    const size=fs.existsSync(pcmPath)?fs.statSync(pcmPath).size:0;
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({name,text,size}));return;
  }
  if (req.method === 'GET' && req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logger.metricsJSON()));
    return;
  }
  if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  // 保存录音文件到 fixtures
  if (req.method === 'POST' && (req.url || '').startsWith('/save-fixture')) {
    const q = new URL(req.url || '/', 'http://localhost').searchParams;
    const name = (q.get('name') || 'recording').replace(/[^a-zA-Z0-9_-]/g,'_');
    const expectedText = q.get('text') || '';
    const buf: Buffer[] = [];
    req.on('data', d => buf.push(d as Buffer));
    req.on('end', () => {
      const data = Buffer.concat(buf);
      const fixtureDir = path.join(__dirname, '..', 'test', 'asr', 'fixtures');
      try { fs.mkdirSync(fixtureDir, { recursive: true }); } catch {}
      try {
        fs.writeFileSync(path.join(fixtureDir, name + '.pcm'), data);
        if (expectedText) fs.writeFileSync(path.join(fixtureDir, name + '.txt'), expectedText, 'utf-8');
        logger.info('http', 'fixture保存', { name, size: data.length, text: expectedText.slice(0,30) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name, size: data.length }));
      } catch(e: any) {
        res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
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
let tray: Tray | null = null;

app.whenReady().then(() => {
  logger.info('app', 'ready');
  win = new BrowserWindow({
    width: 320,
    height: 160,
    x: screen.getPrimaryDisplay().workAreaSize.width - 340,
    y: screen.getPrimaryDisplay().workAreaSize.height - 180,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  if (typeof statusUrl === 'string' && statusUrl.startsWith('http')) {
    win.loadURL(statusUrl);
  } else {
    win.loadFile(statusUrl);
  }
  win.on('close', e => { if (!isQuitting) { e.preventDefault(); win?.hide(); } });
  tray = new Tray(icon(isRecorderRecording() ? '#e94560' : '#00e676'));
  tray.setToolTip('voice_claude - 点击切换录音');
  tray.on('click', () => toggleRecording());
  win.show();

  // Init Doubao voice recorder (hidden window)
  initRecorder({
    onPcm: async (pcm: Buffer) => {
      logger.info('asr', 'doubao transcribe started', { bytes: pcm.length });
      try {
        const text = await transcribe(pcm, { sampleRate: 16000 });
        if (text) {
          logger.info('asr', 'doubao transcribe success', { text: text.slice(0, 60) });
          deliver(text);
        } else {
          logger.warn('asr', 'doubao transcribe returned empty');
        }
      } catch (err: any) {
        logger.error('asr', 'doubao transcribe failed', { error: err.message });
      }
    },
    onStateChange: (recording: boolean) => {
      logger.info('app', 'recording state broadcast', { recording });
      win?.webContents.send('status:state', recording);
      tray?.setImage(icon(recording ? '#e94560' : '#00e676'));
      tray?.setToolTip(recording ? 'voice_claude - 录音中，点击停止' : 'voice_claude - 点击开始录音');
    },
  });

  // Status window button toggles recording
  ipcMain.on('status:toggle', () => {
    logger.info('app', 'status toggle received');
    toggleRecording();
  });

  // Renderer log bridge
  ipcMain.on('renderer:log', (_event, level: string, cmp: string, msg: string, extra?: any) => {
    if (level === 'error') logger.error(cmp, msg, extra);
    else if (level === 'warn') logger.warn(cmp, msg, extra);
    else logger.info(cmp, msg, extra);
  });
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; watcher.stop(); });
