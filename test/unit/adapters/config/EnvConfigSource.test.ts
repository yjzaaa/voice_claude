import { EnvConfigSource } from '../../../../src/adapters/config/EnvConfigSource';

describe('EnvConfigSource', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('reads Doubao credentials from environment', () => {
    process.env.VOICE_CLAUDE_DOUBAO_APP_ID = 'app-id';
    process.env.VOICE_CLAUDE_DOUBAO_ACCESS_TOKEN = 'token';
    process.env.VOICE_CLAUDE_DOUBAO_RESOURCE_ID = 'resource-id';

    const config = new EnvConfigSource().load();
    expect(config.doubao.appId).toBe('app-id');
    expect(config.doubao.accessToken).toBe('token');
    expect(config.doubao.resourceId).toBe('resource-id');
  });

  test('reads LLM config from environment', () => {
    process.env.VOICE_CLAUDE_LLM_API_KEY = 'llm-key';
    process.env.VOICE_CLAUDE_LLM_API_URL = 'https://api.example.com/v1';
    process.env.VOICE_CLAUDE_LLM_MODEL = 'model-name';

    const config = new EnvConfigSource().load();
    expect(config.llm.apiKey).toBe('llm-key');
    expect(config.llm.apiUrl).toBe('https://api.example.com/v1');
    expect(config.llm.model).toBe('model-name');
  });

  test('provides sensible defaults when env vars are missing', () => {
    delete process.env.VOICE_CLAUDE_ASR_BACKEND;
    delete process.env.VOICE_CLAUDE_LLM_TIMEOUT_MS;

    const config = new EnvConfigSource().load();
    expect(config.asr.backend).toBe('doubao');
    expect(config.asr.sampleRate).toBe(16000);
    expect(config.llm.timeoutMs).toBe(5000);
  });

  test('does not include undefined values in config objects', () => {
    const config = new EnvConfigSource().load();
    expect(config.doubao.proxyHost).toBeUndefined();
    expect(config.doubao.proxyPort).toBeUndefined();
  });
});
