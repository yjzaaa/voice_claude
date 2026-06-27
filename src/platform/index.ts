/**
 * Cross-platform abstraction for window management and keyboard simulation.
 *
 * Platform        Window ID      Key implementation
<<<<<<< HEAD
 * ────────        ─────────      ─────────────────
=======
 * --------        ---------      -----------------
>>>>>>> cross-platform
 * win32           HWND (number)  Python ctypes / koffi keybd_event
 * darwin          PID  (number)  osascript (AppleScript)
 * linux           X11 ID (number) xdotool
 */

<<<<<<< HEAD
// ── Types ──────────────────────────────────────────────────────
=======
// -- Types ------------------------------------------------------------------
>>>>>>> cross-platform

export interface WindowInfo {
  hwnd: number;
  title: string;
}

export interface WatchEvent {
  event: 'create' | 'destroy';
  hwnd: number;
  title: string;
}

export interface WatchHandle {
  /** Stop watching. Idempotent. */
  stop(): void;
}

export interface Platform {
  /** List all relevant windows (Claude Code instances, terminals). */
  findWindows(): WindowInfo[];

  /** Bring the identified window to the foreground. */
  focusWindow(hwnd: number): void;

  /** Close the identified window gracefully. */
  closeWindow(hwnd: number): void;

  /** Subscribe to window creation / destruction events. */
  watchWindows(callback: (e: WatchEvent) => void): WatchHandle;

  /** Simulate keyboard chords (e.g. "ctrl", "v", "enter"). */
  sendKeys(...keys: string[]): void;

  /**
   * Launch a terminal emulator with the given window title.
   * Returns the numeric window identifier of the new window,
   * or null if the launch failed or timed out.
   */
  launchTerminal(title: string): number | null;

  /** Return the numeric identifier of the currently active window, or null. */
  getActiveWindow(): number | null;
}

<<<<<<< HEAD
// ── Factory ────────────────────────────────────────────────────
=======
// -- Factory ------------------------------------------------------------------
>>>>>>> cross-platform

let _platform: Platform | null = null;

/**
 * Auto-detect the current platform and return the matching
 * Platform implementation. The result is cached after the
 * first call.
 */
export function createPlatform(): Platform {
  if (_platform) return _platform;

  switch (process.platform) {
    case 'win32': {
      const { Win32Platform } = require('./win32');
      _platform = new Win32Platform();
      break;
    }
    case 'darwin': {
      const { DarwinPlatform } = require('./darwin');
      _platform = new DarwinPlatform();
      break;
    }
    case 'linux': {
      const { LinuxPlatform } = require('./linux');
      _platform = new LinuxPlatform();
      break;
    }
    default:
<<<<<<< HEAD
      // 默认回退 Win32
      const { Win32Platform: FallbackPlatform } = require('./win32');
      _platform = new FallbackPlatform();
=======
      throw new Error(`Unsupported platform: ${process.platform}`);
>>>>>>> cross-platform
  }

  return _platform!;
}
