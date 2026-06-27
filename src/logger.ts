/**
 * 结构化日志模块 — JSON 格式 + 分级 + 指标
 */
import * as fs from 'fs';
import * as path from 'path';

type Level = 'debug'|'info'|'warn'|'error';

interface Entry {
  ts: string;
  lvl: Level;
  cmp: string;   // 组件名: router, delivery, http, registry, asr
  msg: string;
  [key: string]: any;
}

class Logger {
  private dir: string;
  private metrics = { delivered: 0, errors: 0, totalLatency: 0, count: 0 };

  constructor(dirpath?: string) {
    this.dir = dirpath || path.join(__dirname, '..', 'logs');
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch {}
  }

  private fileFor(cmp: string): string {
    return path.join(this.dir, `${cmp}.log`);
  }

  log(lvl: Level, cmp: string, msg: string, extra: Record<string,any> = {}) {
    const entry: Entry = { ts: new Date().toISOString(), lvl, cmp, msg, ...extra };
    const line = JSON.stringify(entry);
    console.log(line);
    try { fs.appendFileSync(this.fileFor(cmp), line + '\n'); } catch {}
  }

  debug(cmp: string, msg: string, extra?: Record<string,any>) { this.log('debug', cmp, msg, extra); }
  info (cmp: string, msg: string, extra?: Record<string,any>) { this.log('info',  cmp, msg, extra); }
  warn (cmp: string, msg: string, extra?: Record<string,any>) { this.log('warn',  cmp, msg, extra); }
  error(cmp: string, msg: string, extra?: Record<string,any>) { this.log('error', cmp, msg, extra); }

  // 投递指标
  delivery(target: string, text: string, ms: number) {
    this.metrics.delivered++;
    this.metrics.totalLatency += ms;
    this.metrics.count++;
    this.info('delivery', '投递成功', { target, text: text.slice(0,30), ms });
  }
  deliveryFail(reason: string) {
    this.metrics.errors++;
    this.error('delivery', '投递失败', { reason });
  }

  // HTTP 指标
  http(method: string, url: string, status: number, ms: number) {
    this.debug('http', `${method} ${url}`, { status, ms });
  }

  metricsJSON() {
    return {
      delivered: this.metrics.delivered,
      errors: this.metrics.errors,
      avgLatencyMs: this.metrics.count ? Math.round(this.metrics.totalLatency / this.metrics.count) : 0,
      count: this.metrics.count,
    };
  }
}

export const logger = new Logger();
