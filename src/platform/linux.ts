/**
 * Linux Platform -- Stub implementation
 *
 * Uses xdotool (X11) for window management and keyboard simulation.
 *
 * NOTE: This is a best-effort stub.  It compiles and follows the
 * Platform contract but has NOT been tested on Linux.
 */
import { execSync, spawn } from 'child_process';
import { Platform, WindowInfo, WatchEvent, WatchHandle } from './index';

/** Run a command, return stdout or '' on failure. */
function run(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 5000, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

export class LinuxPlatform implements Platform {
  // -- Window discovery -------------------------------------------------------

  findWindows(): WindowInfo[] {
    const raw = run('xdotool search --name "claude" 2>/dev/null');
    if (!raw) return [];

    const ids = raw.split('\n').filter(Boolean);
    return ids
      .map((idStr) => {
        const hwnd = parseInt(idStr, 10);
        if (!Number.isFinite(hwnd)) return null;
        const title = run(`xdotool getwindowname ${hwnd} 2>/dev/null`);
        return { hwnd, title: title || `Window ${hwnd}` };
      })
      .filter((w): w is WindowInfo => w !== null);
  }

  // -- Window focusing --------------------------------------------------------

  focusWindow(hwnd: number): void {
    run(`xdotool windowactivate ${hwnd} 2>/dev/null`);
  }

  // -- Window closing ---------------------------------------------------------

  closeWindow(hwnd: number): void {
    run(`xdotool windowclose ${hwnd} 2>/dev/null`);
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

  // -- Keyboard simulation (via xdotool) --------------------------------------

  sendKeys(...keys: string[]): void {
    if (keys.length === 0) return;

    const xdotoolKeys = keys
      .map((k) => {
        switch (k.toLowerCase()) {
          case 'ctrl':    return 'ctrl';
          case 'shift':   return 'shift';
          case 'alt':     return 'alt';
          case 'v':       return 'v';
          case 'enter':   return 'Return';
          case 'escape':  return 'Escape';
          case 'tab':     return 'Tab';
          case 'space':   return 'space';
          case 'backspace': return 'BackSpace';
          case 'up':      return 'Up';
          case 'down':    return 'Down';
          case 'left':    return 'Left';
          case 'right':   return 'Right';
          default:        return k;
        }
      })
      .join('+'); // xdotool chords with '+'

    run(`xdotool key ${xdotoolKeys} 2>/dev/null`);
  }

  // -- Terminal launcher ------------------------------------------------------

  launchTerminal(title: string): number | null {
    const before = new Set(this.findWindows().map((w) => w.hwnd));

    // Try common terminal emulators; fall back to xterm
    const commands = [
      `gnome-terminal --title="${title.replace(/"/g, '\\"')}" -- bash -c claude`,
      `konsole --title "${title.replace(/"/g, '\\"')}" -e claude`,
      `xterm -title "${title.replace(/"/g, '\\"')}" -e claude`,
    ];

    for (const cmd of commands) {
      try {
        spawn(cmd, { shell: true, detached: true, stdio: 'ignore' });
        break;
      } catch {
        continue;
      }
    }

    // Poll for new window
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

  // -- Foreground window (via xdotool) ----------------------------------------

  getActiveWindow(): number | null {
    const raw = run('xdotool getactivewindow 2>/dev/null');
    const hwnd = parseInt(raw, 10);
    return Number.isFinite(hwnd) ? hwnd : null;
  }
}
