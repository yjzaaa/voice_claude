# 从 learn-claude-code 借鉴的 voice_claude 优化设计方案

> 参考项目：`D:\learn-claude-code`（Claude Code 机制教程，覆盖权限、Hook、任务、子智能体、上下文压缩、MCP 等模式）。
> 目标：把其中适合桌面语音助手的机制迁移到 `voice_claude`，提升安全性、可扩展性和可维护性。

## 当前 voice_claude 已具备的基础

- Ports-and-Adapters 分层 + EventBus 事件驱动解耦。
- `composition-root.ts` 依赖注入。
- `TaskCreate` / `TaskUpdate` 任务跟踪。
- `skills` 系统。
- `little-llm` provider-agnostic LLM 适配器。
- React + Vite 前端（status 窗口已迁移）。

下面列出可直接落地的优化方向，按 **收益 / 成本** 优先级排列。

---

## 1. 权限系统（Permission Pipeline）

**来源**：`s03_permission`。

### 问题

当前 `DeliverText`、`ManageWindows` 执行窗口聚焦、关闭、启动终端等操作时没有二次确认。语音命令误识别可能导致危险操作（例如“关闭 terminal-1”被错误执行）。

### 设计方案

在 **Application 层**引入 `PermissionGate`：

```
Presentation 层（Electron 弹窗 / status 页面提示）
         ↑↓ IPC
Application 层  PermissionGate
         ↑↓
Domain 层       VoiceCommand / Router
```

- 对高风险命令（`closeWindow`、`launchTerminal`、`sendKeys` 到非当前窗口）标记 `risk: 'high'`。
- `PermissionGate.check(cmd)` 根据风险等级决定：
  - `allow`：直接执行。
  - `ask`：通过 Electron dialog / status 弹窗请求用户确认。
  - `deny`：拒绝执行（例如配置中禁用的操作）。
- 权限结果缓存到本次会话，避免重复询问。

### 涉及文件

- `src/ports/incoming/PermissionSource.ts`（新 port）
- `src/application/permissions/PermissionGate.ts`（新）
- `src/adapters/platform/DialogPermissionSource.ts`（Electron dialog 实现）
- `src/application/usecases/DeliverText.ts`、`ManageWindows.ts`

### 预期收益

防止误操作，提升用户信任；为后续“语音控制任意桌面”做准备。

---

## 2. 生命周期 Hook 系统

**来源**：`s04_hooks`。

### 问题

录音、识别、投递、窗口扫描等流程的日志/指标/权限检查散落在各组件中，新增横切关注点（如 metrics、权限）需要修改多处。

### 设计方案

在 EventBus 之上增加 **命名 Hook 注册表**：

| Hook 点 | 触发时机 |
|---------|----------|
| `recording:beforeStart` | 开始录音前 |
| `recording:afterStop` | 停止录音后 |
| `asr:beforeTranscribe` | 调用 ASR 前 |
| `delivery:beforeExecute` | 执行投递前 |
| `window:beforeCreate` | 创建窗口前 |

Hook handler 返回 `Promise<boolean>` 可拦截流程。例如权限 Gate 注册 `delivery:beforeExecute`。

```ts
hooks.register('delivery:beforeExecute', async (ctx) => {
  return permissionGate.check(ctx.command);
});
```

### 涉及文件

- `src/application/hooks/HookRegistry.ts`（新）
- `src/application/events/EventBus.ts` 旁新增 Hook 触发逻辑
- 各 usecase 在关键节点 `await hooks.run('...', ctx)`

### 预期收益

横切关注点统一；权限、日志、审计、降级策略可插拔。

---

## 3. 任务系统与背景任务队列

**来源**：`s05_todo_write`、`s12_task_system`、`s13_background_tasks`。

### 问题

当前 `WindowRepository` 的窗口扫描、LLM schema 更新都是隐式后台运行，没有统一生命周期和取消机制。Electron 退出时可能出现挂起子进程或请求。

### 设计方案

引入 **Application 层 TaskQueue**：

```ts
interface BackgroundTask {
  id: string;
  name: string;
  start(): void;
  stop(): Promise<void>;
}
```

- 把 `WindowRepository.startScanning()`、`SchemaEnricher.start()` 等注册为 BackgroundTask。
- `AppLifecycle` 在 `app:before-quit` 时按依赖顺序停止所有任务。
- 任务状态通过 EventBus 广播，status 窗口可展示“后台扫描中”等提示。

### 涉及文件

- `src/application/tasks/BackgroundTaskQueue.ts`（新）
- `src/application/usecases/ManageWindows.ts`
- `src/domain/services/SchemaEnricher.ts`
- `src/presentation/electron/AppLifecycle.ts`（后续从 main.ts 提取）

### 预期收益

干净关闭、可观测的后台任务、便于后续添加定时任务。

---

## 4. Cron 调度器替代轮询

**来源**：`s14_cron_scheduler`。

### 问题

窗口扫描使用固定 `setInterval`，无法表达“工作日 9-18 点每 30 秒扫描，其余时间每 5 分钟扫描”等业务规则。

### 设计方案

引入轻量 CronScheduler（仅主进程使用）：

```ts
scheduler.schedule('window-scan', '*/30 * 9-18 * * 1-5', () => {
  eventBus.emit('window:scan');
});
scheduler.schedule('window-scan-idle', '*/5 * 0-8,19-23 * * *', () => {
  eventBus.emit('window:scan');
});
```

- 配置化：`config.windowManager.scanCron`。
- 通过 BackgroundTaskQueue 启停。

### 涉及文件

- `src/infrastructure/scheduler/CronScheduler.ts`（新）
- `src/composition-root.ts` 注入
- `src/ports/incoming/ConfigSource.ts` 增加 `scanCron` 字段

### 预期收益

降低非工作时段 CPU / Python 脚本开销；规则可配置。

---

## 5. LLM 上下文压缩与 Token 预算

**来源**：`s08_context_compact`。

### 问题

`Router.llmNavigate` 把所有窗口的 schema 一次性塞进 prompt。窗口多或 schema 长时容易超出模型上下文，导致响应变慢或截断。

### 设计方案

在调用 `LlmClient.complete` 前，由 `ContextCompactor` 对 prompt 做两层压缩：

1. **预算截断**：根据 `maxTokens` 反推可用 prompt token 数，保留最近/最相关的窗口。
2. **语义摘要**：对旧窗口 schema 做轻量摘要（或只保留 labels + title），丢弃长 context。

```ts
const compacted = compactor.compact(windows, { maxPromptTokens: 2000 });
```

### 涉及文件

- `src/domain/services/ContextCompactor.ts`（新）
- `src/domain/services/Router.ts` / `IntentClassifier.ts`

### 预期收益

避免 LLM 请求失败；提升路由响应速度；降低 API 成本。

---

## 6. 错误恢复与重试策略

**来源**：`s11_error_recovery`。

### 问题

- LLM 网络抖动导致意图识别失败时直接放弃。
- Doubao ASR WebSocket 断开后没有自动重连。

### 设计方案

- 在 `LittleLlmClient` / `HttpsJsonClient` 外层包 `RetryingLlmClient`：
  - 对 `LlmTimeoutError` 指数退避重试 3 次。
  - 最终失败时 fallback 到规则 `CommandParser`。
- 在 `DoubaoAsrEngine` 中实现连接级重连：
  - 识别失败自动尝试备用引擎（`CompositeAsrEngine` 降级链）。

### 涉及文件

- `src/adapters/llm/RetryingLlmClient.ts`（新）
- `src/domain/services/CommandParser.ts`（兜底规则）
- `src/adapters/asr/CompositeAsrEngine.ts`（已有降级链，增强重试）

### 预期收益

提升语音指令成功率；网络不稳定时仍有兜底体验。

---

## 7. 子智能体 / Agent Teams 编排复杂命令

**来源**：`s06_subagent`、`s15_agent_teams`。

### 问题

“创建一个开发 agent 并切换到它”这类多步骤命令目前由单一 `Router` 处理，逻辑会越来越复杂。

### 设计方案

引入 **Plan-and-Execute 子智能体**：

```ts
interface PlanStep {
  command: 'create' | 'switch' | 'send_text';
  params: Record<string, unknown>;
}
```

- `IntentClassifier` 对复杂指令生成 `PlanStep[]`。
- `PlanExecutor` 按顺序执行每一步，失败可部分回滚。
- 简单指令继续走 fast-path，不引入 overhead。

### 涉及文件

- `src/domain/services/PlanExecutor.ts`（新）
- `src/domain/services/IntentClassifier.ts`
- `src/application/usecases/RecordAndTranscribe.ts`

### 预期收益

支持复合语音指令；复杂逻辑可测试、可追踪。

---

## 8. 持久化 Memory（用户偏好 + 窗口历史）

**来源**：`s09_memory`。

### 问题

当前 `lastUsed` 窗口只保存在内存中，重启后丢失；用户常用的目标窗口无法被优先路由。

### 设计方案

- 增加 `MemoryStore` port：
  - `get(key)` / `set(key, value)`
- 实现 `JsonFileMemoryStore`（写入 `~/.voice_claude.memory.json`）。
- `WindowRepository` 启动时恢复 `lastUsed`、常用标签。
- `Router` 在 LLM 路由时加入“历史偏好”作为排序信号。

### 涉及文件

- `src/ports/outgoing/MemoryStore.ts`（新）
- `src/infrastructure/persistence/JsonFileMemoryStore.ts`（新）
- `src/domain/repositories/WindowRepository.ts`

### 预期收益

越用越准；重启后保留上下文。

---

## 9. Skill 配置文件（自定义语音指令）

**来源**：`s07_skill_loading`。

### 问题

所有语音命令都硬编码在 `CommandParser` / `IntentClassifier` 中，用户无法扩展。

### 设计方案

- 支持 `~/.voice_claude/skills/` 目录下的 JSON/YAML skill 文件：

```json
{
  "name": "打开浏览器搜索",
  "patterns": ["搜索 {query}", "查一下 {query}"],
  "action": {
    "type": "launch",
    "command": "start msedge \"https://www.bing.com/search?q={query}\""
  }
}
```

- `SkillRegistry` 在启动时加载 skills。
- `IntentClassifier` 优先匹配 skill；未命中再调用 LLM。

### 涉及文件

- `src/domain/services/SkillRegistry.ts`（新）
- `src/ports/outgoing/SkillStore.ts`（新）
- `src/adapters/config/FileSkillStore.ts`（新）

### 预期收益

用户可自定义命令；降低对 LLM 的依赖和成本。

---

## 10. MCP 工具扩展（长期）

**来源**：`s19_mcp_plugin`。

### 问题

voice_claude 目前只操作窗口/剪贴板，扩展新能力需要改代码。

### 设计方案

- 定义 `Tool` port：

```ts
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(args: unknown): Promise<unknown>;
}
```

- `ToolRegistry` 注册内置工具（`focus_window`、`send_text`、`launch_terminal`）。
- 未来可接入 MCP client，让 LLM 自动发现外部工具。
- `IntentClassifier` 输出 `tool_calls` 而非固定 command enum。

### 涉及文件

- `src/ports/incoming/Tool.ts`（新）
- `src/domain/services/ToolRegistry.ts`（新）
- `src/application/usecases/ExecuteToolCalls.ts`（新）

### 预期收益

能力可插拔；未来可直接对接 Claude 的 tool-use 生态。

---

## 推荐实施顺序

按 **价值高、改动小 → 价值高、改动大 → 长期** 排列：

1. **权限系统**（高价值，中等改动）
2. **Hook 系统**（中等价值，小改动，为权限提供挂载点）
3. **错误恢复 / 重试**（高价值，小改动，直接复用现有 `little-llm` 和 `CompositeAsrEngine`）
4. **背景任务队列 + Cron 调度器**（高价值，中等改动，替换 `setInterval`）
5. **LLM 上下文压缩**（高价值，小改动，Prompt 工程）
6. **持久化 Memory**（中等价值，小改动）
7. **Skill 配置文件**（高价值，中等改动）
8. **Plan Executor / 子智能体**（高价值，大改动）
9. **MCP 工具扩展**（长期，大改动）

---

## 验证方式

每个方向都应遵循项目现有 TDD 纪律：

```bash
cd D:/voice_claude
npx jest --testPathPatterns='test/unit/...'
npm run build
npm start   # 手动验证权限、重试、任务调度等行为
```

---

记录时间：2026-06-30
