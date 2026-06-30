import { LlmConfig } from '../../ports/incoming/ConfigSource';
import { LlmClient } from '../../ports/incoming/LlmClient';
import { HttpsJsonClient } from './internal/HttpsJsonClient';
import { LittleLlmClient } from './LittleLlmClient';
import { DeepSeekProvider } from './providers/DeepSeekProvider';
import { OpenAiCompatibleProvider } from './providers/OpenAiCompatibleProvider';

export function createLlmClient(config: LlmConfig): LlmClient {
  const http = new HttpsJsonClient();
  const provider = config.apiUrl.includes('deepseek')
    ? new DeepSeekProvider(http)
    : new OpenAiCompatibleProvider(http);

  return new LittleLlmClient(provider, {
    apiKey: config.apiKey,
    apiUrl: config.apiUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });
}
