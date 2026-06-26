/**
 * voice_claude — Electron + Chrome App 模式
 */
import { app, BrowserWindow, Tray, clipboard, nativeImage, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { exec } from 'child_process';

const LOG = path.join(__dirname, '..', 'voice.log');
function log(...args: any[]) { const m=args.join(' '); console.log(m); fs.appendFileSync(LOG, m+'\n'); }

if (!app.requestSingleInstanceLock()) { process.exit(0); }

// Win32 API
const koffi = require('koffi');
const u32 = koffi.load('user32.dll');
const kb = u32.func('void keybd_event(uchar vk, uchar scan, int flags, size_t extra)');
const setFg = u32.func('bool SetForegroundWindow(long hwnd)');
const showWnd = u32.func('bool ShowWindow(long hwnd, int cmd)');

const slp = (ms: number) => new Promise(r => setTimeout(r, ms));
async function paste() { kb(0x11,0,0,0);await slp(50);kb(0x56,0,0,0);await slp(50);kb(0x56,0,2,0);await slp(50);kb(0x11,0,2,0);await slp(100);kb(0x0D,0,0,0);await slp(50);kb(0x0D,0,2,0); }

function findClaudeHwnd(): number|null {
  try {
    const { execSync } = require('child_process');
    const r = execSync(
      `powershell -NoProfile -Command "$c=Add-Type -Name W -Namespace T -PassThru -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern bool EnumWindows(EnumCB cb,IntPtr l);[DllImport(\\\"user32.dll\\\")]public static extern bool IsWindowVisible(IntPtr h);[DllImport(\\\"user32.dll\\\")]public static extern int GetWindowText(IntPtr h,Text.StringBuilder b,int n);public delegate bool EnumCB(IntPtr h,IntPtr l);';$r=@();$cb={param(\$h,\$l)if(![T.W]::IsWindowVisible(\$h)){return \$true}\$b=New-Object Text.StringBuilder(512);[T.W]::GetWindowText(\$h,\$b,512);\$t=\$b.ToString();if(\$t -match '[✳]|claude'){\$r+=\$h.ToInt64().ToString();return \$false}\$true};[T.W]::EnumWindows(\$cb,[IntPtr]::Zero);\$r[0]"`,
      { timeout: 3000, encoding: 'utf-8' }
    ).trim();
    return r ? parseInt(r) : null;
  } catch { return null; }
}

const sent = new Set<string>();
async function deliver(text: string) {
  if (!text || sent.has(text)) return;
  for (const s of sent) { if (s.includes(text) || text.includes(s)) return; }
  sent.add(text); log('[voice]', text);
  try {
    const hwnd = findClaudeHwnd();
    clipboard.writeText(text);
    if (hwnd) { setFg(hwnd); showWnd(hwnd, 5); }
    await slp(100);
    await paste();
    log('paste ok', hwnd?'(focused)':'(no focus)');
  } catch(e: any) { log('deliver err:', e.message||e); }
}

const PAGE = fs.readFileSync(path.join(__dirname, '..', 'speech.html'), 'utf-8');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  if (req.method === 'POST' && req.url === '/send') {
    let body = ''; req.on('data', d => body += d);
    req.on('end', async () => { try { const { text } = JSON.parse(body); if (text) await deliver(text); } catch {} res.writeHead(200); res.end('ok'); });
    return;
  }
  res.writeHead(404); res.end();
}).listen(9877, '127.0.0.1', () => {
  log('HTTP :9877');
  // Chrome App 模式 — 无标签栏，无地址栏
  exec('start chrome --app=http://localhost:9877');
});

function icon(c: string) { return nativeImage.createFromDataURL(`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="7" fill="${c}"/></svg>`)}`); }

let win: BrowserWindow | null = null, isQuitting = false;

app.whenReady().then(() => {
  log('Ready');
  win = new BrowserWindow({
    width: 400, height: 200, frame: false, transparent: true, resizable: false,
  });
  win.loadFile(path.join(__dirname, '..', 'status.html'));
  win.on('close', e => { if (!isQuitting) { e.preventDefault(); win?.hide(); } });
  new Tray(icon('#00e676')).on('click', () => win?.isVisible() ? win?.hide() : win?.show());
  win.show();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; });
