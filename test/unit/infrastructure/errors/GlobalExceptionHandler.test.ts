/**
 * GlobalExceptionHandler 单元测试
 * 验证 uncaughtException / unhandledRejection 被正确记录，
 * 并在提供 app 时触发安全退出。
 */
import {
  installGlobalExceptionHandlers,
  restoreGlobalExceptionHandlers,
  GlobalExceptionLogger,
  GlobalExceptionApp,
} from '../../../../src/infrastructure/errors/GlobalExceptionHandler';

describe('GlobalExceptionHandler', () => {
  afterEach(() => {
    restoreGlobalExceptionHandlers();
  });

  function createLogger(): GlobalExceptionLogger {
    return {
      error: jest.fn(),
      destroy: jest.fn(),
    };
  }

  function createApp(): GlobalExceptionApp {
    return { quit: jest.fn() };
  }

  function emitUncaughtException(err: Error): void {
    process.emit('uncaughtException', err);
  }

  function emitUnhandledRejection(reason: unknown): void {
    (process as any).emit('unhandledRejection', reason);
  }

  test('logs uncaughtException to logger.error and destroys logger / quits app', () => {
    const logger = createLogger();
    const app = createApp();
    installGlobalExceptionHandlers(logger, app);

    const err = new Error('boom');
    emitUncaughtException(err);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('process', 'uncaughtException', {
      error: 'boom',
      stack: err.stack,
    });
    expect(logger.destroy).toHaveBeenCalled();
    expect(app.quit).toHaveBeenCalled();
  });

  test('logs uncaughtException without app when app is omitted', () => {
    const logger = createLogger();
    installGlobalExceptionHandlers(logger);

    emitUncaughtException(new Error('no app'));

    expect(logger.error).toHaveBeenCalledWith(
      'process',
      'uncaughtException',
      expect.objectContaining({ error: 'no app' }),
    );
    expect(logger.destroy).toHaveBeenCalled();
  });

  test('logs unhandledRejection to logger.error', () => {
    const logger = createLogger();
    installGlobalExceptionHandlers(logger);

    const reason = new Error('rejected');
    emitUnhandledRejection(reason);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('process', 'unhandledRejection', {
      reason: 'rejected',
    });
    expect(logger.destroy).not.toHaveBeenCalled();
  });

  test('logs unhandledRejection reason when not an Error', () => {
    const logger = createLogger();
    installGlobalExceptionHandlers(logger);

    emitUnhandledRejection('plain reason');

    expect(logger.error).toHaveBeenCalledWith('process', 'unhandledRejection', {
      reason: 'plain reason',
    });
  });
});
