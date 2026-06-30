import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileLogger } from '../../../../src/infrastructure/logging/FileLogger';

describe('FileLogger', () => {
  let logDir: string;
  let logger: FileLogger;

  beforeEach(() => {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-claude-logger-'));
    logger = new FileLogger(logDir);
  });

  afterEach(() => {
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  test('writes info log to component file as JSON', () => {
    logger.info('router', 'resolved', { target: 'terminal-1' });
    const file = path.join(logDir, 'router.log');
    expect(fs.existsSync(file)).toBe(true);
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.lvl).toBe('info');
    expect(entry.cmp).toBe('router');
    expect(entry.msg).toBe('resolved');
    expect(entry.target).toBe('terminal-1');
    expect(entry.ts).toMatch(/^\d{4}-/);
  });

  test('supports debug/warn/error levels', () => {
    logger.debug('asr', 'chunk');
    logger.warn('http', 'slow');
    logger.error('delivery', 'fail');
    expect(JSON.parse(fs.readFileSync(path.join(logDir, 'asr.log'), 'utf-8').trim()).lvl).toBe('debug');
    expect(JSON.parse(fs.readFileSync(path.join(logDir, 'http.log'), 'utf-8').trim()).lvl).toBe('warn');
    expect(JSON.parse(fs.readFileSync(path.join(logDir, 'delivery.log'), 'utf-8').trim()).lvl).toBe('error');
  });

  test('prints to console', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('test', 'hello');
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0] as string;
    expect(JSON.parse(arg).msg).toBe('hello');
    spy.mockRestore();
  });

  test('delivery metrics count delivered and latency', () => {
    logger.delivery('terminal-1', 'hello', 100);
    logger.delivery('terminal-2', 'world', 200);
    const metrics = logger.metricsJSON();
    expect(metrics.delivered).toBe(2);
    expect(metrics.count).toBe(2);
    expect(metrics.avgLatencyMs).toBe(150);
    expect(metrics.errors).toBe(0);
  });

  test('deliveryFail metrics count errors', () => {
    logger.deliveryFail('no window');
    const metrics = logger.metricsJSON();
    expect(metrics.errors).toBe(1);
    expect(metrics.delivered).toBe(0);
  });
});
