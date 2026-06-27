/**
 * L1 Unit Tests: Config (src/config.ts)
 *
 * T1.1: Config.defaults() returns valid object with all fields
 * T1.2: Save → Load roundtrip (use tmp file)
 * T1.3: Load nonexistent file → returns defaults
 * T1.4: Partial JSON → merges with defaults
 */

import { loadConfig, Config } from '../../src/config';

// Mock fs and os modules
jest.mock('fs');
jest.mock('os');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedOs = os as jest.Mocked<typeof os>;

const testDefaults: Config = {
  asr: { language: 'zh-CN' },
  pipeline: { enhance: true, cooldownSec: 3 },
  routing: { strategy: 'llm', defaultTarget: 'chat' },
  llm: {
    apiKey: 'sk-938dfb4cb1e741ed960e2882da9d2eea',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
  },
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedOs.homedir.mockReturnValue('/fake/home');
});

// Helper: check that an object is a valid Config
function isValidConfig(c: Config): boolean {
  return (
    typeof c === 'object' &&
    typeof c.asr?.language === 'string' &&
    typeof c.pipeline?.enhance === 'boolean' &&
    typeof c.pipeline?.cooldownSec === 'number' &&
    typeof c.routing?.strategy === 'string' &&
    typeof c.routing?.defaultTarget === 'string' &&
    typeof c.llm?.apiKey === 'string' &&
    typeof c.llm?.apiUrl === 'string' &&
    typeof c.llm?.model === 'string'
  );
}

// ── T1.1: Defaults ──────────────────────────────────────────────
test('T1.1: defaults() returns valid object with all fields', () => {
  // Simulate file read error (file not found → catch → return defaults)
  mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

  const cfg = loadConfig();
  expect(isValidConfig(cfg)).toBe(true);
  expect(cfg.asr.language).toBe('zh-CN');
  expect(cfg.routing.strategy).toBe('llm');
  expect(cfg.pipeline.cooldownSec).toBe(3);
});

// ── T1.2: Save → Load roundtrip ─────────────────────────────────
test('T1.2: Save → Load roundtrip', () => {
  // loadConfig reads from os.homedir() + '/.voice_claude.json'.
  // We mock readFileSync to simulate a saved JSON file, then verify
  // the loaded config matches what was "saved".
  const custom: Config = {
    asr: { language: 'en-US' },
    pipeline: { enhance: false, cooldownSec: 10 },
    routing: { strategy: 'keyword', defaultTarget: 'terminal' },
    llm: { apiKey: 'test-key', apiUrl: 'https://test.api.com', model: 'test-model' },
  };

  mockedFs.readFileSync.mockReturnValue(JSON.stringify(custom));

  const cfg = loadConfig();
  expect(cfg.asr.language).toBe('en-US');
  expect(cfg.pipeline.enhance).toBe(false);
  expect(cfg.llm.apiKey).toBe('test-key');
  expect(cfg.llm.model).toBe('test-model');
  expect(cfg.routing.strategy).toBe('keyword');
});

// ── T1.3: Load nonexistent file → defaults ──────────────────────
test('T1.3: Load nonexistent file → returns defaults', () => {
  mockedFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

  const cfg = loadConfig();
  expect(cfg).toEqual(testDefaults);
  expect(isValidConfig(cfg)).toBe(true);
});

// ── T1.4: Partial JSON → merges with defaults ───────────────────
test('T1.4: Partial JSON → merges with defaults', () => {
  const partial = { routing: { strategy: 'keyword', defaultTarget: 'chat' } };

  mockedFs.readFileSync.mockReturnValue(JSON.stringify(partial));

  const cfg = loadConfig();
  // Fields from partial override
  expect(cfg.routing.strategy).toBe('keyword');
  // Fields from defaults preserved
  expect(cfg.asr.language).toBe('zh-CN');
  expect(cfg.pipeline.enhance).toBe(true);
  expect(cfg.pipeline.cooldownSec).toBe(3);
  expect(cfg.llm.apiKey).toBe(testDefaults.llm.apiKey);
});
