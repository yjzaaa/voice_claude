/**
 * L1 Unit Tests: Registry (src/instance/registry.ts)
 *
 * T1.15: scan with empty platform → list()=[]
 * T1.16: scan with 2 windows → correctly parsed
 * T1.17: scan twice with same windows → no duplicates
 * T1.18: new window gets default Schema from title (task extracted from "✳ 修复bug")
 */

// Mock https to avoid real LLM calls in defaultSchema
jest.mock('https', () => {
  const mockReq = {
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn().mockReturnThis(),
  };
  return {
    request: jest.fn(() => mockReq),
  };
});
import * as https from 'https';
const mockedHttps = https as jest.Mocked<typeof https>;

import { InstanceRegistry } from '../../src/instance/registry';
import { Platform } from '../../src/platform';

// ── Helper: create a mock Platform ──────────────────────────────
function createMockPlatform(
  windows: Array<{ hwnd: number; title: string }>,
  activeHwnd: number | null = null,
): Platform {
  return {
    findWindows: jest.fn(() => windows.map(w => ({ hwnd: w.hwnd, title: w.title }))),
    focusWindow: jest.fn(),
    closeWindow: jest.fn(),
    watchWindows: jest.fn(() => ({ stop: jest.fn() })),
    sendKeys: jest.fn(),
    launchTerminal: jest.fn(() => 333),
    getActiveWindow: jest.fn(() => activeHwnd),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── T1.15: Empty scan ──────────────────────────────────────────
test('T1.15: scan with empty platform → list()=[]', () => {
  const platform = createMockPlatform([]);
  const reg = new InstanceRegistry(platform);

  reg.scan();
  expect(reg.list()).toHaveLength(0);
  expect(platform.findWindows).toHaveBeenCalledTimes(1);
});

// ── T1.16: Scan with 2 windows ─────────────────────────────────
test('T1.16: scan with 2 windows → correctly parsed', () => {
  const platform = createMockPlatform([
    { hwnd: 111, title: '✳ 修复bug' },
    { hwnd: 222, title: 'claude' },
  ]);
  const reg = new InstanceRegistry(platform);

  reg.scan();
  const list = reg.list();
  expect(list).toHaveLength(2);

  // Check first window
  const w1 = list.find(w => w.hwnd === 111);
  expect(w1).toBeDefined();
  expect(w1!.name).toBe('terminal'); // first window gets 'terminal'
  expect(w1!.title).toBe('✳ 修复bug');
  expect(w1!.alive).toBe(true);

  // Check second window
  const w2 = list.find(w => w.hwnd === 222);
  expect(w2).toBeDefined();
  expect(w2!.name).toBe('terminal-2');
  expect(w2!.title).toBe('claude');
});

// ── T1.17: No duplicates on re-scan ────────────────────────────
test('T1.17: scan twice with same windows → no duplicates', () => {
  const platform = createMockPlatform([
    { hwnd: 111, title: '✳ 修复bug' },
    { hwnd: 222, title: 'claude' },
  ]);
  const reg = new InstanceRegistry(platform);

  reg.scan();
  expect(reg.list()).toHaveLength(2);

  // Scan again with the same windows
  reg.scan();
  expect(reg.list()).toHaveLength(2); // still 2, not 4
  expect(platform.findWindows).toHaveBeenCalledTimes(2);
});

// ── T1.18: New window gets Schema from title ───────────────────
test('T1.18: new window gets default Schema from title', () => {
  const platform = createMockPlatform([
    { hwnd: 111, title: '✳ 修复bug' },
  ]);
  const reg = new InstanceRegistry(platform);

  reg.scan();
  const list = reg.list();
  expect(list).toHaveLength(1);

  const inst = list[0];
  // Schema should be populated synchronously from title extraction
  expect(inst.schema.task).toBe('修复bug'); // extracted from "✳ 修复bug"
  expect(inst.schema.labels).toEqual([]);   // labels are async, initially empty
  expect(inst.schema.project).toBe('');
  expect(inst.schema.context).toBe('');

  // The constructor's new https.request() was called for async schema enrichment
  expect(mockedHttps.request).toHaveBeenCalled();
  const callUrl = mockedHttps.request.mock.calls[0][0] as any;
  expect(callUrl).toBeDefined();
});
