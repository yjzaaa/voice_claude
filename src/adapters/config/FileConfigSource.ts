import * as fs from 'fs';
import * as path from 'path';
import { ConfigSource, AppConfig } from '../../ports/incoming/ConfigSource';

function defaultConfig(): AppConfig {
  return {
    asr: { backend: 'doubao', language: 'zh-CN', sampleRate: 16000 },
    llm: { apiKey: '', apiUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', timeoutMs: 5000 },
    routing: { strategy: 'llm', defaultTarget: 'terminal' },
    doubao: { appId: '', accessToken: '', resourceId: '' },
    windowManager: { scanIntervalMs: 5000 },
  };
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (target[key] === undefined || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

export class FileConfigSource implements ConfigSource {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.voice_claude.json');
  }

  load(): AppConfig {
    const base = defaultConfig();
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const merged = deepMerge(base as unknown as Record<string, unknown>, parsed);
      return merged as unknown as AppConfig;
    } catch {
      return base;
    }
  }
}
