# voice_claude 实施规范（Spec）

> 本文档把重新架构的 7 个 Phase 细化成可执行、可验收的规范。每个 Phase 包含：目标、文件映射、测试要求、日志/文档要求、验收标准。

## 总体原则

- **TDD**：每个功能由失败的测试开始（RED → GREEN → REFACTOR）。
- **依赖倒置**：Domain/Application 只依赖 Ports + EventBus；Adapters 实现 Ports。
- **事件驱动**：层间通过 `EventBus` 事件通信，禁止跨层直接 import 实现。
- **可追溯**：每个 Phase 必须有测试用例和 `docs/progress/phase-N.md` 进展记录。
- **持续可运行**：每个 Phase 结束后 `npm run build` 和 `npm start` 必须仍然成功。

---

## Phase 1：端口 + 基础设施 + DI

### 目标

建立新架构的骨架：目录结构、所有 Ports 接口、事件总线、日志、配置、指标收集器，以及最初版本的 `composition-root.ts`。旧代码保持运行，新代码与旧代码并行存在。

### 新增/修改文件

| 路径 | 说明 |
|------|------|
| `src/application/events/EventBus.ts` | 内部事件总线（已完成）。 |
| `src/ports/outgoing/Logger.ts` | 日志接口。 |
| `src/ports/outgoing/MetricsCollector.ts` | 指标接口。 |
| `src/ports/incoming/ConfigSource.ts` | 配置读取接口。 |
| `src/ports/incoming/AsrEngine.ts` | ASR 引擎接口。 |
| `src/ports/incoming/AudioCapture.ts` | 音频采集接口。 |
| `src/ports/incoming/WindowManager.ts` | 窗口管理接口。 |
| `src/ports/incoming/InputSimulator.ts` | 按键模拟接口。 |
| `src/ports/incoming/Clipboard.ts` | 剪贴板接口。 |
| `src/ports/incoming/ProcessLauncher.ts` | 进程启动接口。 |
| `src/ports/incoming/LlmClient.ts` | LLM 客户端接口。 |
| `src/infrastructure/logging/FileLogger.ts` | `Logger` 实现。 |
| `src/infrastructure/metrics/InMemoryMetrics.ts` | `MetricsCollector` 实现。 |
| `src/adapters/config/EnvConfigSource.ts` | 从环境变量读取配置。 |
| `src/adapters/config/FileConfigSource.ts` | 从 `~/.voice_claude.json` 读取配置。 |
| `src/composition-root.ts` | 装配点，先注入 Logger + ConfigSource。 |
| `test/unit/application/events/EventBus.test.ts` | 事件总线测试。 |
| `test/unit/infrastructure/logging/FileLogger.test.ts` | 日志测试。 |
| `test/unit/adapters/config/*.test.ts` | 配置测试。 |

### 测试要求

- `EventBus`：订阅/发布/取消订阅/多监听器/异常隔离。
- `FileLogger`：按组件写入独立 JSON 文件；支持 debug/info/warn/error；包含时间戳。
- `EnvConfigSource`：读取 `VOICE_CLAUDE_*` 环境变量；未设置时返回默认值或 undefined。
- `FileConfigSource`：读取 JSON 文件；文件不存在时不抛错。
- `composition-root.ts`：能成功创建服务实例；配置源可被替换。

### 日志/文档要求

- 在 `docs/progress/phase-1.md` 记录：
  - 完成了哪些接口和实现；
  - 测试覆盖率；
  - 遇到的问题（如 Jest 配置、路径解析等）。

### 验收标准

- `npx jest --testPathPatterns='test/unit' --testTimeout=30000` 全部通过。
- `npm run build` 无 TypeScript 错误。
- `AGENTS.md` 和 `docs/spec.md` 已更新。

---

## Phase 2：平台适配器拆分

### 目标

把 `src/platform/win32.ts` 拆成四个聚焦的 Adapter：`Win32WindowManager`、`Win32InputSimulator`、`Win32Clipboard`、`Win32ProcessLauncher`。Darwin/Linux 实现迁移到对应目录。

### 新增/修改文件

| 路径 | 说明 |
|------|------|
| `src/adapters/platform/win32/Win32WindowManager.ts` | find/focus/close/getActive/watchEvents。 |
| `src/adapters/platform/win32/Win32InputSimulator.ts` | sendKeys / pasteAndEnter。 |
| `src/adapters/platform/win32/Win32Clipboard.ts` | 剪贴板读写。 |
| `src/adapters/platform/win32/Win32ProcessLauncher.ts` | 启动终端并返回窗口 ID。 |
| `src/adapters/platform/darwin/*.ts` | 迁移现有 Darwin 实现。 |
| `src/adapters/platform/linux/*.ts` | 迁移现有 Linux 实现。 |
| `test/unit/adapters/platform/win32/*.test.ts` | 各 Win32 适配器单元测试（mock Python/koffi）。 |

### 测试要求

- `Win32WindowManager.findWindows()` 正确解析 Python 脚本输出。
- `Win32WindowManager.focusWindow(id)` 调用正确脚本并处理错误。
- `Win32InputSimulator.sendKeys('ctrl','v')` 产生正确虚拟键码序列。
- `Win32Clipboard.writeText('hello')` 写入剪贴板（可 mock）。
- `Win32ProcessLauncher.launchTerminal('title')` 返回窗口 ID 或 null。

### 日志/文档要求

- `docs/progress/phase-2.md`：记录平台拆分后的接口签名、错误处理策略、mock 方案。

### 验收标准

- 所有 Win32 适配器单元测试通过。
- `composition-root.ts` 装配新平台适配器，但 `main.ts` 仍走旧 `Platform`。
- `npm run build` 通过。

---

## Phase 3：ASR 适配器 + 音频捕获

### 目标

把 `src/asr/doubao.ts` 提取为 `DoubaoAsrEngine`，`src/asr/recorder.ts` 提取为 `ElectronAudioCapture`（事件化），并引入 `AsrEngineFactory` / `CompositeAsrEngine`。保留 Vosk 作为可选后端。

### 新增/修改文件

| 路径 | 说明 |
|------|------|
| `src/adapters/asr/DoubaoAsrEngine.ts` | 保留现有协议逻辑，注入配置。 |
| `src/adapters/asr/VoskAsrEngine.ts` | 从 `src/asr/vosk.ts` 提取。 |
| `src/adapters/asr/ChromeAsrEngine.ts` | Web Speech API 后端（可选）。 |
| `src/adapters/asr/CompositeAsrEngine.ts` | 按优先级尝试各引擎。 |
| `src/adapters/asr/AsrEngineFactory.ts` | 根据配置创建 ASR 引擎。 |
| `src/adapters/audio/ElectronAudioCapture.ts` | 管理 hidden window，事件化输出 PCM。 |
| `src/presentation/html/recorder.html` | 从 `src/asr/recorder.html` 移动。 |
| `test/unit/adapters/asr/*.test.ts` | ASR 适配器 mock 测试。 |
| `test/unit/adapters/audio/ElectronAudioCapture.test.ts` | 音频捕获测试（mock BrowserWindow）。 |

### 测试要求

- `DoubaoAsrEngine.transcribe` 在 mock socket 返回结果时输出正确文本。
- `CompositeAsrEngine` 在主引擎失败时 fallback 到次引擎。
- `ElectronAudioCapture` 开始/停止录音时发出正确事件；PCM 通过 `audio:pcm` 事件发出。
- `AsrEngineFactory` 根据配置返回正确引擎实例。

### 日志/文档要求

- `docs/progress/phase-3.md`：记录 ASR 协议保留部分、配置注入方式、录音事件流。

### 验收标准

- `npm run test:asr` 通过（真实 Doubao 调用）。
- 端到端语音输入：点击录音 → 说话 → 文本仍能被识别。
- `npm run build` 通过。

---

## Phase 4：意图识别 + 路由 + 投递

### 目标

实现 LLM 统一命令解析（`IntentClassifier`）、纯路由（`Router`）、窗口仓库（`WindowRepository`）、投递用例（`DeliverText`）和窗口管理用例（`ManageWindows`）。解决“创建一个开发 agent”自然语言命令失效的问题。

### 新增/修改文件

| 路径 | 说明 |
|------|------|
| `src/domain/models/Instance.ts` | `Instance`、`WindowSchema` 类型。 |
| `src/domain/models/VoiceCommand.ts` | `SendText` / `CreateWindow` / `SwitchWindow` 命令类型。 |
| `src/domain/services/Router.ts` | 纯路由：根据活动窗口/Schema/最后使用选择目标。 |
| `src/domain/services/CommandParser.ts` | 兜底规则解析。 |
| `src/domain/services/IntentClassifier.ts` | LLM 意图识别。 |
| `src/domain/services/SchemaEnricher.ts` | 后台更新窗口 Schema。 |
| `src/domain/repositories/WindowRepository.ts` | 窗口生命周期 + Schema 持久化。 |
| `src/application/usecases/DeliverText.ts` | 投递编排。 |
| `src/application/usecases/ManageWindows.ts` | 创建/切换/关闭窗口。 |
| `src/adapters/llm/DeepSeekLlmClient.ts` | DeepSeek API 客户端。 |
| `src/adapters/persistence/JsonFileSchemaStore.ts` | Schema 本地持久化。 |
| `test/unit/domain/services/*.test.ts` | 路由/意图/命令解析测试。 |
| `test/unit/application/usecases/*.test.ts` | 用例测试。 |

### 测试要求

- `IntentClassifier.classify("创建一个开发 agent")` → `{ command: 'create', params: { type: '开发' } }`。
- `IntentClassifier.classify("切换到 terminal-2")` → `{ command: 'switch', params: { target: 'terminal-2' } }`。
- `IntentClassifier.classify("你好")` → `{ command: 'send_text', params: { text: '你好' } }`。
- `Router.resolve(text)` 在多个窗口中选择最匹配目标。
- `DeliverText.execute(text)` 调用剪贴板、聚焦窗口、粘贴、回车，并发出 `delivery:success`。
- `ManageWindows.create()` 调用 `ProcessLauncher` 并更新 `WindowRepository`。

### 日志/文档要求

- `docs/progress/phase-4.md`：记录 LLM prompt 设计、命令 schema、路由策略。

### 验收标准

- 单元测试全部通过。
- 手动验证：
  - “创建一个开发 agent” → 新建 Claude 终端；
  - “切换到 terminal-2” → 聚焦对应窗口；
  - “你好” → 投递文字。
- `npm run build` 通过。

---

## Phase 5：HTTP + 表现层 + 事件总线桥接

### 目标

把 `src/main.ts` 拆成：HTTP 服务器、应用生命周期、托盘管理、主窗口、`ElectronIpcBus`。`main.ts` 变成纯 bootstrap。

### 新增/修改文件

| 路径 | 说明 |
|------|------|
| `src/infrastructure/http/HttpServer.ts` | 提取所有 HTTP 路由。 |
| `src/infrastructure/ipc/ElectronIpcBus.ts` | 桥接 Electron IPC 与内部 EventBus。 |
| `src/presentation/electron/AppLifecycle.ts` | app.whenReady / singleInstanceLock / before-quit。 |
| `src/presentation/electron/TrayManager.ts` | 托盘图标与点击事件。 |
| `src/presentation/electron/MainWindow.ts` | status 窗口生命周期。 |
| `src/presentation/preload/preload.ts` | 从 `src/preload.ts` 移动并扩展。 |
| `src/presentation/html/status.html` | 从项目根移动。 |
| `src/main.ts` | 压缩为 bootstrap。 |
| `test/unit/infrastructure/http/HttpServer.test.ts` | HTTP 路由测试。 |
| `test/unit/infrastructure/ipc/ElectronIpcBus.test.ts` | IPC 桥接测试（mock ipcMain）。 |

### 测试要求

- `HttpServer` 正确响应 `/status`、`/metrics`、`/send`、`/asr`。
- `ElectronIpcBus` 把 `recording:toggle` 内部事件转发给 Electron IPC，反之亦然。
- `AppLifecycle` 在 `app:ready` 时触发正确事件。
- `TrayManager` 点击时发出 `recording:toggle`。

### 日志/文档要求

- `docs/progress/phase-5.md`：记录 main.ts 拆分结果、IPC 事件映射、HTTP 路由清单。

### 验收标准

- `npm start` 成功启动。
- 托盘、状态窗口、HTTP 端点全部工作。
- 端到端语音输入/投递仍然可用。
- `npm run build` 通过。

---

## Phase 6：Python 脚本替换为 koffi（可选但推荐）

### 目标

用 koffi 直接调用 Windows API，逐步移除 `find_win.py`、`focus_win.py`、`kill_win.py`、`watch_win.py`。保持 Python 脚本作为 interim fallback。

### 新增/修改文件

| 路径 | 说明 |
|------|------|
| `src/adapters/platform/win32/win32-koffi.ts` | EnumWindows、SetForegroundWindow、SetWinEventHook、PostMessage 封装。 |
| `src/adapters/platform/win32/Win32WindowManager.ts` | 优先使用 koffi，失败 fallback Python。 |
| `src/adapters/platform/win32/Win32InputSimulator.ts` | 用 koffi keybd_event（已部分实现）。 |

### 测试要求

- mock koffi 调用，验证窗口枚举、聚焦、关闭、监听逻辑正确。
- fallback 路径测试：koffi 失败时使用 Python 脚本。

### 日志/文档要求

- `docs/progress/phase-6.md`：记录 koffi API 签名、fallback 策略、性能对比。

### 验收标准

- 无 Python 运行时，窗口扫描/聚焦/监听仍工作。
- 删除 Python 脚本后 `npm run build` 和 `npm start` 通过。

---

## Phase 7：清理 + 文档 + 测试

### 目标

删除死代码，更新 README，补全测试，确保新架构无冗余。

### 删除文件

- `src/win32/win32.ts`
- `capture.html`
- 旧 `src/platform/index.ts`、`src/platform/win32.ts`、`src/platform/darwin.ts`、`src/platform/linux.ts`
- Python 脚本（确认 koffi 替代稳定后）

### 新增/修改文件

| 路径 | 说明 |
|------|------|
| `.env.example` | 环境变量模板。 |
| `README.md` | 更新架构说明、启动方式、配置说明。 |
| `docs/architecture.md` | 完整架构图与数据流。 |
| `test/integration/voice-to-delivery.test.ts` | 端到端集成测试（mock ASR 和平台）。 |

### 测试要求

- 单元测试覆盖率 > 70%。
- 集成测试覆盖：录音 → ASR → 意图 → 投递完整链路。
- `npm run test:all` 通过。

### 日志/文档要求

- `docs/progress/phase-7.md`：总结删除的文件、新增测试、已知限制。

### 验收标准

- `npm run build` 通过。
- `npm run test:all` 通过。
- `npm start` 可用。
- 无死代码引用。

---

## Phase 8：Agent 重写（Level 3 半自主 Agent）

### 目标

参考 `learn-claude-code` 的 permission / hook / task / subagent / memory / skill / MCP 等模式，把 voice_claude 从“语音命令执行器”升级为 **常驻 VAD 自动触发的半自主桌面 agent**。

核心体验：用户无需唤醒词、无需按键，说话即被 agent 理解、规划、执行。

### 关键决策

| 决策项 | 选择 |
|--------|------|
| 自主程度 | Level 3：大部分操作自主执行，关键操作受硬边界限制 |
| 触发方式 | 常驻 VAD 自动触发；托盘/热键用于暂停/恢复 |
| 误触发过滤 | 单次 LLM 返回 `{ isCommand, confidence, plan, reason }`；confidence 阈值过滤 |
| 工具体系 | `ToolRegistry` + `SkillRegistry`，参考 `learn-claude-code` 的 tool/skill 模式 |
| 规划粒度 | 多步计划 + 顺序执行，执行前检查 `canAutoExecute` |
| 失败恢复 | 重试 → 重新规划 → 询问用户 |
| 文本输入 | `InputSimulator.typeText()` 直接模拟键盘，绕过剪贴板竞争 |
| 记忆 | 短期内存 + JSON 文件长期偏好（`MemoryStore` port） |
| 审计 | 独立 `audit.log` + UI 时间线 |
| 实施策略 | 受控大爆炸：`agent-rewrite` 分支，按垂直切片推进，每片可编译可测试 |

### 安全边界（硬限制）

| 操作 | 默认行为 |
|------|----------|
| 读操作 | 允许自主执行 |
| 低风险写操作（聚焦、发送文本） | 允许自主执行 |
| 中风险写操作（启动已知进程） | 允许；首次启动未知程序时询问 |
| 高风险写操作（关闭窗口、shell、修改文件、网络） | 默认禁止；白名单后才允许 |
| 不可逆操作（删除文件、清空回收站） | 永远禁止自主执行 |

### 新增/修改文件

| 路径 | 说明 |
|------|------|
| `src/ports/incoming/InputSimulator.ts` | 增加 `typeText(text)` |
| `src/adapters/platform/win32/Win32InputSimulator.ts` | 用 `SendInput` Unicode 实现 `typeText` |
| `src/domain/services/ToolRegistry.ts` | 工具注册、校验、调用 |
| `src/domain/services/SkillRegistry.ts` | 加载 `~/.voice_claude/skills/*.json` |
| `src/domain/services/AgentPlanner.ts` | 单次 LLM 调用生成 `isCommand + plan` |
| `src/domain/services/PlanExecutor.ts` | 执行计划、重试、重新规划、询问用户 |
| `src/domain/services/RiskClassifier.ts` | 给计划标注风险并计算 `canAutoExecute` |
| `src/application/agent/VoiceAgent.ts` | agent 主循环：VAD → ASR → 规划 → 执行 |
| `src/application/audit/AuditLogger.ts` | 只追加审计日志 |
| `src/ports/outgoing/MemoryStore.ts` | 记忆持久化接口 |
| `src/infrastructure/persistence/JsonFileMemoryStore.ts` | JSON 文件实现 |
| `src/infrastructure/scheduler/CronScheduler.ts` | Cron 调度窗口扫描 |
| `src/renderer/status/**` | 扩展为 agent 仪表盘 |
| `src/composition-root.ts` | 装配 agent 所需服务 |
| `src/main.ts` | 从旧 bootstrap 切换到 `VoiceAgent` |

### 测试要求

- `InputSimulator.typeText` 把每个字符作为 Unicode 键盘事件发送。
- `ToolRegistry` 注册工具、执行成功、找不到工具、参数校验失败。
- `AgentPlanner` 对指令返回 `isCommand=true` 和合法 plan；对闲聊返回 `isCommand=false`。
- `PlanExecutor` 顺序执行步骤，失败时重试，重试失败后重新规划，仍失败后询问用户。
- `RiskClassifier` 正确识别高风险计划并标记 `canAutoExecute=false`。
- `VoiceAgent` 完整流程：ASR 文本 → plan → execute → audit event。
- `JsonFileMemoryStore` 读写持久化。
- `AuditLogger` 只追加不可改。

### 日志/文档要求

- `docs/design/agent-rewrite.md`：完整设计文档。
- `docs/progress/phase-agent.md`：记录每一切片完成情况。

### 验收标准

- `npx jest --testPathPatterns='test/unit' --testTimeout=30000` 全部通过。
- `npm run build` 通过。
- 手动验证：
  - 说“打开 Claude Code” → agent 启动新实例。
  - 说“发给 terminal-1 你好” → agent 聚焦 terminal-1 并输入文本。
  - 说“关闭 terminal-1” → 默认禁止，UI 提示需要授权。
  - 检查 `logs/audit.jsonl` 有完整记录。

---

## 事件契约

所有内部事件定义在 `src/application/events/AppEvents.ts`：

```ts
export interface AppEvents {
  'recording:toggle': void;
  'recording:started': void;
  'recording:stopped': { durationMs: number };
  'audio:pcm': { pcm: Buffer };
  'asr:text': { text: string };
  'command:intent': { command: VoiceCommand };
  'window:scan': { windows: Instance[] };
  'window:changed': { instance: Instance };
  'window:destroyed': { id: number };
  'delivery:request': { text: string };
  'delivery:success': { target: string; text: string; ms: number };
  'delivery:failed': { text: string; error: string };
  'app:ready': void;
  'app:before-quit': void;
}
```

---

## 配置契约

```ts
interface AppConfig {
  asr: { backend: 'doubao' | 'vosk' | 'chrome' | 'composite'; language: string; sampleRate: number };
  llm: { apiKey: string; apiUrl: string; model: string; timeoutMs: number };
  routing: { strategy: 'active' | 'llm' | 'manual'; defaultTarget: string };
  doubao: { appId: string; accessToken: string; resourceId: string; proxyHost?: string; proxyPort?: number };
  windowManager: { scanIntervalMs: number };
}
```

---

## 修改检查清单

每次修改后必须确认：

- [ ] 新代码有对应测试，且测试先失败后通过。
- [ ] 没有破坏 `npm run build`。
- [ ] 没有破坏 `npm start`（如果修改了主流程）。
- [ ] 没有在新代码中硬编码密钥。
- [ ] 没有让 Domain/Application 直接依赖 Electron/Node/HTTP。
- [ ] `AGENTS.md` 或 `docs/spec.md` 如有必要已同步更新。
- [ ] `docs/progress/phase-N.md` 已记录当前进展。
