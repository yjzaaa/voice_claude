# 剩余 Backlog GitHub Issues

仓库：`https://github.com/yjzaaa/voice_claude.git`

以下 issue 基于 `docs/spec.md` 中 Phase 1-8 的规划、当前代码已实现能力（ASR 适配器、平台适配器、Agent 重写、React 状态页、权限 IPC、设置页、全局异常、CI）梳理，覆盖尚未实现或需要增强的需求。

---

## Issue 1: 实现计划执行失败后的重试、重新规划与人工确认机制

**Labels:** `feature`, `ready-for-agent`

### 描述
当前 agent 在生成多步计划后，若某一步执行失败，仅通过 `agent:step-failed` 事件暴露结果，没有系统化的重试与重新规划机制。需要参考 Phase 8 安全边界设计，实现失败恢复闭环。

### 期望行为
- 单个步骤失败时，先按配置重试 N 次（默认 1 次）。
- 重试仍失败时，调用 `AgentPlanner` 基于当前上下文重新生成计划。
- 重新规划仍失败时，通过 `agent:needs-human` 事件暂停并请求用户介入。
- 重试/重新规划过程记录到审计日志，状态页展示当前恢复阶段。

### 验收标准
- [ ] `PlanExecutor` 支持可注入的 `maxRetries` 参数。
- [ ] 步骤失败时先重试，重试成功则继续执行后续步骤。
- [ ] 重试失败后触发重新规划，重新规划结果替换当前计划。
- [ ] 重新规划失败后触发 `agent:needs-human`。
- [ ] 所有路径写入 `audit.log`，状态页正确显示“重试中 / 重新规划中 / 需确认”。
- [ ] 单元测试覆盖三种失败恢复路径。

### 相关文件
- `src/domain/services/PlanExecutor.ts`
- `src/domain/services/AgentPlanner.ts`
- `src/application/agent/VoiceAgent.ts`
- `src/infrastructure/audit/FileAuditLogger.ts`
- `src/renderer/status/hooks/useAgentState.ts`
- `test/unit/domain/services/PlanExecutor.test.ts`

---

## Issue 2: 将 Doubao / Vosk ASR 完整接入 VoiceAgent 并支持运行时切换

**Labels:** `feature`, `ready-for-agent`

### 描述
`DoubaoAsrEngine` 与 `VoskAsrEngine` 已作为独立适配器实现并通过单元测试，`CompositeAsrEngine` 也已实现 fallback 链。但 `VoiceAgent` 当前可能仍通过旧 `src/asr/doubao.ts` 或 `src/asr/recorder.ts` 链路消费 ASR 结果，需要把新 ASR 适配器接入 agent 主循环。

### 期望行为
- `composition-root.ts` 根据 `config.asr.backend` 装配 `DoubaoAsrEngine`、`VoskAsrEngine` 或 `CompositeAsrEngine`。
- `VoiceAgent.onPcm` 调用新 `AsrEngine.transcribe`，而非旧 `doubao.ts`。
- `ElectronAudioCapture` 替代旧 `recorder.ts`，作为 `AudioCapture` port 注入。
- 配置支持运行时切换 ASR 后端并触发重新装配。

### 验收标准
- [ ] 移除 `VoiceAgent` 对旧 ASR 模块的依赖。
- [ ] `AsrEngineFactory` 根据配置返回正确引擎实例。
- [ ] `npm run test:asr`（真实 Doubao 调用）通过。
- [ ] `npm run build` 通过，旧 `src/asr/doubao.ts`、`src/asr/vosk.ts`、`src/asr/recorder.ts` 标记为 deprecated 或移除。
- [ ] 端到端语音输入链路仍工作。

### 相关文件
- `src/application/agent/VoiceAgent.ts`
- `src/composition-root.ts`
- `src/adapters/asr/AsrEngineFactory.ts`（需新建）
- `src/adapters/asr/CompositeAsrEngine.ts`
- `src/adapters/audio/ElectronAudioCapture.ts`
- `src/asr/doubao.ts`, `src/asr/vosk.ts`, `src/asr/recorder.ts`

---

## Issue 3: 为主进程 HTTP 接口与 IPC 桥接补单元测试

**Labels:** `feature`, `ready-for-agent`

### 描述
Phase 5 规划中的 `HttpServer` 与 `ElectronIpcBus` 尚未实现，也未从 `main.ts` 拆分。当前 `main-agent.ts` 直接处理 IPC 与 agent 事件转发，需要提取出可测试的 `HttpServer` 与 `ElectronIpcBus`，并补全测试。

### 期望行为
- `src/infrastructure/http/HttpServer.ts`：暴露 `/status`、`/metrics`、`/send`、`/asr` 路由。
- `src/infrastructure/ipc/ElectronIpcBus.ts`：桥接 Electron IPC 与内部 `EventBus`。
- `main-agent.ts` 仅保留 bootstrap 逻辑。

### 验收标准
- [ ] `HttpServer` 单元测试覆盖 `/status`、`/metrics`、`/send`、`/asr`。
- [ ] `ElectronIpcBus` 单元测试覆盖 IPC → EventBus 与 EventBus → IPC 双向转发。
- [ ] `main-agent.ts` 长度缩减到 100 行以内。
- [ ] `npm run test:unit` 全部通过。

### 相关文件
- `src/main-agent.ts`
- `src/infrastructure/http/HttpServer.ts`（需新建）
- `src/infrastructure/ipc/ElectronIpcBus.ts`（需新建）
- `test/unit/infrastructure/http/HttpServer.test.ts`（需新建）
- `test/unit/infrastructure/ipc/ElectronIpcBus.test.ts`（需新建）

---

## Issue 4: 用 koffi 替换 Python 窗口脚本并保留 fallback

**Labels:** `feature`, `ready-for-human`

### 描述
Phase 6 目标：用 koffi 直接调用 Windows API，逐步移除 `find_win.py`、`focus_win.py`、`kill_win.py`、`watch_win.py`，但保留 Python 脚本作为 interim fallback。

### 期望行为
- `src/adapters/platform/win32/win32-koffi.ts` 封装 EnumWindows、SetForegroundWindow、SetWinEventHook、PostMessage。
- `Win32WindowManager` 优先使用 koffi，失败时 fallback Python 脚本。
- `Win32InputSimulator` 已部分使用 koffi，补齐剩余按键/剪贴板场景。

### 验收标准
- [ ] koffi 路径单元测试通过（mock Windows API）。
- [ ] fallback 路径在 koffi 失败时仍可工作。
- [ ] 无 Python 运行时环境下窗口扫描/聚焦/监听仍可用。
- [ ] 性能对比记录到 `docs/progress/phase-6.md`。

### 相关文件
- `src/adapters/platform/win32/win32-koffi.ts`（需新建）
- `src/adapters/platform/win32/Win32WindowManager.ts`
- `src/adapters/platform/win32/Win32InputSimulator.ts`

---

## Issue 5: 实现设置页表单验证与配置实时生效

**Labels:** `feature`, `ready-for-agent`

### 描述
`Settings.tsx` 已实现基础界面与 IPC 读写，但缺少输入校验和配置变更后的实时生效机制。用户输入非法 LLM URL、空 API key 或无效 ASR 后端时，可能导致主流程静默失败。

### 期望行为
- LLM URL 必须可解析为合法 HTTP(S) URL。
- API key 非空（开发模式可允许占位符）。
- ASR backend 必须是 `doubao` / `vosk` / `chrome` / `composite` 之一。
- 保存后发送 `settings:changed` 事件，主进程重新装配相关服务。

### 验收标准
- [ ] 表单验证错误以中文提示显示在对应字段下方。
- [ ] 保存前阻止非法提交。
- [ ] 配置变更后 `composition-root.ts` 中对应服务（LLM / ASR）重新创建。
- [ ] 单元测试覆盖验证逻辑与保存流程。

### 相关文件
- `src/renderer/status/Settings.tsx`
- `src/main-agent.ts`
- `src/composition-root.ts`
- `test/unit/renderer/status/Settings.test.tsx`（需新建/扩展）

---

## Issue 6: 实现全局默认语音技能（macros）

**Labels:** `feature`, `ready-for-agent`

### 描述
用户常有一些固定语音指令，如“打开开发环境”“切换到 Claude Code”。需要支持用户自定义语音技能（macros），用自然语言触发一组预定义工具调用。

### 期望行为
- 从 `~/.voice_claude/skills/*.json` 加载技能定义。
- 技能格式：`{ name, triggerPhrases, plan }`。
- `AgentPlanner` 在调用 LLM 前先匹配 triggerPhrases，命中则直接返回对应 plan。
- 设置页可查看、启用/禁用、简单编辑技能。

### 验收标准
- [ ] `SkillRegistry` 加载并校验技能 JSON。
- [ ] 语音匹配忽略大小写与标点。
- [ ] 命中技能时跳过 LLM 调用，直接执行 plan。
- [ ] 设置页展示技能列表与开关。
- [ ] 单元测试覆盖匹配与执行路径。

### 相关文件
- `src/domain/services/SkillRegistry.ts`
- `src/domain/services/AgentPlanner.ts`
- `src/renderer/status/Settings.tsx`
- `test/unit/domain/services/SkillRegistry.test.ts`（需新建/扩展）

---

## Issue 7: 增强窗口上下文（Schema 持久化与目标窗口推断）

**Labels:** `feature`, `ready-for-agent`

### 描述
当前 `WindowRepository` 只扫描窗口列表，缺少窗口 Schema 持久化与基于 Schema 的目标窗口推断。Phase 4 规划中的 `SchemaEnricher`、`IntentClassifier`、`Router` 需要落地。

### 期望行为
- 为每个窗口维护 schema：`{ id, title, app, role, keywords }`。
- 使用 LLM 或规则定期 enrichment schema。
- `Router.resolve(text)` 根据活动窗口、schema、最近使用选择最佳目标窗口。
- 支持自然语言命令：“发给 terminal-2 你好”“切换到 Claude Code”。

### 验收标准
- [ ] `JsonFileSchemaStore` 持久化窗口 schema。
- [ ] `SchemaEnricher` 调用 LLM 生成/更新 schema。
- [ ] `Router` 单元测试覆盖多窗口选择。
- [ ] 端到端验证“切换到 terminal-2”与“发给 terminal-1 你好”。

### 相关文件
- `src/domain/repositories/WindowRepository.ts`
- `src/domain/services/Router.ts`（需新建/扩展）
- `src/domain/services/SchemaEnricher.ts`（需新建）
- `src/adapters/persistence/JsonFileSchemaStore.ts`（需新建）
- `test/unit/domain/services/Router.test.ts`（需新建）

---

## Issue 8: 清理死代码并达成单元测试覆盖率 > 70%

**Labels:** `refactor`, `ready-for-agent`

### 描述
Phase 7 目标：删除死代码，补全测试，确保新架构无冗余。当前仍保留旧 `src/platform/*`、`src/win32/win32.ts`、`capture.html`、旧 ASR 文件等。

### 期望行为
- 删除 `src/win32/win32.ts`、`capture.html`。
- 在确认 koffi 替代稳定后删除 Python 脚本与旧 `src/platform/*`。
- 补全缺失单元测试，整体覆盖率 > 70%。
- 更新 `README.md` 与 `docs/architecture.md`。

### 验收标准
- [ ] 死代码已删除且无引用残留。
- [ ] `npm run test:all` 通过。
- [ ] 测试覆盖率报告 > 70%。
- [ ] `npm run build` 与 `npm start` 仍成功。

### 相关文件
- `src/win32/win32.ts`
- `capture.html`
- `src/platform/*`
- `src/asr/doubao.ts`, `src/asr/vosk.ts`, `src/asr/recorder.ts`
- `README.md`, `docs/architecture.md`

---

## Issue 9: 实现审计日志 UI 时间线

**Labels:** `feature`, `ready-for-agent`

### 描述
`FileAuditLogger` 已写入 `logs/audit.jsonl`，但 renderer 侧没有展示。需要在状态页或设置页增加审计时间线，帮助用户查看最近执行记录与授权决策。

### 期望行为
- IPC 暴露 `settings:getRecentActions`（已存在），扩展返回完整审计条目。
- 新增 `AuditTimeline` 组件，展示时间、触发文本、工具、结果、授权方式。
- 支持滚动加载最近 N 条。

### 验收标准
- [ ] `AuditTimeline` 组件渲染最近审计记录。
- [ ] 高风险操作以不同颜色高亮。
- [ ] 单元测试覆盖空状态、单条、多条渲染。

### 相关文件
- `src/renderer/status/components/AuditTimeline.tsx`（需新建）
- `src/main-agent.ts`
- `src/infrastructure/audit/FileAuditLogger.ts`
- `test/unit/renderer/status/components/AuditTimeline.test.tsx`（需新建）

---

## Issue 10: 补充架构与 API 契约文档（持续维护）

**Labels:** `doc`, `ready-for-agent`

### 描述
`docs/architecture.md` 与 `docs/api-contracts.md` 需要随实现同步更新，记录当前 Phase 8 agent 架构、权限流程、IPC 事件、配置契约。

### 期望行为
- 更新 `docs/architecture.md`：补充 agent 重写后的数据流、分层职责、事件图。
- 更新 `docs/api-contracts.md`：补充 IPC 事件、HTTP 路由、配置 schema、权限 payload。
- 新增/更新 `docs/progress/phase-agent.md`：记录 agent 重写各切片完成情况。

### 验收标准
- [ ] 文档与当前代码一致。
- [ ] 新开发者可通过文档理解如何添加工具/技能/适配器。
- [ ] CI 中文档新鲜度检查通过（如已实现）。

### 相关文件
- `docs/architecture.md`
- `docs/api-contracts.md`
- `docs/progress/phase-agent.md`（需新建）
- `AGENTS.md`

---

*生成时间：2026-07-01*
