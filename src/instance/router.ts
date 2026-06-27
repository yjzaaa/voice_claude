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
      // 后台异步：LLM 导航 + 更新 Schema（合并为一次调用）
      llmNavigate(text, this.reg.list()).then(best => {
        if (best) {
          this.lastUsed = best;
          this.target = best;
          // 投递驱动：LLM 判断这条消息该更新目标窗口的哪些 Schema 字段
          this.updateSchemaFromText(best, text);
        }
      });
      return { inst: fast, reason: `快速→${fast.name}` };
    }

    // 绝不为空
    const def = this.reg.list()[0] || null;
    return { inst: def, reason: def ? '默认' : '前台' };
  }

  // 投递驱动 Schema 更新：LLM 根据投递内容更新目标窗口的标签+任务
  private updateSchemaFromText(winName: string, text: string) {
    const inst = this.reg.get(winName);
    if (!inst) return;
    const s = inst.schema;
    const body = JSON.stringify({ model: 'deepseek-chat', messages: [
      { role: 'system', content: '分析消息，更新窗口Schema。返回JSON: {"labels":["新增标签"],"task":"更新后的任务(可选)"}。基于现有信息增量更新，不要覆盖已有标签。只返回JSON。' },
      { role: 'user', content: `当前: labels=[${s.labels.join(',')}] task="${s.task}"\n消息: "${text}"\n更新: 提取新标签，如消息体现任务变化则更新task。` }
    ], temperature: 0, max_tokens: 80 });
    const req = (require('https') as typeof import('https')).request('https://api.deepseek.com/v1/chat/completions', { method: 'POST', timeout: 4000, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-938dfb4cb1e741ed960e2882da9d2eea' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { const j = JSON.parse(JSON.parse(d).choices[0].message.content); if (j.labels) this.reg.setSchema(winName, { labels: [...new Set([...s.labels, ...j.labels])], task: j.task || s.task }); } catch {}
      });
    });
    req.on('error', () => {}); req.end();
  }

  status() { return `${this.target} (${this.reg.list().length})`; }
}
