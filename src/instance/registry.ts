/**
 * 实例注册表 — 窗口生命周期
 * Uses the cross-platform Platform abstraction instead of direct Python calls.
 */
import { Platform } from '../platform';

export interface WindowSchema {
  labels: string[];       // ["后端", "bug", "数据库"]
  task: string;           // "修复认证bug"
  project: string;        // "voice_claude"
  context: string;        // "正在重构 pipeline"
}
export interface Instance {
  name: string; hwnd: number; title: string; tag: string; alive: boolean;
  schema: WindowSchema;
}

import * as https from 'https';

function defaultSchema(title: string): WindowSchema {
  const m = title.match(/✳\s*(.+)/);
  const task = m ? m[1].trim() : title.slice(0, 40);
  // 异步补全 labels/project (不阻塞)
  const s: WindowSchema = { labels: [], task, project: '', context: '' };
  if (task) {
    const body = JSON.stringify({ model: 'deepseek-chat', messages: [
      { role: 'system', content: '从任务名提取标签。返回JSON: {"labels":["标签1","标签2"],"project":"项目名"}。只返回JSON。' },
      { role: 'user', content: `任务: "${task}"` }
    ], temperature: 0, max_tokens: 80 });
    const req = https.request('https://api.deepseek.com/v1/chat/completions', { method: 'POST', timeout: 4000, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-938dfb4cb1e741ed960e2882da9d2eea' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { const j = JSON.parse(JSON.parse(d).choices[0].message.content); if (j.labels) s.labels = j.labels; if (j.project) s.project = j.project; } catch {}
      });
    });
    req.on('error', () => {}); req.end();
  }
  return s;
}

export class InstanceRegistry {
  private instances = new Map<string, Instance>();
  private hwndName = new Map<number, string>();
  private platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  scan(): Instance[] {
    const windows = this.platform.findWindows();
    const seen = new Set<number>();
    for (const w of windows) {
      seen.add(w.hwnd);
      if (!this.hwndName.has(w.hwnd)) {
        const name = this.genName();
        this.instances.set(name, { name, hwnd: w.hwnd, title: w.title, tag: 'found', alive: true, schema: defaultSchema(w.title) });
        this.hwndName.set(w.hwnd, name);
      } else {
        const inst = this.instances.get(this.hwndName.get(w.hwnd)!);
        if (inst) inst.title = w.title;
      }
    }
    for (const [hwnd, name] of this.hwndName) {
      if (!seen.has(hwnd)) { this.instances.delete(name); this.hwndName.delete(hwnd); }
    }
    return this.list();
  }

  create(title = '🎤 voice_claude'): Instance | null {
    const hwnd = this.platform.launchTerminal(title);
    if (hwnd !== null) {
      this.scan();
      return this.getByHwnd(hwnd);
    }
    return null;
  }

  close(name: string): boolean {
    const inst = this.instances.get(name);
    if (!inst) return false;
    this.platform.closeWindow(inst.hwnd);
    return true;
  }

  closeAllManaged() { for (const [n, i] of this.instances) { if (i.tag === 'managed') this.close(n); } }
  get(name: string): Instance | null { return this.instances.get(name) || null; }
  setSchema(name: string, schema: Partial<WindowSchema>) {
    const inst = this.instances.get(name);
    if (inst) Object.assign(inst.schema, schema);
  }

  getActive(): Instance | null {
    const hwnd = this.platform.getActiveWindow();
    if (hwnd !== null && this.hwndName.has(hwnd)) return this.instances.get(this.hwndName.get(hwnd)!) || null;
    return null;
  }
  list(): Instance[] { return [...this.instances.values()]; }

  watch(cb: (e: {event: string, hwnd: number, title: string}) => void): { stop(): void } {
    return this.platform.watchWindows(cb);
  }

  private genName(): string {
    for (let i = 1; i < 99; i++) { const n = i === 1 ? 'terminal' : `terminal-${i}`; if (!this.instances.has(n)) return n; }
    return `terminal-${this.instances.size + 1}`;
  }

  private getByHwnd(hwnd: number): Instance | null {
    const name = this.hwndName.get(hwnd);
    return name ? this.instances.get(name) || null : null;
  }
}
