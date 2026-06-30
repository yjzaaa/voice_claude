import * as path from 'path';
import { WindowEvent, WindowInfo, WindowManager } from '../../../ports/incoming/WindowManager';

export interface Win32WindowManagerDeps {
  pythonExecutable: string;
  scriptRoot: string;
  execSync: (command: string, options?: any) => Buffer | string;
  spawn: (
    command: string,
    args: string[],
    options?: any,
  ) => {
    stdout?: { on(event: 'data', cb: (data: Buffer) => void): void };
    stderr?: { on(event: 'data', cb: (data: Buffer) => void): void };
    kill(): void;
  };
}

export class Win32WindowManager implements WindowManager {
  constructor(private deps: Win32WindowManagerDeps) {}

  findWindows(): WindowInfo[] {
    try {
      const script = path.join(this.deps.scriptRoot, 'find_win.py');
      const r = this.deps
        .execSync(`"${this.deps.pythonExecutable}" "${script}"`, {
          timeout: 3000,
          encoding: 'utf-8',
          cwd: this.deps.scriptRoot,
        })
        .toString()
        .trim();
      if (!r) return [];
      return r
        .split('\n')
        .map((line) => {
          const [idStr, ...titleParts] = line.split('|');
          const id = parseInt(idStr, 10);
          return Number.isFinite(id) ? { id, title: titleParts.join('|') } : null;
        })
        .filter((w): w is WindowInfo => w !== null);
    } catch {
      return [];
    }
  }

  async focusWindow(id: number): Promise<void> {
    try {
      const script = path.join(this.deps.scriptRoot, 'focus_win.py');
      this.deps.execSync(`"${this.deps.pythonExecutable}" "${script}" ${id}`, {
        timeout: 2000,
        cwd: this.deps.scriptRoot,
      });
    } catch {
      /* best-effort */
    }
  }

  async closeWindow(id: number): Promise<void> {
    try {
      const script = path.join(this.deps.scriptRoot, 'kill_win.py');
      this.deps.execSync(`"${this.deps.pythonExecutable}" "${script}" ${id}`, {
        timeout: 2000,
        cwd: this.deps.scriptRoot,
      });
    } catch {
      /* best-effort */
    }
  }

  getActiveWindow(): number | null {
    try {
      const r = this.deps
        .execSync(
          `"${this.deps.pythonExecutable}" -c "import ctypes;h=ctypes.windll.user32.GetForegroundWindow();print(h)"`,
          { timeout: 1000, encoding: 'utf-8' },
        )
        .toString()
        .trim();
      const id = parseInt(r, 10);
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  }

  watchEvents(cb: (e: WindowEvent) => void): { stop(): void } {
    const script = path.join(this.deps.scriptRoot, 'watch_win.py');
    const p = this.deps.spawn(this.deps.pythonExecutable, [script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this.deps.scriptRoot,
    });

    let buf = '';
    const handler = (data: Buffer) => {
      buf += data.toString();
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const l of lines) {
        try {
          const parsed = JSON.parse(l);
          cb({
            type: parsed.event,
            id: parsed.hwnd,
            title: parsed.title,
          });
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
        try {
          p.kill();
        } catch {
          /* already dead */
        }
      },
    };
  }
}
