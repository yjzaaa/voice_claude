export interface AgentAPI {
  on(event: string, fn: (payload?: unknown) => void): void;
  removeAllListeners(event: string): void;
}

export interface StatusAPI {
  toggle(): void;
  onStateChange(fn: (recording: boolean) => void): void;
  removeAllListeners(): void;
}

export interface LoggerAPI {
  log(level: string, cmp: string, msg: string, extra?: unknown): void;
}

declare global {
  interface Window {
    agentAPI?: AgentAPI;
    statusAPI?: StatusAPI;
    loggerAPI?: LoggerAPI;
  }
}

export function getAgentAPI(): AgentAPI | null {
  return typeof window !== 'undefined' ? (window.agentAPI ?? null) : null;
}

export function getStatusAPI(): StatusAPI | null {
  return typeof window !== 'undefined' ? (window.statusAPI ?? null) : null;
}

export function getLoggerAPI(): LoggerAPI | null {
  return typeof window !== 'undefined' ? (window.loggerAPI ?? null) : null;
}
