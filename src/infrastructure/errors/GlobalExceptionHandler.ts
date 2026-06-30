/**
 * 全局异常兜底处理器。
 * 将 process 级 uncaughtException / unhandledRejection 集中处理，
 * 保证崩溃前记录完整日志并安全退出。
 */

export interface GlobalExceptionLogger {
  error(component: string, message: string, extra?: Record<string, unknown>): void;
  destroy(): void;
}

export interface GlobalExceptionApp {
  quit(): void;
}

let originalUncaughtException: NodeJS.UncaughtExceptionListener | undefined;
let originalUnhandledRejection: NodeJS.UnhandledRejectionListener | undefined;

/**
 * 安装全局异常处理器。
 * @param logger - 结构化日志器，需要 error 与 destroy 方法
 * @param app - 可选的 Electron app；提供时会在 uncaughtException 后调用 app.quit()
 */
export function installGlobalExceptionHandlers(
  logger: GlobalExceptionLogger,
  app?: GlobalExceptionApp,
): void {
  originalUncaughtException = (err: Error) => {
    logger.error('process', 'uncaughtException', {
      error: err.message,
      stack: err.stack,
    });
    logger.destroy();
    app?.quit();
  };

  originalUnhandledRejection = (reason: unknown) => {
    logger.error('process', 'unhandledRejection', {
      reason: reason instanceof Error ? reason.message : reason,
    });
  };

  process.on('uncaughtException', originalUncaughtException);
  process.on('unhandledRejection', originalUnhandledRejection);
}

/** 恢复安装前的 process 异常处理器（主要用于测试隔离）。 */
export function restoreGlobalExceptionHandlers(): void {
  if (originalUncaughtException) {
    process.removeListener('uncaughtException', originalUncaughtException);
    originalUncaughtException = undefined;
  }
  if (originalUnhandledRejection) {
    process.removeListener('unhandledRejection', originalUnhandledRejection);
    originalUnhandledRejection = undefined;
  }
}
