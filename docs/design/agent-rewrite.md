# voice_claude Agent 重写设计文档

> 基于 `learn-claude-code` 模式与当前项目结构，把 voice_claude 从“语音命令执行器”升级为 Level 3 半自主桌面 agent。
> 分支：`agent-rewrite`。

---

## 目标

用户说话（无需唤醒词、无需按键）→ agent 自主识别意图 → 生成计划 → 调用工具 → 执行 → 反馈结果。

核心体验：**解放双手**，同时保留安全边界。

---

## 关键决策（已通过 grilling 确认）

| 决策项 | 选择 |
|--------|------|
| 自主程度 | Level 3（大部分自主 + 关键操作硬限制） |
| 运行模式 | 常驻 VAD 自动触发为主，后台周期性扫描维持窗口状态 |
| 工具协议 | `learn-claude-code` 风格 `ToolRegistry` + `SkillRegistry` |
| 规划粒度 | 多步计划 + 顺序执行，执行前检查 `canAutoExecute` |
| 失败处理 | 三级策略：重试 → 重新规划 → 询问用户 |
| LLM 调用 | 单次 LLM 调用返回 `{ isCommand, confidence, plan, reason }` |
| 记忆 | 短期内存 + JSON 文件长期偏好（`MemoryStore` port） |
| 审计 | 独立 `audit.log` + UI 时间线 |
| 交互 | agent 仪表盘（状态 + 计划 + 记忆 + 时间线 + 文本 fallback） |
| 输入方式 | 常驻 VAD 自动触发 + 文本输入；托盘/热键作为暂停/恢复入口 |
| 误触发过滤 | 空计划过滤 + confidence 阈值 + LLM 自身判断 `isCommand` |
| 文本输入方式 | `InputSimulator.typeText()` 直接模拟键盘，绕过剪贴板竞争 |
| 实施策略 | 受控大爆炸：在 `agent-rewrite` 分支上按垂直切片重写，每片可编译可测试 |

---

## 安全边界（硬限制）

| 操作 | 默认行为 |
|------|----------|
| 读操作（窗口列表、活跃窗口） | 允许自主执行 |
| 低风险写操作（聚焦、发送文本 `typeText`） | 允许自主执行 |
| 中风险写操作（启动已知进程） | 允许自主执行；首次启动未知程序时询问 |
| 高风险写操作（关闭窗口、执行 shell、修改文件、网络请求） | 默认禁止；只有加入白名单后才允许 |
| 不可逆操作（删除文件、清空回收站） | 永远禁止自主执行 |

高风险工具白名单持久化到 `MemoryStore`。

---

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Presentation 层                                                │
│  AgentDashboard (React) ←→ Electron IPC ←→ ElectronIpcBus       │
├─────────────────────────────────────────────────────────────────┤
│  Application 层                                                 │
│  VoiceAgent ──▶ PlanExecutor ──▶ ToolRegistry                   │
│       │              │                │                         │
│       ▼              ▼                ▼                         │
│  BackgroundTaskQueue   AuditLogger    SkillRegistry               │
├─────────────────────────────────────────────────────────────────┤
│  Domain 层                                                      │
│  AgentPlanner (LLM 一次调用)    Plan    PlanStep                  │
│  ContextCompactor    CommandFilter    RiskClassifier              │
├─────────────────────────────────────────────────────────────────┤
│  Ports 层                                                       │
│  LlmClient  AsrEngine  WindowManager  InputSimulator  Clipboard  │
│  ProcessLauncher  ConfigSource  MemoryStore  Logger  Metrics     │
├─────────────────────────────────────────────────────────────────┤
│  Adapters 层                                                    │
│  LittleLlmClient  DoubaoAsrEngine  Win32WindowManager            │
│  Win32InputSimulator (新增 typeText)  JsonFileMemoryStore         │
├─────────────────────────────────────────────────────────────────┤
│  Infrastructure 层                                              │
│  FileLogger  InMemoryMetrics  CronScheduler  AuditLogAppender     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 新增核心组件

### 1. `src/application/agent/VoiceAgent.ts`

agent 主循环：

```ts
class VoiceAgent {
  async onAudio(pcm: Buffer): Promise<void> {
    const text = await this.asr.transcribe(pcm);
    const response = await this.planner.plan(text, await this.context());
    if (!response.isCommand || response.confidence < this.config.confidenceThreshold) {
      this.emitIgnored(response.reason);
      return;
    }
    const plan = this.riskClassifier.classify(response.plan);
    if (!plan.canAutoExecute) {
      this.emitNeedsHuman(plan);
      return;
    }
    await this.executor.execute(plan);
  }
}
```

### 2. `src/domain/services/AgentPlanner.ts`

单次 LLM 调用，返回结构化响应：

```ts
interface AgentPlannerResponse {
  isCommand: boolean;
  confidence: number;
  plan?: Plan;
  reason?: string;
}
```

Prompt 包含：
- 当前窗口列表
- 活跃窗口
- 最近操作历史
- 用户长期偏好
- 可用工具 schema（来自 ToolRegistry）

### 3. `src/domain/services/PlanExecutor.ts`

按顺序执行 `PlanStep`：

1. 调用 `ToolRegistry.get(tool).execute(params)`。
2. 失败则重试（指数退避，最多 3 次）。
3. 仍失败则把错误返回给 `AgentPlanner.replan(plan, error)`。
4. 重新规划仍失败则 `emitNeedsHuman`。

### 4. `src/domain/services/ToolRegistry.ts` + `SkillRegistry.ts`

- `ToolRegistry` 注册内置工具。
- `SkillRegistry` 加载 `~/.voice_claude/skills/*.json`，把用户语音模式映射到工具调用。

### 5. `src/domain/services/RiskClassifier.ts`

给每个 `PlanStep` 标注风险等级，并计算整个计划是否 `canAutoExecute`。

### 6. `src/ports/outgoing/MemoryStore.ts` + `JsonFileMemoryStore.ts`

持久化长期偏好和白名单。

### 7. `src/application/audit/AuditLogger.ts`

只追加 `logs/audit.jsonl`，记录每次触发、计划、执行结果。

### 8. `src/infrastructure/scheduler/CronScheduler.ts`

后台周期性扫描窗口状态，替代 `setInterval`。

---

## 内置工具集（初始）

| 工具 | 风险 | 说明 |
|------|------|------|
| `get_window_list` | 读 | 获取当前 Claude/Code 窗口 |
| `get_active_window` | 读 | 获取焦点窗口 |
| `focus_window` | 低 | 聚焦指定窗口 |
| `send_text` | 低 | `typeText` 输入文本并回车 |
| `launch_process` | 中 | 启动程序；未知命令首次询问 |
| `close_window` | 高 | 默认禁止，白名单后才允许 |
| `set_clipboard` | 低 | 写入剪贴板（保留给明确复制场景） |

---

## UI 仪表盘

在现有 React status 窗口基础上扩展为 `AgentDashboard`：

- 监听状态：监听中 / 检测到语音 / 识别中 / 规划中 / 执行中
- 当前计划：步骤列表 + 每步状态
- 最近时间线：已执行操作 + 结果
- 记忆面板：最近使用窗口、白名单
- 文本输入框：语音 fallback
- 暂停/恢复监听按钮

样式优化可后续用 `designer` skill 专门处理。

---

## 实施顺序（垂直切片）

在 `agent-rewrite` 分支上：

1. **ToolRegistry + 内置工具实现**
   - 扩展 `InputSimulator` port 增加 `typeText`。
   - 实现 `Win32InputSimulator.typeText`。
   - 实现 `ToolRegistry` 和初始工具。

2. **PlanExecutor + 失败恢复**
   - `PlanExecutor`、重试、重新规划、询问用户。

3. **VoiceAgent 核心循环**
   - 接入 ASR、Planner、Executor。
   - 常驻 VAD 触发。

4. **硬边界 + 权限检查**
   - `RiskClassifier`、高风险工具白名单。

5. **MemoryStore + 长期偏好**
   - `JsonFileMemoryStore`、记忆恢复与写入。

6. **审计日志 + UI 时间线**
   - `AuditLogger`、仪表盘时间线组件。

7. **仪表盘 UI 样式优化**
   - 使用 `designer` skill。

8. **清理旧路径**
   - 从 `main.ts` 切换到 `VoiceAgent`。
   - 移除旧 `src/instance/*`、`src/platform/*` 死代码。

每步都必须：

```bash
npm run test:unit
npm run build
```

---

## 与 `learn-claude-code` 的对应关系

| 本设计 | learn-claude-code 模式 |
|--------|------------------------|
| 常驻 VAD + 自动执行 | `s04_hooks`（生命周期钩子） |
| ToolRegistry + SkillRegistry | `s07_skill_loading` + `s19_mcp_plugin` |
| 背景任务队列 + CronScheduler | `s12_task_system` + `s13_background_tasks` + `s14_cron_scheduler` |
| PlanExecutor + 重新规划 | `s06_subagent` + `s15_agent_teams` |
| 错误恢复（重试 → replan → human） | `s11_error_recovery` |
| MemoryStore | `s09_memory` |
| 上下文压缩 | `s08_context_compact` |
| 权限/审计边界 | `s03_permission` |

---

## 验证方式

```bash
cd D:/voice_claude
git checkout -b agent-rewrite
npm run test:unit
npm run build
npm start
```

手动验证：
1. 说出“打开 Claude Code” → agent 启动新实例。
2. 说出“发给 terminal-1 你好” → agent 聚焦 terminal-1 并输入文本。
3. 说出“关闭 terminal-1” → 默认禁止，UI 提示需要授权。
4. 检查 `logs/audit.jsonl` 有完整记录。

---

记录时间：2026-06-30
