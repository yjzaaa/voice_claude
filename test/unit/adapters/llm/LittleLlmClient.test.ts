import { LittleLlmClient } from '../../../../src/adapters/llm/LittleLlmClient';
import { Provider, ProviderConfig } from '../../../../src/adapters/llm/Provider';
import { LlmRequest } from '../../../../src/ports/incoming/LlmClient';

describe('LittleLlmClient', () => {
  function makeProvider(result: string | null): Provider {
    return {
      name: 'mock',
      complete: jest.fn().mockResolvedValue(result),
    };
  }

  const config: ProviderConfig = {
    apiKey: 'key',
    apiUrl: 'https://api.example.com/v1',
    model: 'model',
    timeoutMs: 3000,
  };

  const req: LlmRequest = {
    systemPrompt: 'sys',
    userPrompt: 'user',
    maxTokens: 10,
  };

  test('delegates to provider with config', async () => {
    const provider = makeProvider('hi');
    const client = new LittleLlmClient(provider, config);

    const result = await client.complete(req);

    expect(result).toBe('hi');
    expect(provider.complete).toHaveBeenCalledWith(req, config);
  });

  test('allows timeout override', async () => {
    const provider = makeProvider('hi');
    const client = new LittleLlmClient(provider, config);

    await client.complete(req, 500);

    expect(provider.complete).toHaveBeenCalledWith(req, {
      ...config,
      timeoutMs: 500,
    });
  });

  test('passes through null results', async () => {
    const provider = makeProvider(null);
    const client = new LittleLlmClient(provider, config);
    const result = await client.complete(req);
    expect(result).toBeNull();
  });
});
