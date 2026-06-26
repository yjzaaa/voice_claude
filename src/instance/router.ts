/**
 * 路由策略
 */
import { Instance, InstanceRegistry } from './registry';
import { Config } from '../config';
import * as https from 'https';

export interface Router {
  resolve(text: string): Promise<Instance | null>;
  status(): string;
  wasCommand(): boolean;
}

async function llmCall(apiKey: string, apiUrl: string, model: string, systemPrompt: string, userPrompt: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const body = JSON.stringify({
      model, messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0, max_tokens: 100,
    });
    const req = https.request(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j.choices?.[0]?.message?.content?.trim() || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body); req.end();
  });
}

export class LLMRouter implements Router {
  private targetName: string;
  private isCommand = false;
  private registry: InstanceRegistry;
  private config: Config;

  constructor(registry: InstanceRegistry, config: Config) {
    this.registry = registry;
    this.config = config;
    this.targetName = config.routing.defaultTarget;
  }

  async resolve(text: string): Promise<Instance | null> {
    this.registry.scan();
    this.isCommand = false;

    // 命令
    if (/^(切换|新建|创建|关闭|列出)/.test(text)) {
      this.isCommand = true;
      if (/^切换/.test(text)) {
        const target = text.replace(/^切换/, '').trim();
        for (const inst of this.registry.list()) {
          if (inst.name.includes(target) || inst.title.includes(target)) {
            this.targetName = inst.name;
            return inst;
          }
        }
      }
      if (/^(新建|创建)/.test(text)) {
        return this.registry.create();
      }
      return null;
    }

    // LLM 路由
    const candidates = this.registry.list().map(i => ({ name: i.name, kind: i.kind, title: i.title }));
    const prompt = `路由到: ${candidates.map(c => c.name).join(', ')}\n消息: ${text}`;
    const result = await llmCall(
      this.config.llm.apiKey, this.config.llm.apiUrl, this.config.llm.model,
      '你是路由器。只返回目标实例名。',
      prompt,
    );
    if (result) {
      for (const inst of this.registry.list()) {
        if (result.includes(inst.name)) return inst;
      }
    }

    // 回退
    if (this.targetName) {
      const inst = this.registry.get(this.targetName);
      if (inst) return inst;
    }
    return this.registry.getActive() || this.registry.list()[0] || null;
  }

  status(): string { return `LLM → ${this.targetName || 'auto'}`; }
  wasCommand(): boolean { return this.isCommand; }
}
