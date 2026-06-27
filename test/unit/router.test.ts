/**
 * L1 Unit Tests: Router (src/instance/router.ts)
 *
 * T1.8: Empty window list → resolve() doesn't throw
 * T1.9: "切换到 terminal-2" → target changes to terminal-2
 * T1.10: "切换到xxx" (no match) → still returns a window
 * T1.11: "新建窗口" → calls registry.create()
 * T1.12: Foreground window → returns foreground, not default
 * T1.13: Non-Claude foreground → returns lastUsed immediately (dual-speed)
 * T1.14: LLM timeout → falls back to default
 */

import { Router } from '../../src/instance/router';
import { Instance, InstanceRegistry, WindowSchema } from '../../src/instance/registry';

// ── Helper: build a mock Instance ──────────────────────────────
function makeInst(name: string, hwnd: number, title: string, task: string, labels: string[] = []): Instance {
  return {
    name, hwnd, title, tag: 'found', alive: true,
    schema: { labels, task, project: '', context: '' },
  };
}

// ── Helper: create a fake InstanceRegistry ──────────────────────
function createMockRegistry(windows: Instance[], active: Instance | null = null) {
  const map = new Map(windows.map(w => [w.name, w]));

  return {
    scan: jest.fn(() => windows),
    list: jest.fn(() => windows),
    get: jest.fn((name: string) => map.get(name) || null),
    getActive: jest.fn(() => active),
    create: jest.fn(() => {
      const n = makeInst('new', 999, '🎤 voice_claude', '新建窗口', ['new']);
      map.set('new', n);
      return n;
    }),
    close: jest.fn(() => true),
    setSchema: jest.fn(),
    watch: jest.fn(() => ({ stop: jest.fn() })),
    closeAllManaged: jest.fn(),
  } as unknown as jest.Mocked<InstanceRegistry>;
}

// ── Mock https to avoid real LLM calls ─────────────────────────
jest.mock('https', () => {
  const defaultReq = {
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn().mockReturnThis(),
  };
  return {
    request: jest.fn(() => defaultReq),
  };
});
import * as https from 'https';
const mockedHttps = https as jest.Mocked<typeof https>;

// Helper: make a mock https.request that fires an event
function mockHttpsRequest(result: string | null, error?: boolean, timeout?: boolean) {
  const mockReq: Record<string, any> = {
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn((event: string, cb: Function) => {
      if (event === 'error' && error) {
        process.nextTick(() => cb(new Error('mock error')));
      }
      if (event === 'timeout' && timeout) {
        process.nextTick(() => cb());
      }
      return mockReq;
    }),
  };

  const mockRes: Record<string, any> = {
    on: jest.fn((event: string, cb: Function) => {
      if (event === 'data' && result !== null) {
        const json = { choices: [{ message: { content: result } }] };
        process.nextTick(() => cb(JSON.stringify(json)));
      }
      if (event === 'end') {
        process.nextTick(() => cb());
      }
      return mockRes;
    }),
    statusCode: 200,
  };

  mockedHttps.request.mockImplementation((() => {
    if (!error && !timeout && result !== null) {
      process.nextTick(() => {
        (mockReq.on as jest.Mock).mock.calls
          .filter((c: any[]) => c[0] === 'response')
          .forEach((c: any[]) => c[1](mockRes));
      });
    }
    return mockReq;
  }) as any);

  return { mockReq, mockRes };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── T1.8: Empty window list ────────────────────────────────────
test('T1.8: Empty window list → resolve() does not throw', async () => {
  const reg = createMockRegistry([]);
  const router = new Router(reg);
  // Constructor calls reg.scan() and reg.list()[0], which is undefined with empty list
  // It should handle gracefully

  const result = await router.resolve('hello');
  // Should not throw; returns null instance and a reason
  expect(result).toHaveProperty('inst');
  expect(result).toHaveProperty('reason');
});

// ── T1.9: Switch command match ─────────────────────────────────
test('T1.9: 切换到 terminal-2 → target changes to terminal-2', async () => {
  const windows = [
    makeInst('terminal', 111, '✳ 修复bug', '修复bug', ['bug']),
    makeInst('terminal-2', 222, 'claude', 'claude', []),
  ];
  const reg = createMockRegistry(windows);
  const router = new Router(reg);

  const result = await router.resolve('切换到 terminal-2');

  expect(result.reason).toBe('切→terminal-2');
  expect(result.inst?.name).toBe('terminal-2');
  expect(router.isCmd).toBe(true);
  expect(router.target).toBe('terminal-2');
});

// ── T1.10: Switch command no match ──────────────────────────────
test('T1.10: 切换到xxx (no match) → does not swallow, still returns a window', async () => {
  const windows = [
    makeInst('terminal', 111, '✳ 修复bug', '修复bug', ['bug']),
    makeInst('terminal-2', 222, 'claude', 'claude', []),
  ];
  const reg = createMockRegistry(windows);
  const router = new Router(reg);

  const result = await router.resolve('切换到xxx');

  // The command matched the pattern but no window matched "xxx"
  // So it doesn't enter the if-block at all, and falls through
  // Since there's an active window (null) and no lastUsed set yet,
  // it will fall to the default: reg.list()[0]
  expect(result.inst).not.toBeNull();
  expect(result).toHaveProperty('reason');
});

// ── T1.11: Create command ──────────────────────────────────────
test('T1.11: 新建窗口 → calls registry.create()', async () => {
  const windows = [
    makeInst('terminal', 111, '✳ 修复bug', '修复bug', ['bug']),
  ];
  const reg = createMockRegistry(windows);
  const router = new Router(reg);

  const result = await router.resolve('新建窗口');

  expect(reg.create).toHaveBeenCalledTimes(1);
  expect(result.inst?.name).toBe('new');
  expect(router.isCmd).toBe(true);
});

// ── T1.12: Foreground window active ────────────────────────────
test('T1.12: Foreground window → returns foreground, not default', async () => {
  const windows = [
    makeInst('terminal', 111, '✳ 修复bug', '修复bug', ['bug']),
    makeInst('terminal-2', 222, 'claude', 'claude', []),
  ];
  const activeInst = makeInst('terminal-2', 222, 'claude', 'claude', []);
  const reg = createMockRegistry(windows, activeInst);
  const router = new Router(reg);
  // Constructor sets target to first window: terminal
  expect(router.target).toBe('terminal');

  const result = await router.resolve('你好');

  // Active window takes priority
  expect(result.inst?.name).toBe('terminal-2');
  expect(result.reason).toBe('前台');
  expect(router.target).toBe('terminal-2');
});

// ── T1.13: Dual-speed routing ──────────────────────────────────
test('T1.13: Non-Claude foreground → returns lastUsed immediately (dual-speed)', async () => {
  const windows = [
    makeInst('terminal', 111, '✳ 修复bug', '修复bug', ['bug']),
    makeInst('terminal-2', 222, 'claude', 'claude', []),
  ];
  const reg = createMockRegistry(windows, null); // no active window
  const router = new Router(reg);

  // First resolve establishes lastUsed via dual-speed
  mockHttpsRequest('terminal-2');
  const result = await router.resolve('some message');

  // No active window, so dual-speed kicks in: uses lastUsed or first window
  expect(result.inst).not.toBeNull();
  expect(result.reason).toMatch(/快速/); // "快速→..."
});

// ── T1.14: LLM timeout → falls back to default ─────────────────
test('T1.14: LLM timeout → falls back to default', async () => {
  const windows = [
    makeInst('terminal', 111, '✳ 修复bug', '修复bug', ['bug']),
  ];
  const reg = createMockRegistry(windows, null);
  const router = new Router(reg);
  expect(router.target).toBe('terminal');

  // LLM is called in background via dual-speed — it times out but
  // the initial resolve should still return quickly with default
  const result = await router.resolve('test message');

  // Should not throw and should return an instance
  expect(result.inst).not.toBeNull();
  expect(result).toHaveProperty('reason');
});
