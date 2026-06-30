import * as path from 'path';
import { Logger, LogLevel } from '../../ports/outgoing/Logger';

/** 文件系统最小子集，便于测试注入与轮换控制。 */
interface FileSystem {
  existsSync(p: string): boolean;
  mkdirSync(p: string, options?: { recursive?: boolean }): void;
  appendFileSync(p: string, data: string): void;
  renameSync(oldPath: string, newPath: string): void;
  statSync(p: string): { size: number };
}

interface BufferedLine {
  component: string;
  line: string;
}

interface FileLoggerOptions {
  /** 日志目录；默认项目根目录的 logs */
  dir?: string;
  /** 最低输出级别；默认 debug */
  minLevel?: LogLevel;
  /** 单个日志文件大小上限；默认 5MB */
  maxSizeBytes?: number;
  /** 保留轮转文件数；默认 3 */
  maxFiles?: number;
  /** 自动 flush 间隔；默认 1000ms，设为 0 则完全手动 */
  flushIntervalMs?: number;
  /** 是否同时输出到 console；默认 true */
  console?: boolean;
  /** 文件系统实现；默认 node fs */
  fs?: FileSystem;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * 结构化文件日志器。
 * 支持级别过滤、异步批量写入、单组件文件轮转。
 */
export class FileLogger implements Logger {
  private fs: FileSystem;
  private dir: string;
  private minLevel: LogLevel;
  private maxSizeBytes: number;
  private maxFiles: number;
  private useConsole: boolean;
  private buffer: BufferedLine[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushIntervalMs: number;

  private metrics = {
    delivered: 0,
    errors: 0,
    totalLatency: 0,
    count: 0,
  };

  constructor(options: FileLoggerOptions = {}) {
    this.fs = options.fs ?? (require('fs') as FileSystem);
    this.dir = options.dir ?? path.join(__dirname, '..', '..', '..', 'logs');
    this.minLevel = options.minLevel ?? 'debug';
    this.maxSizeBytes = options.maxSizeBytes ?? 5 * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 3;
    this.useConsole = options.console ?? true;
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;

    try {
      this.fs.mkdirSync(this.dir, { recursive: true });
    } catch {
      // 目录已存在或权限不足时继续，避免日志器构造失败导致整个应用起不来
    }
  }

  debug(component: string, message: string, extra?: Record<string, unknown>): void {
    this.enqueue('debug', component, message, extra);
  }

  info(component: string, message: string, extra?: Record<string, unknown>): void {
    this.enqueue('info', component, message, extra);
  }

  warn(component: string, message: string, extra?: Record<string, unknown>): void {
    this.enqueue('warn', component, message, extra);
  }

  error(component: string, message: string, extra?: Record<string, unknown>): void {
    this.enqueue('error', component, message, extra);
  }

  delivery(target: string, text: string, ms: number): void {
    this.metrics.delivered++;
    this.metrics.totalLatency += ms;
    this.metrics.count++;
    this.info('delivery', 'delivery success', { target, text: text.slice(0, 30), ms });
  }

  deliveryFail(reason: string): void {
    this.metrics.errors++;
    this.error('delivery', 'delivery failed', { reason });
  }

  metricsJSON(): Record<string, unknown> {
    return {
      delivered: this.metrics.delivered,
      errors: this.metrics.errors,
      avgLatencyMs: this.metrics.count
        ? Math.round(this.metrics.totalLatency / this.metrics.count)
        : 0,
      count: this.metrics.count,
    };
  }

  /** 立即把缓冲区落盘。 */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const pending = this.buffer;
    this.buffer = [];

    // 按组件分组，减少文件打开次数
    const grouped = new Map<string, string[]>();
    for (const { component, line } of pending) {
      if (!grouped.has(component)) grouped.set(component, []);
      grouped.get(component)!.push(line);
    }

    for (const [component, lines] of grouped) {
      const content = lines.join('\n') + '\n';
      const file = this.fileFor(component);
      try {
        this.rotateIfNeeded(file, content.length);
        this.fs.appendFileSync(file, content);
      } catch {
        // 日志写入失败不应阻断业务；console 已在入队时输出
      }
    }
  }

  /** 停止自动 flush 并立即落盘；退出前调用。 */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  private enqueue(
    level: LogLevel,
    component: string,
    message: string,
    extra: Record<string, unknown> = {},
  ): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;

    const entry = {
      ts: new Date().toISOString(),
      lvl: level,
      cmp: component,
      msg: message,
      ...extra,
    };
    const line = JSON.stringify(entry);

    if (this.useConsole) {
      // eslint-disable-next-line no-console
      console.log(line);
    }

    this.buffer.push({ component, line });

    // error 级别尽快落盘，其它级别按批量策略
    if (level === 'error') {
      this.scheduleFlush(0);
    } else if (this.flushIntervalMs > 0) {
      this.scheduleFlush(this.flushIntervalMs);
    }
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      try {
        this.flush();
      } catch {
        // 批量 flush 失败不应抛出
      }
    }, delay);
  }

  private fileFor(component: string): string {
    return path.join(this.dir, `${component}.log`);
  }

  private rotateIfNeeded(file: string, incomingBytes: number): void {
    if (!this.fs.existsSync(file)) return;
    const size = this.fs.statSync(file).size;
    if (size + incomingBytes <= this.maxSizeBytes) return;

    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const src = `${file}.${i}`;
      const dst = `${file}.${i + 1}`;
      if (this.fs.existsSync(src)) {
        try {
          this.fs.renameSync(src, dst);
        } catch {
          /* best-effort */
        }
      }
    }
    try {
      this.fs.renameSync(file, `${file}.1`);
    } catch {
      /* best-effort */
    }
  }
}
