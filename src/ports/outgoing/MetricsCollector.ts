export interface MetricsCollector {
  record(name: string, value: number, labels?: Record<string, string>): void;
  increment(name: string, labels?: Record<string, string>): void;
  getSnapshot(): Record<string, { count: number; sum: number; values: number[] } | number>;
}
