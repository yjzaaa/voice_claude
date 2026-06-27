/**
 * Schema 语义导航
 */
import { Instance, InstanceRegistry, WindowSchema } from './registry';
import * as https from 'https';

const KEY = 'sk-938dfb4cb1e741ed960e2882da9d2eea';

function llmNavigate(text: string, wins: Instance[]): Promise<string|null> {
  if (!wins.length) return Promise.resolve(null);
  const list = wins.map(w => {
    const s = w.schema;
    return `"${w.name}": labels=[${s.labels.join(',')}] task="${s.task}" project="${s.project}" ctx="${s.context}" title="${w.title.slice(0,40)}"`;
  }).join('\n');

  return new Promise(resolve => {
    const body = JSON.stringify({ model: 'deepseek-chat', messages: [
      { role: 'system', content: '只回复窗口名。比较用户消息与每个窗口的 labels/task/project/context/title，选最匹配的。' },
      { role: 'user', content: `窗口:\n${list}\n\n消息: "${text}"` }
    ], temperature: 0, max_tokens: 10 });
    const req = https.request('https://api.deepseek.com/v1/chat/completions', { method: 'POST', timeout: 5000, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d).choices?.[0]?.message?.content?.trim()||null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}

export class Router {
  private reg: InstanceRegistry;
  target = 'terminal';
  isCmd = false;
  lastTarget = '';
  private lastUsed = '';  // 最近成功投递的目标

  constructor(reg: InstanceRegistry) {
    this.reg = reg;
    reg.scan();
    const first = reg.list()[0];
    if (first) this.target = first.name;
  }

  async resolve(text: string): Promise<{inst: Instance|null, reason: string}> {
    this.reg.scan();
    this.isCmd = false;

    // 命令：切换
    if (/^(切换|切到|导航到)/.test(text)) {
      const kw = text.replace(/^(切换|切到|导航到)/, '').trim();
      for (const i of this.reg.list()) {
        const s = i.schema;
        if (kw && (i.name.includes(kw) || i.title.includes(kw) ||
            s.labels.some(l => l.includes(kw)) || s.task.includes(kw))) {
          this.isCmd = true; this.target = i.name; return { inst: i, reason: `切→${i.name}` };
        }
      }
    }
    if (/^(新建|创建)/.test(text)) { this.isCmd = true; const i = this.reg.create(); return { inst: i, reason: '新建' }; }

    // 前台优先
    const active = this.reg.getActive();
    if (active) {
      this.target = active.name;
      this.lastUsed = active.name;
      return { inst: active, reason: '前台' };
    }

    // 双速：非 Claude 窗口时，先发到上次用的目标，后台 LLM
    const fast = this.reg.get(this.lastUsed) || this.reg.list()[0];
    if (fast) {
      // 后台异步跑 LLM，更新 lastUsed（不阻塞）
      llmNavigate(text, this.reg.list()).then(best => {
        if (best) { this.lastUsed = best; this.target = best; }
      });
      return { inst: fast, reason: `快速→${fast.name}` };
    }

    // 绝不为空
    const def = this.reg.list()[0] || null;
    return { inst: def, reason: def ? '默认' : '前台' };
  }

  status() { return `${this.target} (${this.reg.list().length})`; }
}
