import * as path from 'path';
import {
  WindowEvent,
  WindowInfo,
  WindowManager,
  WindowRole,
} from '../../../ports/incoming/WindowManager';

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
        .map((line) => this.parseWindowLine(line))
        .filter((w): w is WindowInfo => w !== null);
    } catch {
      return [];
    }
  }

  private parseWindowLine(line: string): WindowInfo | null {
    const [idStr, title, processName, iconPath] = line.split('|');
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return null;
    const role = inferWindowRole(title, processName);
    return {
      id,
      title: title ?? '',
      processName: processName || inferProcessName(title),
      appName: processName || inferProcessName(title),
      iconPath: iconPath || null,
      role,
    };
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

function inferProcessName(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('claude')) return 'claude';
  if (t.includes('code')) return 'code';
  if (t.includes('cursor')) return 'cursor';
  if (t.includes('terminal') || t.includes('cmd') || t.includes('powershell')) return 'terminal';
  return '';
}

export function inferWindowRole(title?: string, processName?: string): WindowRole {
  const t = (title ?? '').toLowerCase();
  const p = (processName ?? '').toLowerCase();

  if (t.includes('claude') || p.includes('claude')) return 'assistant';
  if (p.includes('code') || p.includes('cursor') || t.includes('visual studio code'))
    return 'editor';
  if (p.includes('wt') || p.includes('terminal') || p.includes('cmd') || p.includes('powershell')) {
    return 'terminal';
  }
  if (
    p.includes('chrome') ||
    p.includes('edge') ||
    p.includes('firefox') ||
    p.includes('browser')
  ) {
    return 'browser';
  }
  if (p.includes('explorer') || t.includes('文件资源管理器')) return 'file_manager';
  if (p.includes('wechat') || p.includes('slack') || p.includes('teams') || t.includes('微信')) {
    return 'chat';
  }
  return 'unknown';
}
