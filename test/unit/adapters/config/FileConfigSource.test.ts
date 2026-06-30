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
    fs.writeFileSync(file, JSON.stringify({
      asr: { backend: 'vosk', language: 'en-US', sampleRate: 16000 },
      llm: { apiKey: 'file-key', apiUrl: 'https://file.example.com', model: 'file-model', timeoutMs: 3000 },
      routing: { strategy: 'active', defaultTarget: 'terminal-1' },
      doubao: { appId: 'file-app', accessToken: 'file-token', resourceId: 'file-res' },
      windowManager: { scanIntervalMs: 10000 },
    }));

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

  test('partial file config is merged with defaults', () => {
    const file = path.join(configDir, 'partial.json');
    fs.writeFileSync(file, JSON.stringify({
      llm: { apiKey: 'partial-key' },
      doubao: { appId: 'partial-app' },
    }));

    const config = new FileConfigSource(file).load();
    expect(config.llm.apiKey).toBe('partial-key');
    expect(config.llm.model).toBe('deepseek-chat');
    expect(config.doubao.appId).toBe('partial-app');
    expect(config.doubao.accessToken).toBe('');
  });
});
