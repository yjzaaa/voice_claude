/**
 * Darwin (macOS) Platform implementation
 *
 * Uses osascript (AppleScript) for window management and keyboard
 * simulation on macOS.  Window identifiers are UNIX PIDs.
 *
 * NOTE: This is a best-effort stub.  It compiles and follows the
 * Platform contract but has NOT been tested on macOS.
 */
import { execSync } from 'child_process';
import { Platform, WindowInfo, WatchEvent, WatchHandle } from './index';

/** Run an osascript snippet and return stdout. */
function osa(script: string): string {
  try {
    const safe = script.replace(/'/g, "'\\''");
    return execSync(`osascript -e '${safe}'`, {
      timeout: 5000,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return '';
  }
}

export class DarwinPlatform implements Platform {
  findWindows(): WindowInfo[] {
    const script = [
      'tell application "System Events"',
      '  set output to ""',
      '  repeat with proc in every process whose background only is false',
      '    try',
      '      set procName to name of proc',
      '      set unixPid to unix id of proc',
      '      repeat with win in every window of proc',
      '        set winTitle to title of win',
      '        if winTitle contains "claude" or winTitle contains "Terminal" or procName contains "Terminal" then',
      '          set output to output & (unixPid as text) & "|" & winTitle & linefeed',
      '        end if',
      '      end repeat',
      '    end try',
      '  end repeat',
      '  return output',
      'end tell',
    ].join('\n');

    const raw = osa(script);
    if (!raw) return [];

    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [pidStr, ...tp] = line.split('|');
        const hwnd = parseInt(pidStr, 10);
        return Number.isFinite(hwnd) ? { hwnd, title: tp.join('|') } : null;
      })
      .filter((w): w is WindowInfo => w !== null);
  }

  focusWindow(hwnd: number): void {
    osa(`tell application "System Events" to set frontmost of first process whose unix id is ${hwnd} to true`);
  }

  closeWindow(hwnd: number): void {
    osa(`tell application "System Events" to tell first process whose unix id is ${hwnd} to quit`);
  }

  watchWindows(callback: (e: WatchEvent) => void): WatchHandle {
    let stopped = false;
    let prev = new Set<number>();

    const poll = () => {
      if (stopped) return;
      try {
        const current = this.findWindows();
        const currSet = new Set(current.map((w) => w.hwnd));

        for (const w of current) {
          if (!prev.has(w.hwnd)) {
            callback({ event: 'create', hwnd: w.hwnd, title: w.title });
          }
        }
        for (const h of prev) {
          if (!currSet.has(h)) {
            callback({ event: 'destroy', hwnd: h, title: '' });
          }
        }

        prev = currSet;
      } catch {
        /* swallow poll errors */
      }
      if (!stopped) setTimeout(poll, 1000);
    };

    poll();

    return { stop: () => { stopped = true; } };
  }

  sendKeys(...keys: string[]): void {
    if (keys.length === 0) return;

    const keyMap: Record<string, string> = {
      ctrl: 'command down',  // macOS uses Cmd instead of Ctrl
      v: 'v',
      enter: 'return',
      shift: 'shift down',
      alt: 'option down',
      tab: 'tab',
    };

    const mapped = keys.map(k => keyMap[k.toLowerCase()] || k).join(' ');
    osa(`tell application "System Events" to keystroke "${mapped}"`);
  }

  launchTerminal(title: string): number | null {
    const before = new Set(this.findWindows().map((w) => w.hwnd));
    osa(`tell application "Terminal" to do script "claude"`);

    for (let i = 0; i < 20; i++) {
      const deadline = Date.now() + 500;
      while (Date.now() < deadline) { /* spin */ }
      const after = this.findWindows();
      for (const w of after) {
        if (!before.has(w.hwnd)) return w.hwnd;
      }
    }
    return null;
  }

  getActiveWindow(): number | null {
    const raw = osa([
      'tell application "System Events"',
      '  set activeProc to first process whose frontmost is true',
      '  return unix id of activeProc',
      'end tell',
    ].join('\n'));
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  }
}
