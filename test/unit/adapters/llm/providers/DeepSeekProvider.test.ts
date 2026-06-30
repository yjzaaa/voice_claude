import { DeepSeekProvider } from '../../../../../src/adapters/llm/providers/DeepSeekProvider';
import { OpenAiCompatibleProvider } from '../../../../../src/adapters/llm/providers/OpenAiCompatibleProvider';
import { HttpsJsonClient } from '../../../../../src/adapters/llm/internal/HttpsJsonClient';
import { LlmRequest } from '../../../../../src/ports/incoming/LlmClient';

describe('DeepSeekProvider', () => {
  const config = {
    apiKey: 'ds-key',
    apiUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    timeoutMs: 5000,
  };

  const req: LlmRequest = {
    systemPrompt: 'sys',
    userPrompt: 'user',
    maxTokens: 10,
  };

  test('name is deepseek and delegates to openai-compatible protocol', async () => {
    const http = {
      post: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'ok' } }] }),
    } as unknown as HttpsJsonClient;

    const provider = new DeepSeekProvider(http);
    expect(provider.name).toBe('deepseek');
    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);

    const result = await provider.complete(req, config);
    expect(result).toBe('ok');
    expect(http.post).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.any(Object),
      expect.any(Object),
      5000,
    );
  });
});
