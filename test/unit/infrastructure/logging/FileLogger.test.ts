import * as path from 'path';
import { FileLogger } from '../../../../src/infrastructure/logging/FileLogger';

const logPath = (component: string) => path.join('/logs', `${component}.log`);

interface FakeFsState {
  files: Record<string, string>;
}

function createFakeFs(state: FakeFsState) {
  return {
    existsSync: (p: string) => Object.prototype.hasOwnProperty.call(state.files, p),
    mkdirSync: () => {},
    appendFileSync: (p: string, data: string) => {
      state.files[p] = (state.files[p] ?? '') + data;
    },
    renameSync: (oldPath: string, newPath: string) => {
      state.files[newPath] = state.files[oldPath] ?? '';
      delete state.files[oldPath];
    },
    statSync: (p: string) => ({ size: Buffer.byteLength(state.files[p] ?? '') }),
  };
}

function createLogger(state: FakeFsState) {
  return new FileLogger({
    dir: '/logs',
    console: false,
    flushIntervalMs: 0,
    fs: createFakeFs(state) as any,
  });
}

describe('FileLogger', () => {
  test('writes info log to component file as JSON', async () => {
    const state: FakeFsState = { files: {} };
    const logger = createLogger(state);

    logger.info('router', 'resolved', { target: 'terminal-1' });
    await logger.flush();

    const lines = state.files[logPath('router')].trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.lvl).toBe('info');
    expect(entry.cmp).toBe('router');
    expect(entry.msg).toBe('resolved');
    expect(entry.target).toBe('terminal-1');
    expect(entry.ts).toMatch(/^\d{4}-/);

    await logger.destroy();
  });

  test('supports debug/warn/error levels', async () => {
    const state: FakeFsState = { files: {} };
    const logger = createLogger(state);

    logger.debug('asr', 'chunk');
    logger.warn('http', 'slow');
    logger.error('delivery', 'fail');
    await logger.flush();

    expect(JSON.parse(state.files[logPath('asr')].trim()).lvl).toBe('debug');
    expect(JSON.parse(state.files[logPath('http')].trim()).lvl).toBe('warn');
    expect(JSON.parse(state.files[logPath('delivery')].trim()).lvl).toBe('error');

    await logger.destroy();
  });

  test('respects minimum log level', async () => {
    const state: FakeFsState = { files: {} };
    const logger = new FileLogger({
      dir: '/logs',
      minLevel: 'warn',
      console: false,
      flushIntervalMs: 0,
      fs: createFakeFs(state) as any,
    });

    logger.debug('router', 'ignored');
    logger.info('router', 'ignored');
    logger.warn('router', 'kept');
    logger.error('router', 'kept');
    await logger.flush();

    const lines = state.files[logPath('router')].trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).lvl).toBe('warn');
    expect(JSON.parse(lines[1]).lvl).toBe('error');

    await logger.destroy();
  });

  test('prints to console when enabled', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new FileLogger({
      dir: '/logs',
      console: true,
      flushIntervalMs: 0,
      fs: createFakeFs({ files: {} }) as any,
    });
    logger.info('test', 'hello');
    await logger.flush();

    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0] as string;
    expect(JSON.parse(arg).msg).toBe('hello');
    spy.mockRestore();
    await logger.destroy();
  });

  test('rotates file when size exceeds maxSizeBytes', async () => {
    const state: FakeFsState = {
      files: {
        [logPath('router')]: 'x'.repeat(80) + '\n',
      },
    };
    const logger = new FileLogger({
      dir: '/logs',
      maxSizeBytes: 100,
      maxFiles: 2,
      console: false,
      flushIntervalMs: 0,
      fs: createFakeFs(state) as any,
    });

    logger.info('router', 'new entry');
    await logger.flush();

    expect(state.files[`${logPath('router')}.1`]).toBeTruthy();
    expect(state.files[logPath('router')]).toContain('new entry');

    await logger.destroy();
  });

  test('delivery metrics count delivered and latency', async () => {
    const logger = createLogger({ files: {} });
    logger.delivery('terminal-1', 'hello', 100);
    logger.delivery('terminal-2', 'world', 200);
    const metrics = logger.metricsJSON();
    expect(metrics.delivered).toBe(2);
    expect(metrics.count).toBe(2);
    expect(metrics.avgLatencyMs).toBe(150);
    expect(metrics.errors).toBe(0);
    await logger.destroy();
  });

  test('deliveryFail metrics count errors', async () => {
    const logger = createLogger({ files: {} });
    logger.deliveryFail('no window');
    const metrics = logger.metricsJSON();
    expect(metrics.errors).toBe(1);
    expect(metrics.delivered).toBe(0);
    await logger.destroy();
  });
});
