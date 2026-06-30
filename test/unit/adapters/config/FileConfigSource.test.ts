import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileConfigSource } from '../../../../src/adapters/config/FileConfigSource';

describe('FileConfigSource', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-claude-config-'));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  test('reads valid config file', () => {
    const file = path.join(configDir, 'config.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        asr: { backend: 'vosk', language: 'en-US', sampleRate: 16000 },
        llm: {
          apiKey: 'file-key',
          apiUrl: 'https://file.example.com',
          model: 'file-model',
          timeoutMs: 3000,
        },
        routing: { strategy: 'active', defaultTarget: 'terminal-1' },
        doubao: { appId: 'file-app', accessToken: 'file-token', resourceId: 'file-res' },
        windowManager: { scanIntervalMs: 10000 },
      }),
    );

    const config = new FileConfigSource(file).load();
    expect(config.asr.backend).toBe('vosk');
    expect(config.llm.apiKey).toBe('file-key');
    expect(config.routing.strategy).toBe('active');
    expect(config.doubao.appId).toBe('file-app');
    expect(config.windowManager.scanIntervalMs).toBe(10000);
  });

  test('returns defaults when file does not exist', () => {
    const file = path.join(configDir, 'missing.json');
    const config = new FileConfigSource(file).load();
    expect(config.asr.backend).toBe('doubao');
    expect(config.llm.model).toBe('deepseek-chat');
    expect(config.doubao.appId).toBe('');
  });

  test('returns defaults when file is malformed JSON', () => {
    const file = path.join(configDir, 'bad.json');
    fs.writeFileSync(file, 'not json');
    const config = new FileConfigSource(file).load();
    expect(config.asr.sampleRate).toBe(16000);
  });

  test('maps legacy asr.doubao_* fields to doubao.*', () => {
    const file = path.join(configDir, 'legacy.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        asr: {
          backend: 'google_stt',
          doubao_app_id: 'legacy-app',
          doubao_access_token: 'legacy-token',
          doubao_resource_id: 'legacy-res',
        },
      }),
    );

    const config = new FileConfigSource(file).load();
    expect(config.doubao.appId).toBe('legacy-app');
    expect(config.doubao.accessToken).toBe('legacy-token');
    expect(config.doubao.resourceId).toBe('legacy-res');
  });

  test('maps legacy snake_case llm fields to camelCase', () => {
    const file = path.join(configDir, 'legacy-llm.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        llm: { api_key: 'legacy-key', api_url: 'https://legacy.example.com', timeout_ms: 7000 },
      }),
    );

    const config = new FileConfigSource(file).load();
    expect(config.llm.apiKey).toBe('legacy-key');
    expect(config.llm.apiUrl).toBe('https://legacy.example.com');
    expect(config.llm.timeoutMs).toBe(7000);
  });
});
