/**
 * Cron 字段匹配器。
 * 支持 `*`（任意）、`* / n`（步长）和具体数值。
 */
interface FieldMatcher {
  match(value: number): boolean;
}

function parseField(field: string): FieldMatcher {
  if (field === '*') {
    return { match: () => true };
  }
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (!Number.isFinite(step) || step <= 0) {
      throw new Error(`Invalid cron step: ${field}`);
    }
    return { match: (value) => value % step === 0 };
  }
  const exact = parseInt(field, 10);
  if (!Number.isFinite(exact)) {
    throw new Error(`Invalid cron field: ${field}`);
  }
  return { match: (value) => value === exact };
}

/** 已注册的 Cron 任务。 */
interface CronJob {
  expression: string;
  matchers: FieldMatcher[];
  callback: () => void;
  lastRunSecond?: number;
}

/**
 * 轻量级 Cron 调度器。
 * 默认每秒 tick 一次，匹配 `秒 分 时 日 月 周` 六字段表达式。
 */
export class CronScheduler {
  private jobs: CronJob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * @param tickMs - 检查任务的时间间隔，默认 1000ms
   */
  constructor(private tickMs = 1000) {}

  /**
   * 注册一个按 cron 表达式触发的任务。
   * @param expression - 六字段表达式，如 `* /5 * * * * *`
   * @param callback - 到点触发的回调
   */
  schedule(expression: string, callback: () => void): void {
    const fields = expression.trim().split(/\s+/);
    if (fields.length !== 6) {
      throw new Error(`Cron expression must have 6 fields, got: ${expression}`);
    }
    this.jobs.push({
      expression,
      matchers: fields.map(parseField),
      callback,
    });
  }

  /** 启动调度器。 */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  /** 停止调度器。 */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = new Date();
    const values = [
      now.getSeconds(),
      now.getMinutes(),
      now.getHours(),
      now.getDate(),
      now.getMonth() + 1,
      now.getDay(),
    ];

    for (const job of this.jobs) {
      const matches = job.matchers.every((m, i) => m.match(values[i]));
      const thisSecond = values[0];
      if (matches && job.lastRunSecond !== thisSecond) {
        job.lastRunSecond = thisSecond;
        try {
          job.callback();
        } catch {
          // 单个任务失败不应影响其它任务和调度器本身
        }
      }
    }
  }
}
