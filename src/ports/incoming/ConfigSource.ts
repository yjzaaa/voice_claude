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

export interface AsrVadConfig {
  /** 16-bit PCM 峰值阈值，超过视为有声 */
  silenceThreshold: number;
  /** 静音超过此毫秒数自动停止录音 */
  minSpeechDurationMs: number;
  /** 最长录制时间，超过此毫秒数强制停止 */
  maxSpeechDurationMs: number;
}

export interface AsrConfig {
  backend: string;
  language: string;
  sampleRate: number;
  vad: AsrVadConfig;
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
