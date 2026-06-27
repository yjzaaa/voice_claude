/**
 * Win32 Platform implementation
 *
 * Wraps existing Python ctypes scripts and koffi keybd_event behind
 * the Platform interface.
 */
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import { Platform, WindowInfo, WatchEvent, WatchHandle } from './index';

const PY = 'D:/autoclaw/resources/python/python.exe';
const ROOT = path.join(__dirname, '..', '..', '..');
const FIND_WIN = path.join(ROOT, 'find_win.py');
const FOCUS_WIN = path.join(ROOT, 'focus_win.py');
const KILL_WIN = path.join(ROOT, 'kill_win.py');
const WATCH_WIN = path.join(ROOT, 'watch_win.py');

function sleep(ms: number) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

export class Win32Platform implements Platform {
  private kb: ReturnType<typeof loadKb> | null = null;

  private ensureKb() {
    if (!this.kb) {
      this.kb = loadKb();
    }
    return this.kb;
  }


  findWindows(): WindowInfo[] {
    try {
      const r = execSync(`"${PY}" "${FIND_WIN}"`, {
        timeout: 3000,
        encoding: 'utf-8',
      }).trim();
      if (!r) return [];
      return r.split('\n')
        .map((line) => {
          const [hwndStr, ...tp] = line.split('|');
          const hwnd = parseInt(hwndStr, 10);
          return hwnd ? { hwnd, title: tp.join('|') } : null;
        })
        .filter((w): w is WindowInfo => w !== null);
    } catch {
      return [];
    }
  }


  focusWindow(hwnd: number): void {
    try {
      execSync(`"${PY}" "${FOCUS_WIN}" ${hwnd}`, { timeout: 2000 });
    } catch {
      /* best-effort */
    }
  }


  closeWindow(hwnd: number): void {
    try {
      execSync(`"${PY}" "${KILL_WIN}" ${hwnd}`, { timeout: 2000 });
    } catch {
      /* best-effort */
    }
  }


  watchWindows(callback: (e: WatchEvent) => void): WatchHandle {
    const p = spawn(PY, [WATCH_WIN], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const handler = (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const l of lines) {
        try {
          callback(JSON.parse(l));
        } catch {
          /* skip malformed lines */
        }
      }
    };
    p.stdout?.on('data', handler);
    p.stderr?.on('data', handler);

    let killed = false;
    return {
      stop: () => {
        if (killed) return;
        killed = true;
        try { p.kill(); } catch { /* already dead */ }
      },
    };
  }


  sendKeys(...keys: string[]): void {
    const kb = this.ensureKb();
    const keyMap: Record<string, number> = {
      ctrl: 0x11,
      v: 0x56,
      enter: 0x0d,
      shift: 0x10,
      alt: 0x12,
      tab: 0x09,
      escape: 0x1b,
      backspace: 0x08,
      up: 0x26,
      down: 0x28,
      left: 0x25,
      right: 0x27,
      space: 0x20,
    };

    const codes = keys
      .map((k) => keyMap[k.toLowerCase()])
      .filter((v): v is number => v !== undefined);

    if (codes.length === 0) return;

    // Press all in order
    for (const c of codes) {
      kb(c, 0, 0, 0);
      sleep(50);
    }
    sleep(80);
    // Release in reverse order
    for (const c of [...codes].reverse()) {
      kb(c, 0, 2, 0);
      sleep(50);
    }
  }


  launchTerminal(title: string): number | null {
    const before = new Set(this.findWindows().map((w) => w.hwnd));
    spawn('wt.exe', ['--title', title, 'cmd', '/c', 'claude'], {
      detached: true,
      stdio: 'ignore',
    });

    for (let i = 0; i < 20; i++) {
      sleep(500);
      const after = this.findWindows();
      for (const w of after) {
        if (!before.has(w.hwnd)) return w.hwnd;
      }
    }
    return null;
  }


  getActiveWindow(): number | null {
    try {
      const r = execSync(
        `"${PY}" -c "import ctypes;h=ctypes.windll.user32.GetForegroundWindow();print(h)"`,
        { timeout: 1000, encoding: 'utf-8' },
      ).trim();
      const hwnd = parseInt(r, 10);
      return Number.isFinite(hwnd) ? hwnd : null;
    } catch {
      return null;
    }
  }
}


function loadKb() {
  const koffi = require('koffi');
  return koffi
    .load('user32.dll')
    .func('void keybd_event(uchar vk, uchar scan, int flags, size_t extra)');
}
