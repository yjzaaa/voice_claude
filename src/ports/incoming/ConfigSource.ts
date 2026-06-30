export interface DoubaoConfig {
  appId: string;
  accessToken: string;
  resourceId: string;
  proxyHost?: string;
  proxyPort?: number;
}

export interface LlmConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
}

export interface AsrConfig {
  backend: string;
  language: string;
  sampleRate: number;
}

export interface RoutingConfig {
  strategy: string;
  defaultTarget: string;
}

export interface WindowManagerConfig {
  scanIntervalMs: number;
}

export interface AppConfig {
  asr: AsrConfig;
  llm: LlmConfig;
  routing: RoutingConfig;
  doubao: DoubaoConfig;
  windowManager: WindowManagerConfig;
}

export interface ConfigSource {
  load(): AppConfig;
}
