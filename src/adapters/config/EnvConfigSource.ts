import { ConfigSource, AppConfig } from '../../ports/incoming/ConfigSource';

function env(key: string): string | undefined {
  return process.env[key];
}

function envNumber(key: string): number | undefined {
  const v = env(key);
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function requiredString(key: string): string {
  return env(key) || '';
}

export class EnvConfigSource implements ConfigSource {
  load(): AppConfig {
    return {
      asr: {
        backend: env('VOICE_CLAUDE_ASR_BACKEND') || 'doubao',
        language: env('VOICE_CLAUDE_ASR_LANGUAGE') || 'zh-CN',
        sampleRate: envNumber('VOICE_CLAUDE_ASR_SAMPLE_RATE') || 16000,
      },
      llm: {
        apiKey:
          env('VOICE_CLAUDE_LLM_API_KEY') ||
          env('VOICE_CLAUDE_LLM_KEY') ||
          env('DEEPSEEK_API_KEY') ||
          '',
        apiUrl: env('VOICE_CLAUDE_LLM_API_URL') || 'https://api.deepseek.com/v1',
        model: env('VOICE_CLAUDE_LLM_MODEL') || 'deepseek-chat',
        timeoutMs: envNumber('VOICE_CLAUDE_LLM_TIMEOUT_MS') || 5000,
      },
      routing: {
        strategy: env('VOICE_CLAUDE_ROUTING_STRATEGY') || 'llm',
        defaultTarget: env('VOICE_CLAUDE_ROUTING_DEFAULT_TARGET') || 'terminal',
      },
      doubao: {
        appId: requiredString('VOICE_CLAUDE_DOUBAO_APP_ID'),
        accessToken: requiredString('VOICE_CLAUDE_DOUBAO_ACCESS_TOKEN'),
        resourceId: requiredString('VOICE_CLAUDE_DOUBAO_RESOURCE_ID'),
        proxyHost: env('VOICE_CLAUDE_DOUBAO_PROXY_HOST'),
        proxyPort: envNumber('VOICE_CLAUDE_DOUBAO_PROXY_PORT'),
      },
      windowManager: {
        scanIntervalMs: envNumber('VOICE_CLAUDE_WM_SCAN_INTERVAL_MS') || 5000,
      },
    };
  }
}
