export interface AgentAPI {
  on(event: string, fn: (payload?: unknown) => void): void;
  removeAllListeners(event: string): void;
}

export interface PermissionRequestPayload {
  text: string;
  plan: {
    goal: string;
    steps: { tool: string; params?: Record<string, unknown>; reason?: string }[];
  };
  tools: string[];
}

export interface PermissionResponsePayload {
  allow: boolean;
  remember: boolean;
}

export interface PermissionAPI {
  onPermissionRequest(
    fn: (payload: PermissionRequestPayload & { requestId: string }) => void,
  ): void;
  respondPermission(payload: PermissionResponsePayload & { requestId: string }): void;
  removeAllListeners(): void;
}

export interface StatusAPI {
  toggle(): void;
  onStateChange(fn: (recording: boolean) => void): void;
  removeAllListeners(): void;
}

export interface LoggerAPI {
  log(level: string, cmp: string, msg: string, extra?: unknown): void;
}

export interface SettingsAPI {
  getPreferences(): Promise<Record<string, unknown>>;
  setPreferences(prefs: Record<string, unknown>): Promise<void>;
  getRiskWhitelist(): Promise<string[]>;
  addRiskWhitelist(tool: string): Promise<void>;
  removeRiskWhitelist(tool: string): Promise<void>;
  getRecentActions(): Promise<string[]>;
}

declare global {
  interface Window {
    agentAPI?: AgentAPI;
    permissionAPI?: PermissionAPI;
    statusAPI?: StatusAPI;
    loggerAPI?: LoggerAPI;
    settingsAPI?: SettingsAPI;
  }
}

export function getAgentAPI(): AgentAPI | null {
  return typeof window !== 'undefined' ? (window.agentAPI ?? null) : null;
}

export function getPermissionAPI(): PermissionAPI | null {
  return typeof window !== 'undefined' ? (window.permissionAPI ?? null) : null;
}

export function getStatusAPI(): StatusAPI | null {
  return typeof window !== 'undefined' ? (window.statusAPI ?? null) : null;
}

export function getLoggerAPI(): LoggerAPI | null {
  return typeof window !== 'undefined' ? (window.loggerAPI ?? null) : null;
}

export function getSettingsAPI(): SettingsAPI | null {
  return typeof window !== 'undefined' ? (window.settingsAPI ?? null) : null;
}
