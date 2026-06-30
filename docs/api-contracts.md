# voice_claude API 契约

> 本文档汇总 voice_claude 各模块之间的接口契约：EventBus 事件、preload 暴露 API、Port 接口、配置项。

## 1. EventBus 事件

`EventBus` 是应用内部解耦层的主要通信机制。所有事件名与 payload 约定如下。

### 1.1 Agent 生命周期事件

| 事件名 | 发布时机 | Payload |
|---|---|---|
| `agent:transcribing` | ASR 开始识别 | `undefined` |
| `agent:planning` | LLM 规划开始 | `{ text: string }` |
| `agent:acting` | 计划已通过风险检查，开始执行 | `{ plan: ClassifiedPlan }` |
| `agent:success` | 计划全部执行成功 | `{ text: string; plan: ClassifiedPlan }` |
| `agent:ignored` | 低置信度、非指令或空识别 | `{ text?: string; reason?: string }` |
| `agent:needs-human` | 高风险但无法自动执行，需要人工介入 | `{ text: string; plan: ClassifiedPlan }` |
| `agent:step-failed` | 某一步执行失败且重试耗尽 | `{ text: string; plan: ClassifiedPlan; result: PlanExecutionResult }` |
| `agent:plan-failed` | Planner 调用或上下文获取失败 | `{ text: string; error: string }` |
| `agent:permission-request` | 高风险操作请求用户授权 | `{ text: string; plan: ClassifiedPlan; tools: string[] }` |

### 1.2 录音与状态事件

| 事件名 | 发布时机 | Payload |
|---|---|---|
| `status:state` | 录音状态变化 | `boolean`（是否录音中） |
| `recorder:start` | 录音器开始 | `undefined` |
| `recorder:stop` | 录音器停止 | `undefined` |

### 1.3 Payload 类型定义

```typescript
interface ClassifiedPlan {
  goal: string;
  steps: Array<{
    tool: string;
    params: unknown;
    reason?: string;
    risk: 'read' | 'low' | 'medium' | 'high';
  }>;
  canAutoExecute: boolean;
}

interface PlanExecutionResult {
  status: 'success' | 'step-failed';
  failedStep?: {
    tool: string;
    params: unknown;
    risk?: string;
  };
  error?: unknown;
}
```

## 2. preload 暴露的 API

`src/preload.ts` 通过 `contextBridge` 向 renderer 暴露以下命名空间。

### 2.1 `window.voiceAPI`

```typescript
interface VoiceAPI {
  send(text: string): void; // ipcRenderer.send('voice:text', text)
}
```

### 2.2 `window.agentAPI`

```typescript
interface AgentAPI {
  on(event: string, fn: (...args: any[]) => void): void;
  removeAllListeners(event: string): void;
}
```

- `on('transcribing', ...)`
- `on('planning', ...)`
- `on('acting', ...)`
- `on('success', ...)`
- `on('ignored', ...)`
- `on('needs-human', ...)`
- `on('step-failed', ...)`
- `on('plan-failed', ...)`
- `on('permission-request', ...)`

### 2.3 `window.recorderAPI`

```typescript
interface RecorderAPI {
  ready(): void;
  sendPcm(buffer: ArrayBuffer): void;
  onStart(fn: () => void): void;
  onStop(fn: () => void): void;
  removeAllListeners(): void;
}
```

### 2.4 `window.statusAPI`

```typescript
interface StatusAPI {
  toggle(): void; // 切换录音状态
  onStateChange(fn: (recording: boolean) => void): void;
  removeAllListeners(): void;
}
```

### 2.5 `window.loggerAPI`

```typescript
interface LoggerAPI {
  log(level: string, cmp: string, msg: string, extra?: any): void;
}
```

## 3. Port 接口契约

### 3.1 ASR 引擎

`src/ports/incoming/AsrEngine.ts`

```typescript
export interface AsrEngine {
  readonly name: string;
  transcribe(audio: Buffer, sampleRate: number): Promise<string | null>;
  isAvailable(): boolean | Promise<boolean>;
}
```

### 3.2 LLM 客户端

`src/ports/incoming/LlmClient.ts`

```typescript
export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
}

export interface LlmClient {
  complete(req: LlmRequest, timeoutMs?: number): Promise<string | null>;
}
```

### 3.3 工具

`src/domain/services/ToolRegistry.ts`

```typescript
export type ToolRisk = 'read' | 'low' | 'medium' | 'high';

export interface Tool {
  name: string;
  description: string;
  parameters: object; // JSON Schema
  risk: ToolRisk;
  execute(params: unknown): Promise<unknown>;
}
```

### 3.4 Logger

`src/ports/outgoing/Logger.ts`

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(component: string, message: string, extra?: Record<string, unknown>): void;
  info(component: string, message: string, extra?: Record<string, unknown>): void;
  warn(component: string, message: string, extra?: Record<string, unknown>): void;
  error(component: string, message: string, extra?: Record<string, unknown>): void;

  delivery(target: string, text: string, ms: number): void;
  deliveryFail(reason: string): void;
  metricsJSON(): Record<string, unknown>;
}
```

### 3.5 MemoryStore

`src/ports/outgoing/MemoryStore.ts`

```typescript
export interface MemoryStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}
```

### 3.6 AuditLogger

`src/ports/outgoing/AuditLogger.ts`

```typescript
export interface AuditEntry {
  timestamp: number;
  triggerText: string;
  response: {
    isCommand: boolean;
    confidence: number;
    plan?: { goal: string; steps: Array<{ tool: string; params: unknown; reason?: string }> };
    reason?: string;
  };
  executionResult: {
    status: 'success' | 'step-failed';
    failedStep?: { tool: string; params: unknown; risk?: string };
    error?: string;
  };
}

export interface AuditLogger {
  log(entry: AuditEntry): void;
}
```

## 4. 安全配置项

配置由 `EnvConfigSource` 与 `FileConfigSource` 叠加产生，环境变量优先级高于文件。

### 4.1 配置结构

```typescript
interface AppConfig {
  asr: {
    backend: string;     // 默认 'doubao'
    language: string;    // 默认 'zh-CN'
    sampleRate: number;  // 默认 16000
  };
  llm: {
    apiKey: string;      // 默认 ''
    apiUrl: string;      // 默认 'https://api.deepseek.com/v1'
    model: string;       // 默认 'deepseek-chat'
    timeoutMs: number;   // 默认 5000
  };
  routing: {
    strategy: string;    // 默认 'llm'
    defaultTarget: string; // 默认 'terminal'
  };
  doubao: {
    appId: string;
    accessToken: string;
    resourceId: string;
    proxyHost?: string;
    proxyPort?: number;
  };
  windowManager: {
    scanIntervalMs: number; // 默认 5000
  };
}
```

### 4.2 环境变量映射

| 环境变量 | 配置路径 | 说明 |
|---|---|---|
| `VOICE_CLAUDE_ASR_BACKEND` | `asr.backend` | ASR 后端 |
| `VOICE_CLAUDE_ASR_LANGUAGE` | `asr.language` | 识别语言 |
| `VOICE_CLAUDE_ASR_SAMPLE_RATE` | `asr.sampleRate` | 音频采样率 |
| `VOICE_CLAUDE_LLM_API_KEY` | `llm.apiKey` | LLM API Key |
| `VOICE_CLAUDE_LLM_API_URL` | `llm.apiUrl` | LLM 基础 URL |
| `VOICE_CLAUDE_LLM_MODEL` | `llm.model` | 模型名 |
| `VOICE_CLAUDE_LLM_TIMEOUT_MS` | `llm.timeoutMs` | LLM 超时 |
| `VOICE_CLAUDE_ROUTING_STRATEGY` | `routing.strategy` | 路由策略 |
| `VOICE_CLAUDE_ROUTING_DEFAULT_TARGET` | `routing.defaultTarget` | 默认目标窗口 |
| `VOICE_CLAUDE_DOUBAO_APP_ID` | `doubao.appId` | 豆包 App ID |
| `VOICE_CLAUDE_DOUBAO_ACCESS_TOKEN` | `doubao.accessToken` | 豆包 Access Token |
| `VOICE_CLAUDE_DOUBAO_RESOURCE_ID` | `doubao.resourceId` | 豆包 Resource ID |
| `VOICE_CLAUDE_DOUBAO_PROXY_HOST` | `doubao.proxyHost` | 豆包代理主机 |
| `VOICE_CLAUDE_DOUBAO_PROXY_PORT` | `doubao.proxyPort` | 豆包代理端口 |
| `VOICE_CLAUDE_WM_SCAN_INTERVAL_MS` | `windowManager.scanIntervalMs` | 窗口扫描间隔 |
| `VOICE_CLAUDE_PYTHON_PATH` | — | Python 可执行路径（composition-root 直接使用） |

### 4.3 文件配置

默认读取 `~/.voice_claude.json`，JSON 结构同 `AppConfig`。文件不存在时回退到默认值。

```json
{
  "asr": { "backend": "doubao", "language": "zh-CN", "sampleRate": 16000 },
  "llm": {
    "apiKey": "sk-...",
    "apiUrl": "https://api.deepseek.com/v1",
    "model": "deepseek-chat",
    "timeoutMs": 5000
  },
  "routing": { "strategy": "llm", "defaultTarget": "terminal" },
  "doubao": {
    "appId": "...",
    "accessToken": "...",
    "resourceId": "..."
  },
  "windowManager": { "scanIntervalMs": 5000 }
}
```

## 5. 安全注意事项

- **API Key**：`llm.apiKey` 与 `doubao.accessToken` 应通过环境变量或用户私有配置文件提供，禁止提交到版本控制。
- **高风险工具**：`close_window`、`launch_process` 等被标记为 `high` / `medium` 风险，执行前必须通过系统对话框或白名单获得用户授权。
- **白名单**：`riskWhitelist` 保存在 `.voice_claude.memory.json` 中，持久化用户“始终允许”的高风险工具。
- **全局异常**：`uncaughtException` 记录日志并调用 `app.quit()`，防止应用在不可恢复状态下继续运行。

## 6. 旧版 HTTP API（src/main.ts）

旧入口保留以下端点用于兼容：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 返回 speech.html |
| GET | `/status` | 当前窗口状态 `{ target, count, windows }` |
| POST | `/send` | 投递语音文字 `{ text }` → `{ ok, target }` |
| GET | `/metrics` | 返回日志指标 |
| POST | `/asr` | PCM 音频识别 fallback |
| GET/POST | `/fixtures/*` | ASR 测试 fixture 管理 |

## 7. 相关文档

- `docs/architecture.md` — 分层架构与数据流。
- `DESIGN.md` — 设计决策与旧版组件交互。
- `TEST_PLAN.md` — 测试策略。
