# voice_claude Agent 协作规范

> 项目级上下文文档。每次写代码前请先阅读本文件，确保对架构、边界和当前状态有共同理解。

## 项目目标

Windows 语音输入助手：点击麦克风 → 录制 → Doubao ASR → LLM 意图识别 → 将文字送到正确的 Claude/Code 窗口。

当前已实现 Doubao ASR 端到端联通，正在进行重新架构，目标是把 `src/main.ts`、`src/instance/router.ts`、`src/platform/win32.ts` 等 God Object 拆分成清晰的分层结构。

## 架构分层

```
┌─────────────────────────────────────────────┐
│  Presentation 层（Electron UI / IPC / 托盘） │
├─────────────────────────────────────────────┤
│  Application 层（用例 / 事件编排）            │
├─────────────────────────────────────────────┤
│  Domain 层（路由、意图、窗口模型、Schema）    │
├─────────────────────────────────────────────┤
│  Ports 层（接口契约）                         │
├─────────────────────────────────────────────┤
│  Adapters 层（ASR / 平台 / LLM / 配置）       │
├─────────────────────────────────────────────┤
│  Infrastructure 层（日志、HTTP、持久化）      │
└─────────────────────────────────────────────┘
```

### 各层职责

1. **Presentation**：Electron 主窗口、托盘图标、preload 脚本、HTML 页面。
2. **Application**：用例编排（`RecordAndTranscribe`、`DeliverText`、`ManageWindows`）和内部 `EventBus`。
3. **Domain**：纯业务逻辑——`Router`、`IntentClassifier`、`CommandParser`、`WindowRepository`、模型定义。
4. **Ports**：所有外部能力接口（`AsrEngine`、`WindowManager`、`InputSimulator`、`Clipboard`、`ProcessLauncher`、`LlmClient`、`ConfigSource`、`AudioCapture`、`Logger`、`MetricsCollector`）。
5. **Adapters**：平台/后端实现（`DoubaoAsrEngine`、`Win32WindowManager`、`DeepSeekLlmClient` 等）。
6. **Infrastructure**：`FileLogger`、`HttpServer`、`ElectronIpcBus`、`InMemoryMetrics`。

## 核心规则

- **层间使用事件驱动解耦**：`Domain` / `Application` 只依赖 `EventBus` 和 `Ports` 接口，禁止直接 import 具体实现。
- **Electron 不出现在 Domain/Application**：只有 `presentation` 和 `infrastructure/ipc` 允许 import `electron`。
- **Node/HTTP 不出现在 Domain/Application**：网络、文件、进程调用必须封装在 Adapter 或 Infrastructure 中。
- **Adapters 实现 Ports，由 `composition-root.ts` 注入**：`src/composition-root.ts` 是项目唯一的依赖注入/装配点。
- **所有配置、密钥通过 `ConfigSource` 读取**：禁止把 API key / token / 代理地址硬编码在源码中。
- **每完成一个 Phase 必须保证 `npm run build` 与 `npm start` 能跑**：采用 strangler fig 方式，旧代码逐步被新代码替换，不能一次性炸掉。

## 关键文件

| 文件 | 说明 |
|------|------|
| `src/composition-root.ts` | 唯一装配点，所有 Adapter/Service 在这里实例化和连接。 |
| `src/application/events/EventBus.ts` | 内部事件总线，层间通信核心。 |
| `src/ports/incoming/*.ts` | 所有外部能力接口。 |
| `src/adapters/asr/DoubaoAsrEngine.ts` | 已验证的 Doubao ASR 协议，**不要随意改动协议解析逻辑**。 |
| `src/adapters/audio/ElectronAudioCapture.ts` | 录音与 VAD，事件化输出 PCM。 |
| `src/domain/services/IntentClassifier.ts` | LLM 统一命令意图识别。 |
| `src/domain/repositories/WindowRepository.ts` | 窗口生命周期与 Schema 持久化。 |

## 事件清单

| 事件 | 发布者 | 消费者 | 说明 |
|------|--------|--------|------|
| `recording:toggle` | TrayManager / status.html | ElectronAudioCapture | 开始/停止录音 |
| `recording:started` / `recording:stopped` | ElectronAudioCapture | TrayManager, MainWindow | 状态同步 |
| `audio:pcm` | ElectronAudioCapture | RecordAndTranscribe | 每段 PCM 或整段录音 |
| `asr:text` | AsrEngine | RecordAndTranscribe | ASR 识别结果 |
| `command:intent` | IntentClassifier | RecordAndTranscribe | LLM 解析出的命令 |
| `window:scan` / `window:changed` / `window:destroyed` | WindowRepository | MainWindow, Router | 窗口列表变化 |
| `delivery:request` | RecordAndTranscribe | DeliverText | 需要投递文本 |
| `delivery:success` / `delivery:failed` | DeliverText | MainWindow, Logger, Metrics | 投递结果 |
| `app:ready` / `app:before-quit` | AppLifecycle | 各模块 | 生命周期 |

**Electron IPC 仅作为事件总线的外层桥接**：`ElectronIpcBus` 监听 Electron IPC 消息，转成内部事件；内部事件需要通知 UI 时，也经它发送 IPC。

## 配置来源

- 环境变量：以 `VOICE_CLAUDE_` 为前缀。
- 用户配置文件：`~/.voice_claude.json`。
- 开发时可用 `.env` 文件（不提交到仓库）。
- **禁止**在 TypeScript 源码中写死 API key、token、代理地址。

## 当前状态

- Doubao ASR 已联通，录音链路工作正常。
- 旧代码仍运行在 `src/main.ts`、`src/instance/*`、`src/platform/*`。
- 新架构目录和 Ports 正在建立（Phase 1）。
- 旧文件中的死代码：
  - `src/win32/win32.ts`（PowerShell 桥，未使用）
  - `capture.html`（与 recorder.html 重复）
  - `src/asr/vosk.ts` / `vosk.html`（未接入主流程，但保留作为后续 `VoskAsrEngine`）

## 开发纪律

### TDD（测试驱动开发）

- **先写测试，再写实现**。每个新功能、每个 bug 修复、每次重构都必须由失败的测试开始。
- 流程：**RED** → 运行确认测试因正确原因失败 → **GREEN** → 最小实现通过 → **REFACTOR** → 保持绿灯。
- 不允许“先写代码再补测试”。如果已有代码没有测试，视为技术债务，必须补测试或删除。
- 单元测试放在 `test/unit/<对应路径>/`；集成测试放在 `test/integration/`。
- 每个测试文件命名：`*.test.ts`。

### 依赖倒置原则（Dependency Inversion）

- **Domain / Application 层只依赖抽象（Ports + EventBus），不依赖具体实现。**
- **Adapters 依赖 Ports 并实现它们。**
- 禁止在 Domain/Application 中直接 import Electron、Node `https`、文件系统、剪贴板等具体能力。
- 所有外部依赖（ASR、窗口管理、LLM、配置、日志）都必须通过 Port 注入。

### 可追溯性

- 每个可交付成果（功能、修复、重构）都必须有：
  1. **清晰的测试用例**（证明行为正确）
  2. **日志/文档记录**（说明做了什么、为什么、如何验证）
- 使用 TaskCreate / TaskUpdate 跟踪每个子任务状态。
- 每个 Phase 完成后，必须在该 Phase 的测试目录下留下可运行的验收测试。

### 代码提交前检查

- `npm run build` 通过（TypeScript 无错误）。
- `npm run test:unit` 通过。
- `npm run test:asr` 通过（如修改了 ASR 链路）。
- 没有新引入的 `console.log`（测试中的 `jest.fn` 除外）。
- 没有硬编码密钥或凭证。

## 实施阶段速查（详见 docs/spec.md）

1. **Phase 1**：端口 + 基础设施 + DI（保持旧代码运行）
2. **Phase 2**：平台适配器拆分
3. **Phase 3**：ASR 适配器 + 音频捕获
4. **Phase 4**：意图识别 + 路由 + 投递
5. **Phase 5**：HTTP + 表现层 + 事件总线桥接
6. **Phase 6**：Python 脚本替换为 koffi（可选）
7. **Phase 7**：清理 + 文档 + 测试

详细阶段目标、验收标准、文件映射和测试策略见 `docs/spec.md`。

## 常见陷阱

- 不要把 `Domain` / `Application` 写成直接调用 Electron 或 `clipboard`。
- 不要在新代码里使用 `hwnd` 这种平台相关命名；Port 层使用 `windowId`。
- 不要把 LLM 调用直接塞进 `WindowRepository` 或 `Router`；统一走 `LlmClient` port。
- 不要在新架构中复用 `src/win32/win32.ts`；它是旧实验代码。
- 每次重构后必须验证 `npm run build` 和 `npm start`。
- 不要跳过 RED 阶段；如果测试没有先失败，说明测试可能没测到正确的东西。

## 调试

- 日志目录：`logs/`，按组件分文件，JSON 格式。
- HTTP 状态：`GET http://127.0.0.1:9877/status`
- 手动触发投递：`POST http://127.0.0.1:9877/send {"text":"..."}`
- 手动 ASR：`POST http://127.0.0.1:9877/asr`（raw PCM）
- 运行单个测试：`npx jest --testPathPatterns='test/unit/application/events/EventBus.test.ts'`
- 运行全部单元测试：`npx jest --testPathPatterns='test/unit'`

## 参考

- 完整架构计划：`.claude/plans/golden-percolating-stardust.md`
- 实施规范：`docs/spec.md`
