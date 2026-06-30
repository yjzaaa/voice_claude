# voice_claude 架构文档

> 本文档描述重新架构后的 voice_claude 分层设计、主要模块职责与核心数据流。
> 与旧版 `ARCHITECTURE.md` 不同，本文档聚焦 **ports-and-adapters** 重构后的结构。

## 1. 设计目标

- **分层解耦**：领域/应用层只依赖 Port 接口，Adapter 实现细节不泄漏到上层。
- **事件驱动**：层间通过 `EventBus` 事件通信，避免跨层直接 import 具体实现。
- **可测试**：所有外部依赖（文件系统、Electron、Win32、LLM、ASR）均可注入测试替身。
- **渐进增强**：保留旧 `src/main.ts` HTTP 投递管线，同时并行运行新的 Agent 管线 `src/main-agent.ts`。

## 2. 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│  表示层 (Presentation)                                           │
│  src/renderer/status/*   src/renderer/shared/*                   │
│  status.html / capture.html / html/*                            │
├─────────────────────────────────────────────────────────────────┤
│  应用层 (Application)                                            │
│  src/application/agent/VoiceAgent.ts                             │
│  src/application/events/EventBus.ts                              │
│  src/application/tools/builtInTools.ts                           │
├─────────────────────────────────────────────────────────────────┤
│  领域层 (Domain)                                                 │
│  src/domain/services/{AgentPlanner,PlanExecutor,RiskClassifier,   │
│                      ToolRegistry,SkillRegistry}.ts              │
│  src/domain/repositories/WindowRepository.ts                     │
│  src/domain/errors/VoiceAgentError.ts                            │
├─────────────────────────────────────────────────────────────────┤
│  端口层 (Ports)                                                  │
│  src/ports/incoming/*   (AsrEngine, LlmClient, WindowManager...) │
│  src/ports/outgoing/*   (Logger, MemoryStore, AuditLogger...)    │
├─────────────────────────────────────────────────────────────────┤
│  适配器层 (Adapters / Infrastructure)                            │
│  src/adapters/asr/*, src/adapters/llm/*, src/adapters/config/*   │
│  src/adapters/platform/win32/*                                   │
│  src/infrastructure/{logging,metrics,persistence,scheduler,...}* │
├─────────────────────────────────────────────────────────────────┤
│  装配与入口                                                     │
│  src/composition-root.ts    // 依赖注入容器                      │
│  src/main-agent.ts          // Agent 模式 Electron 入口          │
│  src/main.ts                // 旧版 HTTP 投递入口                │
│  src/preload.ts             // renderer 安全桥接                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 各层职责

| 层 | 职责 | 关键目录 |
|---|---|---|
| Presentation | React/Vite 状态页、录音页面、HTML 面板 | `src/renderer/`, `html/`, `status.html` |
| Application | 编排领域服务，响应用户/外部事件 | `src/application/` |
| Domain | 业务规则：规划、风险、执行、工具、记忆 | `src/domain/` |
| Ports | 定义与外部世界交互的契约 | `src/ports/` |
| Adapters | Ports 的具体实现（Electron、Win32、HTTP 等） | `src/adapters/`, `src/infrastructure/` |
| Composition | 装配所有依赖，启动应用 | `src/composition-root.ts`, `src/main-agent.ts` |

## 3. 核心数据流

```
用户说话
    │
    ▼
┌──────────────────┐
│  PCM 音频采集     │  src/asr/recorder.ts（隐藏窗口 Web Audio + VAD）
└────────┬─────────┘
         │ pcm
         ▼
┌──────────────────┐
│  ASR 识别         │  AsrEngine.transcribe(pcm) → text
│  Legacy/Doubao/   │
│  Composite/Vosk   │
└────────┬─────────┘
         │ text
         ▼
┌──────────────────┐
│  VoiceAgent       │  编排入口：onPcm(pcm)
│  application/agent│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  AgentPlanner     │  LLM 规划 → AgentPlannerResponse
│  domain/services  │  { isCommand, confidence, plan, reason }
└────────┬─────────┘
         │ plan
         ▼
┌──────────────────┐
│  RiskClassifier   │  给每一步标注风险等级 read/low/medium/high
│  domain/services  │  高风险步骤需要人类确认
└────────┬─────────┘
         │ classified plan
         ▼
┌──────────────────┐
│  PlanExecutor     │  顺序执行每一步，失败重试 maxRetries 次
│  domain/services  │
└────────┬─────────┘
         │ result
         ▼
┌──────────────────┐
│  FileAuditLogger  │  追加审计日志 audit.jsonl
│  infrastructure   │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│  EventBus 事件    │  agent:success / agent:step-failed / ...
│  application      │
└──────────────────┘
         │
         ▼
┌──────────────────┐
│  状态页 / 托盘     │  Electron IPC 转发事件到 renderer
│  main-agent.ts    │
└──────────────────┘
```

### 3.1 关键交互时序

1. `main-agent.ts` 调用 `createApp()` 获取装配好的服务。
2. 安装全局异常处理器 `GlobalExceptionHandler`。
3. `CronScheduler` 每 5 秒触发 `WindowRepository.scan()`，维护窗口上下文。
4. 录音器 VAD 分段产生 PCM，回调 `VoiceAgent.onPcm()`。
5. `VoiceAgent` 依次调用 ASR → Planner → Risk → Executor，并写审计日志。
6. 每个阶段通过 `EventBus` 发布事件，`main-agent.ts` 转发到状态窗口与托盘。

## 4. 主要模块职责

### 4.1 VoiceAgent（应用层编排器）

- 接收 `onPcm(pcm)` 音频段。
- 管理完整生命周期：转写 → 规划 → 风险分类 → 执行 → 审计 → 事件广播。
- 低置信度或非指令时发布 `agent:ignored`。
- 高风险步骤发布 `agent:permission-request`，由 `main-agent.ts` 弹出系统对话框。

### 4.2 AgentPlanner（领域服务）

- 根据当前上下文（窗口列表、最近动作、偏好、白名单）构造 prompt。
- 调用 `LlmClient.complete()` 获取 LLM 回复。
- 解析为结构化计划：`{ goal: string; steps: { tool, params, reason }[] }`。

### 4.3 RiskClassifier（领域服务）

- 输入：原始计划 + 用户白名单。
- 输出：`ClassifiedPlan`，每个步骤带有 `risk` 等级和 `canAutoExecute` 标志。
- 任何 `high` 风险且未在白名单的工具都会阻塞自动执行。

### 4.4 PlanExecutor（领域服务）

- 按顺序执行 `ClassifiedPlan` 的步骤。
- 单步失败时重试（默认 3 次）。
- 返回 `success` 或 `step-failed`。

### 4.5 ToolRegistry（领域服务）

- 注册和管理 `Tool` 定义。
- 执行前使用 JSON Schema 校验参数。
- 内置工具：`send_text`、`focus_window`、`close_window`、`get_window_list`、`get_active_window`、`launch_process`、`set_clipboard`。

### 4.6 WindowRepository（领域仓库）

- 封装 `WindowManager`，维护窗口缓存。
- 通过 `EventBus` 发布窗口变化事件。
- 为 Planner 提供 `AgentPlannerContext`。

### 4.7 EventBus（应用层事件总线）

- 内部发布/订阅，替代直接依赖。
- 订阅者异常被捕获，避免一个监听器崩溃拖垮整个链路。

### 4.8 FileLogger / FileAuditLogger（基础设施）

- `FileLogger`：按组件写入 JSON 行日志，支持级别过滤与文件轮转。
- `FileAuditLogger`：追加不可变的审计记录，用于事后追溯。

## 5. 入口对比

| 入口 | 模式 | 说明 |
|---|---|---|
| `src/main.ts` | 旧版 HTTP 投递 | `:9877` HTTP 服务 + Chrome Web Speech + 直接投递 |
| `src/main-agent.ts` | Agent 模式 | Electron 常驻 + VAD 分段 + Agent 规划/执行 |

`package.json` 的 `main` 当前指向 `dist/main-agent.js`，即默认以 Agent 模式启动。

## 6. 配置来源

配置通过 `EnvConfigSource` 和 `FileConfigSource` 叠加：

```
默认值
  ← FileConfigSource (~/.voice_claude.json)
  ← EnvConfigSource (VOICE_CLAUDE_* 环境变量)
```

环境变量优先级高于文件。详见 `docs/api-contracts.md` 的安全配置章节。

## 7. 扩展方向

- **ASR 适配器**：已完成 `LegacyAsrEngine`，计划增加 `DoubaoAsrEngine`、`VoskAsrEngine`、`CompositeAsrEngine`。
- **LLM 适配器**：已完成 `LittleLlmClient` + DeepSeek/OpenAI-compatible  provider。
- **Renderer 配置页**：通过 `preload.ts` 暴露 `memoryAPI`，允许 UI 修改白名单与配置。
- **全局异常处理**：集中管理 `uncaughtException` / `unhandledRejection`，记录日志并安全退出。

## 8. 相关文档

- `docs/api-contracts.md` — 事件、preload API、端口契约、配置项。
- `DESIGN.md` — 旧版设计决策与组件交互。
- `ARCHITECTURE.md` — 旧版 C4/流程/类图文档。
- `TEST_PLAN.md` — 测试策略。
