/** 统一配置 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  asr: { language: string };
  pipeline: { enhance: boolean; cooldownSec: number };
  routing: { strategy: string; defaultTarget: string };
  llm: { apiKey: string; apiUrl: string; model: string };
}

const defaults: Config = {
  asr: { language: 'zh-CN' },
  pipeline: { enhance: true, cooldownSec: 3 },
  routing: { strategy: 'llm', defaultTarget: 'chat' },
  llm: {
    apiKey: 'sk-938dfb4cb1e741ed960e2882da9d2eea',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
  },
};

export function loadConfig(): Config {
  const p = path.join(os.homedir(), '.voice_claude.json');
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch { return defaults; }
}
