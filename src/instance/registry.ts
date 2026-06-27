/**
 * 实例注册表 — 窗口生命周期（Python ctypes 桥接 Win32）
 */
import { execSync, spawn, ChildProcess } from 'child_process';
import * as path from 'path';

const PY = 'D:/autoclaw/resources/python/python.exe';
const ROOT = path.join(__dirname, '..', '..');
const FIND_WIN = path.join(ROOT, 'find_win.py');
const KILL_WIN = path.join(ROOT, 'kill_win.py');
const WATCH_WIN = path.join(ROOT, 'watch_win.py');

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

  scan(): Instance[] {
    try {
      const r = execSync(`"${PY}" "${FIND_WIN}"`, { timeout: 3000, encoding: 'utf-8' }).trim();
      const seen = new Set<number>();
      for (const line of r ? r.split('\n') : []) {
        const [hwndStr, ...tp] = line.split('|');
        const hwnd = parseInt(hwndStr);
        if (!hwnd) continue;
        seen.add(hwnd);
        if (!this.hwndName.has(hwnd)) {
          const name = this.genName();
          const title = tp.join('|');
          this.instances.set(name, { name, hwnd, title, tag: 'found', alive: true, schema: defaultSchema(title) });
          this.hwndName.set(hwnd, name);
        } else {
          const inst = this.instances.get(this.hwndName.get(hwnd)!);
          if (inst) inst.title = tp.join('|');
        }
      }
      for (const [hwnd, name] of this.hwndName) {
        if (!seen.has(hwnd)) { this.instances.delete(name); this.hwndName.delete(hwnd); }
      }
    } catch {}
    return this.list();
  }

  create(title = '🎤 voice_claude'): Instance | null {
    const before = new Set(this.scan().map(i => i.hwnd));
    spawn('wt.exe', ['--title', title, 'cmd', '/c', 'claude'], { detached: true, stdio: 'ignore' });
    for (let i = 0; i < 20; i++) {
      this.scan();
      for (const inst of this.list()) { if (!before.has(inst.hwnd)) return inst; }
    }
    return null;
  }

  close(name: string): boolean {
    const inst = this.instances.get(name);
    if (!inst) return false;
    try { execSync(`"${PY}" "${KILL_WIN}" ${inst.hwnd}`, { timeout: 2000 }); return true; } catch { return false; }
  }

  closeAllManaged() { for (const [n, i] of this.instances) { if (i.tag === 'managed') this.close(n); } }
  get(name: string): Instance | null { return this.instances.get(name) || null; }
  setSchema(name: string, schema: Partial<WindowSchema>) {
    const inst = this.instances.get(name);
    if (inst) Object.assign(inst.schema, schema);
  }

  getActive(): Instance | null {
    try {
      const r = execSync(`"${PY}" -c "import ctypes;h=ctypes.windll.user32.GetForegroundWindow();print(h)"`, { timeout: 1000, encoding: 'utf-8' }).trim();
      const hwnd = parseInt(r);
      if (hwnd && this.hwndName.has(hwnd)) return this.instances.get(this.hwndName.get(hwnd)!) || null;
    } catch {}
    return null;
  }
  list(): Instance[] { return [...this.instances.values()]; }

  watch(cb: (e: {event:string, hwnd:number, title:string}) => void): ChildProcess {
    const p = spawn(PY, [WATCH_WIN], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout?.on('data', (d: Buffer) => {
      buf += d.toString(); const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const l of lines) { try { cb(JSON.parse(l)); } catch {} }
    });
    return p;
  }

  private genName(): string {
    for (let i = 1; i < 99; i++) { const n = i === 1 ? 'terminal' : `terminal-${i}`; if (!this.instances.has(n)) return n; }
    return `terminal-${this.instances.size + 1}`;
  }
}
