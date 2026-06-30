# Task #70 Backlog: GitHub Issues

仓库：`https://github.com/yjzaaa/voice_claude.git`

以下 6 个 issue 按 team-lead 指定方向整理，严格遵循 `docs/templates/issue.md` 模板，并标注 `docs/agents/triage-labels.md` 中的 triage labels。

---

## Issue 1: 端到端冒烟测试与性能基准

**标题：** `[Feature] 建立端到端冒烟测试与性能基准`

**Labels:** `feature`, `ready-for-agent`

### 问题类型

- [ ] Bug
- [x] Feature
- [ ] Refactor
- [ ] Doc
- [ ] Question

### 描述

当前已有基础 Playwright E2E 测试 `test/e2e/smoke.spec.ts`，可验证状态窗口加载、设置页切换、无异常抛出。但缺少系统化的端到端冒烟测试套件与性能基准，无法持续保障语音输入 → ASR → Agent 规划 → 工具执行的完整链路在回归时可用。

### 复现步骤 / 期望行为

期望行为：
- 每次 CI 或提交前运行 E2E 冒烟测试，覆盖主流程关键路径。
- 录制/回放或 mock 方式验证：录音启动 → PCM 产生 → ASR 文本 → Agent 状态变化。
- 建立性能基准：窗口启动时间、ASR 识别耗时、计划执行耗时，超出阈值时告警。
- 生成测试报告与截图产物，失败时自动归档到 `logs/e2e/`。

### 验收标准

- [ ] `npm run test:e2e` 脚本可运行，且不依赖真实麦克风/ASR 服务。
- [ ] 冒烟测试覆盖：状态窗口加载、设置页导航、录音状态切换、模拟 ASR 文本触发 agent 状态变化。
- [ ] 性能基准脚本记录并对比启动时间、ASR 耗时、计划执行耗时。
- [ ] CI workflow 中加入 `test:e2e` 步骤（可选，若运行过慢可改为定时）。
- [ ] 测试产物目录 `test-results/` 与 `logs/e2e/` 加入 `.gitignore`。

### 相关文件/模块

- `test/e2e/smoke.spec.ts`
- `src/main-agent.ts`
- `src/renderer/status/App.tsx`
- `src/application/agent/VoiceAgent.ts`
- `.github/workflows/ci.yml`
- `package.json`

### 是否阻塞其他任务

- 否

---

## Issue 2: 默认语音技能文件（builtin skills）

**标题：** `[Feature] 提供默认语音技能文件并支持运行时重载`

**Labels:** `feature`, `ready-for-agent`

### 问题类型

- [ ] Bug
- [x] Feature
- [ ] Refactor
- [ ] Doc
- [ ] Question

### 描述

`SkillRegistry` 已实现从 `~/.voice_claude/skills/*.json` 加载用户自定义技能，但项目未内置任何默认技能。新用户首次使用时无法通过常见高频指令（如“打开 Claude Code”“切换到 terminal”）直接触发预定义计划，导致每次都要走 LLM 调用，延迟高且不稳定。

### 复现步骤 / 期望行为

期望行为：
- 项目仓库内置一组默认技能文件（例如 `assets/skills/open-claude.json`、`assets/skills/switch-terminal.json`）。
- 启动时若用户目录没有技能文件，自动复制默认技能到 `~/.voice_claude/skills/`。
- `SkillRegistry` 支持 `reload()` 热重载，配置变更或文件更新后无需重启应用。
- 设置页展示内置技能与用户技能，支持启用/禁用。

### 验收标准

- [ ] `assets/skills/` 目录包含至少 3 个默认技能：打开 Claude Code、切换到 terminal、发送“你好”。
- [ ] 启动时自动同步默认技能到用户目录（不覆盖用户已有同名技能）。
- [ ] `SkillRegistry.reload()` 重新扫描目录并更新内存中的技能列表。
- [ ] `AgentPlanner` 在调用 LLM 前先匹配技能，命中时直接返回技能 plan。
- [ ] 单元测试覆盖默认技能加载、reload、匹配优先级、用户覆盖。

### 相关文件/模块

- `src/domain/services/SkillRegistry.ts`
- `src/domain/services/AgentPlanner.ts`
- `src/renderer/status/Settings.tsx`
- `src/composition-root.ts`
- `assets/skills/`（需新建）
- `test/unit/domain/services/SkillRegistry.test.ts`

### 是否阻塞其他任务

- 否

---

## Issue 3: 错误重试与降级策略

**标题：** `[Feature] 完善错误重试、重新规划与人工确认降级策略`

**Labels:** `feature`, `ready-for-agent`

### 问题类型

- [ ] Bug
- [x] Feature
- [ ] Refactor
- [ ] Doc
- [ ] Question

### 描述

`PlanExecutor` 已支持单步失败后的固定次数重试（默认 3 次），但重试耗尽后直接返回 `step-failed`，缺少重新规划与最终降级到人工确认的完整策略。对于临时性失败（如窗口未就绪、网络抖动），应能自动恢复；对于持续性失败，应礼貌地暂停并请求用户介入，而不是静默失败。

### 复现步骤 / 期望行为

期望行为：
- 步骤失败后先重试；重试成功则继续执行后续步骤。
- 重试耗尽后，调用 `AgentPlanner.replan(context)` 基于当前窗口上下文和已执行步骤生成新计划。
- 重新规划后再次执行；若再次失败，触发 `agent:needs-human` 事件。
- 状态页展示当前恢复阶段：重试中 / 重新规划中 / 需确认。
- 所有恢复动作写入审计日志。

### 验收标准

- [ ] `PlanExecutor.execute` 返回结果增加 `status: 'retrying' | 'replanning' | 'needs-human'` 中间状态或事件。
- [ ] `VoiceAgent` 监听 `PlanExecutor` 结果，按策略触发重试、重新规划、人工确认。
- [ ] `AgentPlanner` 支持 `replan(context)`，接收已执行步骤、失败步骤、当前窗口上下文。
- [ ] `useAgentState` 正确展示“重试中 / 重新规划中 / 需确认”。
- [ ] 单元测试覆盖：重试成功、重试失败后重新规划成功、重新规划失败后人工确认。

### 相关文件/模块

- `src/domain/services/PlanExecutor.ts`
- `src/domain/services/AgentPlanner.ts`
- `src/application/agent/VoiceAgent.ts`
- `src/renderer/status/hooks/useAgentState.ts`
- `src/infrastructure/audit/FileAuditLogger.ts`
- `test/unit/domain/services/PlanExecutor.test.ts`
- `test/unit/application/agent/VoiceAgent.test.ts`

### 是否阻塞其他任务

- 否

---

## Issue 4: 窗口上下文增强（icon、应用类型）

**标题：** `[Feature] 增强窗口上下文：应用类型、图标、活动窗口语义`

**Labels:** `feature`, `ready-for-agent`

### 问题类型

- [ ] Bug
- [x] Feature
- [ ] Refactor
- [ ] Doc
- [ ] Question

### 描述

当前 `WindowRepository` 只追踪窗口 ID 和标题，`TrackedWindow` 缺少应用类型、图标、进程名等语义信息。`AgentPlanner` 难以根据窗口上下文生成准确计划（例如区分 Claude Code 窗口与普通终端窗口），也影响自然语言命令的目标窗口推断。

### 复现步骤 / 期望行为

期望行为：
- `TrackedWindow` 扩展为包含 `processName`、`appName`、`icon?`、`role`（terminal/editor/browser 等）。
- `Win32WindowManager.findWindows()` 通过 Python 脚本或 koffi 补充进程名与图标路径。
- `WindowRepository` 扫描时缓存并去重窗口，按进程名/标题推断 `role`。
- `AgentPlanner` 的 prompt 中包含当前活动窗口与候选窗口列表，提升规划准确性。
- 状态页以图标/进程名展示窗口列表，帮助用户确认当前上下文。

### 验收标准

- [ ] `TrackedWindow` 类型扩展 `processName`、`appName`、`icon?`、`role`。
- [ ] `WindowManager` 接口与 Win32 实现返回增强字段。
- [ ] `WindowRepository` 维护去重后的窗口快照，提供 `getWindows()` / `getActiveWindow()`。
- [ ] `AgentPlanner` prompt 注入当前窗口上下文（活动窗口 + 前 N 个候选窗口）。
- [ ] 单元测试覆盖窗口去重、role 推断、增强字段解析。

### 相关文件/模块

- `src/domain/repositories/WindowRepository.ts`
- `src/ports/incoming/WindowManager.ts`
- `src/adapters/platform/win32/Win32WindowManager.ts`
- `src/domain/services/AgentPlanner.ts`
- `src/renderer/status/components/`（需新增窗口上下文展示组件）
- `test/unit/domain/repositories/WindowRepository.test.ts`

### 是否阻塞其他任务

- 否

---

## Issue 5: 录音 VAD 与 ASR 稳定性

**标题：** `[Bug/Feature] 提升录音 VAD 分割与 ASR 识别稳定性`

**Labels:** `bug`, `feature`, `ready-for-agent`

### 问题类型

- [x] Bug
- [x] Feature
- [ ] Refactor
- [ ] Doc
- [ ] Question

### 描述

当前 `ElectronAudioCapture` 与旧 `src/asr/recorder.ts` 共存，录音仍由隐藏窗口的 Web Audio + VAD 处理。存在以下稳定性问题：
- 录音窗口偶发 `did-fail-load` 或 preload 加载失败，导致 `isReady` 一直为 false。
- VAD 分割过于敏感，短停顿会被切分成多段，导致一次说话被拆成多次 ASR 调用。
- ASR 识别失败时缺少 fallback 与重试，直接丢弃该段语音。
- 长时间录音后 PCM 累积过大，可能引发内存问题。

### 复现步骤 / 期望行为

期望行为：
- 录音窗口加载失败时自动重试，并在状态页提示“录音器未就绪”。
- VAD 参数可配置（`silenceThreshold`、`minSpeechDurationMs`、`maxSpeechDurationMs`），并设置合理默认值。
- ASR 识别失败时自动重试一次，仍失败则通过 `agent:step-failed` 或日志暴露原因。
- 每段识别完成后清空 PCM accumulator，避免内存持续增长。
- 支持手动触发重新初始化录音器（例如托盘菜单或设置页按钮）。

### 验收标准

- [ ] `ElectronAudioCapture` 在窗口加载失败时重试，最多 N 次。
- [ ] VAD 参数从配置读取，默认避免过短语音被切分。
- [ ] ASR 单次失败自动重试，重试失败后记录错误并继续监听下一段。
- [ ] `stop()` 或识别完成后清空 `pcmAccumulator`。
- [ ] 单元测试覆盖加载失败重试、ASR 失败重试、accumulator 清理。

### 相关文件/模块

- `src/adapters/audio/ElectronAudioCapture.ts`
- `src/asr/recorder.ts`
- `src/application/agent/VoiceAgent.ts`
- `src/adapters/asr/CompositeAsrEngine.ts`
- `html/recorder.html` / `src/renderer/recorder/`（VAD 实现）
- `src/ports/incoming/ConfigSource.ts`
- `test/unit/adapters/audio/ElectronAudioCapture.test.ts`

### 是否阻塞其他任务

- 否

---

## Issue 6: 设置页表单验证与敏感信息掩码

**标题：** `[Feature] 设置页表单验证、敏感信息掩码与配置实时生效`

**Labels:** `feature`, `ready-for-agent`

### 问题类型

- [ ] Bug
- [x] Feature
- [ ] Refactor
- [ ] Doc
- [ ] Question

### 描述

当前 `Settings.tsx` 已实现 LLM API Key、ASR 后端和白名单管理，但缺少输入校验、敏感信息掩码和配置变更后的实时生效机制。用户可能输入非法 URL、无效 ASR 后端或空 API Key，导致主流程静默失败；API Key 以明文显示在输入框中，存在泄露风险。

### 复现步骤 / 期望行为

期望行为：
- LLM Base URL 必须可解析为合法 HTTP(S) URL（若提供）。
- API Key 输入框默认掩码显示，提供“显示/隐藏”切换按钮。
- ASR 后端必须是 `doubao` / `vosk` / `chrome` / `composite` 之一，并提供下拉选择。
- 保存前阻止非法提交，错误提示显示在对应字段下方。
- 保存成功后发送 `settings:changed` IPC 事件，主进程重新装配 LLM / ASR 服务。
- 配置变更不重启应用即可生效。

### 验收标准

- [ ] 表单字段级验证：URL 格式、ASR 后端枚举、API Key 非空（开发模式可允许占位符）。
- [ ] API Key 输入框默认 `type="password"`，支持显示/隐藏切换。
- [ ] 非法输入时保存按钮禁用并显示中文错误提示。
- [ ] 保存成功后触发 `settings:changed`，`composition-root.ts` 或 `main-agent.ts` 重新创建 LLM/ASR 实例。
- [ ] 单元测试覆盖验证逻辑、掩码切换、保存成功/失败状态。

### 相关文件/模块

- `src/renderer/status/Settings.tsx`
- `src/renderer/status/Settings.module.css`
- `src/main-agent.ts`
- `src/composition-root.ts`
- `src/preload.ts`
- `test/unit/renderer/status/Settings.test.tsx`（需新建/扩展）

### 是否阻塞其他任务

- 否

---

*生成时间：2026-07-01*
