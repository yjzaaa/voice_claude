/**
 * Agent 增强 — LLM 将口语转为 Claude Code 指令
 */
import { Config } from '../config';
import * as https from 'https';

export class PromptEnhancer {
  private config: Config;

  constructor(config: Config) { this.config = config; }

  async enhance(text: string): Promise<string> {
    if (!this.config.pipeline.enhance) return text;

    const systemPrompt = `你是语音意图增强器。将用户口语化文字转为 Claude Code 可执行指令。
修正识别错误、补充上下文、模糊请求具体化。系统命令（切换/新建/关闭）原样返回。只输出增强后文本。`;

    return new Promise((resolve) => {
      const body = JSON.stringify({
        model: this.config.llm.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `用户语音: ${text}` },
        ],
        temperature: 0.3, max_tokens: 300,
      });

      const req = https.request(this.config.llm.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.llm.apiKey}` },
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            const result = j.choices?.[0]?.message?.content?.trim();
            resolve(result || text);
          } catch { resolve(text); }
        });
      });
      req.on('error', () => resolve(text));
      req.on('timeout', () => { req.destroy(); resolve(text); });
      req.write(body); req.end();
    });
  }
}
