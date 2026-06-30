/**
 * L1 Unit Tests: Logger (src/logger.ts)
 *
 * T1.5: Each component writes to separate file (http→http.log, delivery→delivery.log)
 * T1.6: Each line is valid JSON
 * T1.7: Metrics count correctly (delivery increments counter)
 */

import { logger } from '../../src/logger';

// Mock fs before importing
jest.mock('fs');
import * as fs from 'fs';
const mockedFs = fs as jest.Mocked<typeof fs>;

// The singleton logger was created at import time with real fs.
// jest.mock replaces fs before anything runs, so the logger's internal
// fs calls will use the mock. However, mkdirSync was called in the
// constructor. We set it up as a no-op.
beforeEach(() => {
  jest.clearAllMocks();
  mockedFs.mkdirSync.mockImplementation(() => undefined);
  mockedFs.appendFileSync.mockImplementation(() => undefined);
  mockedFs.writeFileSync?.mockImplementation(() => undefined);
});

// ── T1.5: Component separation ──────────────────────────────────
test('T1.5: Each component writes to separate file', () => {
  logger.info('http', 'GET /status', { status: 200, ms: 5 });
  logger.info('delivery', '投递成功', { target: 'terminal', text: 'hello', ms: 100 });

  // Two calls to appendFileSync
  expect(mockedFs.appendFileSync).toHaveBeenCalledTimes(2);

  // Check that different files were used
  const calls = mockedFs.appendFileSync.mock.calls;
  const files = calls.map((c: any[]) => c[0]);
  expect(files.some((f: string) => f.includes('http.log'))).toBe(true);
  expect(files.some((f: string) => f.includes('delivery.log'))).toBe(true);
});

// ── T1.6: Valid JSON lines ──────────────────────────────────────
test('T1.6: Each line is valid JSON', () => {
  logger.info('http', 'test message', { extra: 'data' });
  logger.warn('router', 'warning message', { attempt: 1 });
  logger.error('delivery', 'error message', { reason: 'timeout' });

  expect(mockedFs.appendFileSync).toHaveBeenCalledTimes(3);
  for (const call of mockedFs.appendFileSync.mock.calls) {
    const line = call[1] as string;
    const trimmed = line.endsWith('\n') ? line.slice(0, -1) : line;
    const parsed = JSON.parse(trimmed);
    expect(parsed).toHaveProperty('ts');
    expect(parsed).toHaveProperty('lvl');
    expect(parsed).toHaveProperty('cmp');
    expect(parsed).toHaveProperty('msg');
    expect(typeof parsed.ts).toBe('string');
  }
});

// ── T1.7: Metrics count correctly ──────────────────────────────
test('T1.7: Metrics count correctly', () => {
  // Metrics start at zero
  expect(logger.metricsJSON()).toEqual({
    delivered: 0,
    errors: 0,
    avgLatencyMs: 0,
    count: 0,
  });

  logger.delivery('terminal', 'test text', 50);
  const m1 = logger.metricsJSON();
  expect(m1.delivered).toBe(1);
  expect(m1.avgLatencyMs).toBe(50);
  expect(m1.count).toBe(1);
  expect(m1.errors).toBe(0);

  logger.delivery('terminal-2', 'another text', 150);
  const m2 = logger.metricsJSON();
  expect(m2.delivered).toBe(2);
  expect(m2.avgLatencyMs).toBe(100); // (50 + 150) / 2
  expect(m2.count).toBe(2);

  logger.deliveryFail('connection refused');
  const m3 = logger.metricsJSON();
  expect(m3.errors).toBe(1);
  expect(m3.delivered).toBe(2); // unchanged by failures
});
