/**
 * macOS Platform -- Stub implementation
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
    // Escape single quotes inside the script for shell safety
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
  // -- Window discovery -------------------------------------------------------

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

  // -- Window focusing --------------------------------------------------------

  focusWindow(hwnd: number): void {
    osa(
      'tell application "System Events"\n' +
      `  set frontmost of (first process whose unix id is ${hwnd}) to true\n` +
      'end tell',
    );
  }

  // -- Window closing ---------------------------------------------------------

  closeWindow(hwnd: number): void {
    osa(
      'tell application "System Events"\n' +
      `  tell (first process whose unix id is ${hwnd})\n` +
      `    if exists window 1 then click (first button of window 1 whose subrole is "AXCloseButton")\n` +
      '  end tell\n' +
      'end tell',
    );
  }

  // -- Window watching (poll-based) -------------------------------------------

  watchWindows(callback: (e: WatchEvent) => void): WatchHandle {
    let stopped = false;
    let prev = new Set<number>();

    const poll = () => {
      if (stopped) return;
      try {
        const current = this.findWindows();
        const currSet = new Set(current.map((w) => w.hwnd));

        // Detect new windows
        for (const w of current) {
          if (!prev.has(w.hwnd)) {
            callback({ event: 'create', hwnd: w.hwnd, title: w.title });
          }
        }
        // Detect removed windows
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

  // -- Keyboard simulation (via osascript) ------------------------------------

  sendKeys(...keys: string[]): void {
    if (keys.length === 0) return;

    // Map sequential keys to AppleScript keystroke names
    const mapKey = (k: string): string | null => {
      switch (k.toLowerCase()) {
        case 'ctrl':  return null; // modifier, handled via 'using'
        case 'v':     return 'v';
        case 'enter': return 'return';
        case 'escape': return 'escape';
        case 'tab':   return 'tab';
        case 'space': return 'space';
        case 'backspace': return 'delete';
        case 'up':    return 'up';
        case 'down':  return 'down';
        case 'left':  return 'left';
        case 'right': return 'right';
        default:      return k;
      }
    };

    // Collect modifiers from leading key names
    const modifiers: string[] = [];
    const textKeys: string[] = [];
    for (const k of keys) {
      const lower = k.toLowerCase();
      if (lower === 'ctrl') {
        modifiers.push('command down'); // typical Ctrl -> Cmd mapping in stub
      } else if (lower === 'shift') {
        modifiers.push('shift down');
      } else if (lower === 'alt') {
        modifiers.push('option down');
      } else if (lower === 'meta') {
        modifiers.push('command down');
      } else {
        textKeys.push(k);
        break;
      }
    }

    if (textKeys.length === 0) return;

    const first = mapKey(textKeys[0]);
    if (!first) return;

    const modPart = modifiers.length > 0
      ? ` using {${modifiers.join(', ')}}`
      : '';

    // First key with modifiers
    osa(`tell application "System Events" to keystroke "${first}"${modPart}`);

    // Remaining keys (sequential, no modifiers)
    for (let i = 1; i < textKeys.length; i++) {
      const k = mapKey(textKeys[i]);
      if (k) {
        osa(`tell application "System Events" to keystroke "${k}"`);
      }
    }
  }

  // -- Terminal launcher ------------------------------------------------------

  launchTerminal(title: string): number | null {
    const before = new Set(this.findWindows().map((w) => w.hwnd));
    osa([
      'tell application "Terminal"',
      '  activate',
      `  set custom title of front window to "${title.replace(/"/g, '\\"')}"`,
      'end tell',
    ].join('\n'));

    // Poll for new PID
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

  // -- Foreground window ----------------------------------------------------

  getActiveWindow(): number | null {
    const script = [
      'tell application "System Events"',
      '  set activeProc to first process whose frontmost is true',
      '  return unix id of activeProc',
      'end tell',
    ].join('\n');
    const raw = osa(script);
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  }
}
