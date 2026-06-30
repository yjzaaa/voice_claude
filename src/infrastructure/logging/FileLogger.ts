import * as fs from 'fs';
import * as path from 'path';
import { Logger, LogLevel } from '../../ports/outgoing/Logger';

interface Entry {
  ts: string;
  lvl: LogLevel;
  cmp: string;
  msg: string;
  [key: string]: unknown;
}

export class FileLogger implements Logger {
  private dir: string;
  private metrics = {
    delivered: 0,
    errors: 0,
    totalLatency: 0,
    count: 0,
  };

  constructor(dirpath?: string) {
    this.dir = dirpath || path.join(__dirname, '..', '..', '..', 'logs');
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch {
      // best-effort
    }
  }

  private fileFor(component: string): string {
    return path.join(this.dir, `${component}.log`);
  }

  private log(level: LogLevel, component: string, message: string, extra: Record<string, unknown> = {}): void {
    const entry: Entry = {
      ts: new Date().toISOString(),
      lvl: level,
      cmp: component,
      msg: message,
      ...extra,
    };
    const line = JSON.stringify(entry);
    // eslint-disable-next-line no-console
    console.log(line);
    try {
      fs.appendFileSync(this.fileFor(component), line + '\n');
    } catch {
      // best-effort
    }
  }

  debug(component: string, message: string, extra?: Record<string, unknown>): void {
    this.log('debug', component, message, extra);
  }

  info(component: string, message: string, extra?: Record<string, unknown>): void {
    this.log('info', component, message, extra);
  }

  warn(component: string, message: string, extra?: Record<string, unknown>): void {
    this.log('warn', component, message, extra);
  }

  error(component: string, message: string, extra?: Record<string, unknown>): void {
    this.log('error', component, message, extra);
  }

  delivery(target: string, text: string, ms: number): void {
    this.metrics.delivered++;
    this.metrics.totalLatency += ms;
    this.metrics.count++;
    this.info('delivery', '投递成功', { target, text: text.slice(0, 30), ms });
  }

  deliveryFail(reason: string): void {
    this.metrics.errors++;
    this.error('delivery', '投递失败', { reason });
  }

  metricsJSON(): Record<string, unknown> {
    return {
      delivered: this.metrics.delivered,
      errors: this.metrics.errors,
      avgLatencyMs: this.metrics.count ? Math.round(this.metrics.totalLatency / this.metrics.count) : 0,
      count: this.metrics.count,
    };
  }
}
