import { OpenAiCompatibleProvider } from '../../../../../src/adapters/llm/providers/OpenAiCompatibleProvider';
import { HttpsJsonClient } from '../../../../../src/adapters/llm/internal/HttpsJsonClient';
import { LlmRequest } from '../../../../../src/ports/incoming/LlmClient';

describe('OpenAiCompatibleProvider', () => {
  function makeHttp(result: unknown) {
    return {
      post: jest.fn().mockResolvedValue(result),
    } as unknown as HttpsJsonClient;
  }

  const config = {
    apiKey: 'key',
    apiUrl: 'https://api.example.com/v1',
    model: 'model-x',
    timeoutMs: 3000,
  };

  const req: LlmRequest = {
    systemPrompt: 'sys',
    userPrompt: 'user',
    maxTokens: 10,
    temperature: 0.5,
  };

  test('posts to /chat/completions with correct body and headers', async () => {
    const http = makeHttp({ choices: [{ message: { content: '  hello  ' } }] });
    const provider = new OpenAiCompatibleProvider(http);

    const result = await provider.complete(req, config);

    expect(result).toBe('hello');
    expect(http.post).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      {
        model: 'model-x',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'user' },
        ],
        max_tokens: 10,
        temperature: 0.5,
      },
      {
        Authorization: 'Bearer key',
        'Content-Type': 'application/json',
      },
      3000,
    );
  });

  test('returns null when choices are empty', async () => {
    const http = makeHttp({ choices: [] });
    const provider = new OpenAiCompatibleProvider(http);
    const result = await provider.complete(req, config);
    expect(result).toBeNull();
  });

  test('returns null when response has no message content', async () => {
    const http = makeHttp({ choices: [{ message: {} }] });
    const provider = new OpenAiCompatibleProvider(http);
    const result = await provider.complete(req, config);
    expect(result).toBeNull();
  });
});
