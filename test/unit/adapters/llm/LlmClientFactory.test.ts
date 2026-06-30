import { createLlmClient } from '../../../../src/adapters/llm/LlmClientFactory';
import { LlmConfig } from '../../../../src/ports/incoming/ConfigSource';

describe('createLlmClient', () => {
  const baseConfig: LlmConfig = {
    apiKey: 'key',
    apiUrl: 'https://api.example.com/v1',
    model: 'model',
    timeoutMs: 3000,
  };

  test('selects DeepSeekProvider for deepseek URLs', () => {
    const client = createLlmClient({ ...baseConfig, apiUrl: 'https://api.deepseek.com/v1' });
    expect((client as any).provider.name).toBe('deepseek');
  });

  test('defaults to OpenAiCompatibleProvider for other URLs', () => {
    const client = createLlmClient({ ...baseConfig, apiUrl: 'https://api.openai.com/v1' });
    expect((client as any).provider.name).toBe('openai-compatible');
  });
});
