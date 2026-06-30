/**
 * Logger port — structured logging interface used by all layers.
 * Implementations decide where logs are written (file, console, remote, etc.).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(component: string, message: string, extra?: Record<string, unknown>): void;
  info(component: string, message: string, extra?: Record<string, unknown>): void;
  warn(component: string, message: string, extra?: Record<string, unknown>): void;
  error(component: string, message: string, extra?: Record<string, unknown>): void;

  /** Delivery-specific metrics helpers */
  delivery(target: string, text: string, ms: number): void;
  deliveryFail(reason: string): void;

  /** Expose current metrics as a plain object */
  metricsJSON(): Record<string, unknown>;
}
