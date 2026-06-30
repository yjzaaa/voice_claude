import { MetricsCollector } from '../../ports/outgoing/MetricsCollector';

export class InMemoryMetrics implements MetricsCollector {
  private distributions = new Map<string, number[]>();
  private counters = new Map<string, number>();

  record(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const values = this.distributions.get(key) || [];
    values.push(value);
    this.distributions.set(key, values);
  }

  increment(name: string, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  getSnapshot(): Record<string, { count: number; sum: number; values: number[] } | number> {
    const snapshot: Record<string, { count: number; sum: number; values: number[] } | number> = {};
    for (const [key, values] of this.distributions) {
      snapshot[key] = { count: values.length, sum: values.reduce((a, b) => a + b, 0), values: [...values] };
    }
    for (const [key, count] of this.counters) {
      snapshot[key] = count;
    }
    return snapshot;
  }

  private key(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return labelStr ? `${name}|${labelStr}` : name;
  }
}
