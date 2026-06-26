/**
 * 实例注册表 — Claude Code 窗口生命周期
 */
import { findClaudeWindows, getForegroundHwnd, launchClaudeCode } from '../win32/win32';

export interface Instance {
  hwnd: number; title: string; kind: string; name: string;
}

export class InstanceRegistry {
  private instances: Map<string, Instance> = new Map();
  private hwndName: Map<number, string> = new Map();

  scan(): Instance[] {
    const found = findClaudeWindows();
    const seen = new Set<number>();

    for (const { hwnd, title, kind } of found) {
      seen.add(hwnd);
      if (!this.hwndName.has(hwnd)) {
        const name = this.genName(kind);
        const inst: Instance = { hwnd, title, kind, name };
        this.instances.set(name, inst);
        this.hwndName.set(hwnd, name);
      } else {
        const name = this.hwndName.get(hwnd)!;
        this.instances.get(name)!.title = title;
      }
    }

    // 清理 dead
    for (const [hwnd, name] of this.hwndName) {
      if (!seen.has(hwnd)) {
        this.instances.delete(name);
        this.hwndName.delete(hwnd);
      }
    }
    return this.list();
  }

  getActive(): Instance | null {
    const fg = getForegroundHwnd();
    if (fg && this.hwndName.has(fg)) {
      return this.instances.get(this.hwndName.get(fg)!) || null;
    }
    return null;
  }

  get(name: string): Instance | null { return this.instances.get(name) || null; }
  list(): Instance[] { return [...this.instances.values()]; }

  create(title = '🎤 voice_claude'): Instance | null {
    const hwnd = launchClaudeCode(title);
    if (!hwnd) return null;
    this.scan();
    const name = this.hwndName.get(hwnd);
    return name ? this.instances.get(name) || null : null;
  }

  private genName(kind: string): string {
    const prefix = kind === 'claude_terminal' ? 'terminal' : 'chat';
    for (let i = 1; i < 99; i++) {
      const n = i === 1 ? prefix : `${prefix}-${i}`;
      if (!this.instances.has(n)) return n;
    }
    return `${prefix}-${this.instances.size + 1}`;
  }
}
