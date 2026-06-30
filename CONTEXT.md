# voice_claude 领域上下文

> 本项目是 Windows 语音输入助手：点击麦克风 → 录制 → ASR → LLM 意图识别 → 将文字送到目标 Claude/Code 窗口。

## 通用领域术语

| 术语 | 含义 |
|------|------|
| **ASR** | Automatic Speech Recognition，自动语音识别，将 PCM 音频转为文本。 |
| **VAD** | Voice Activity Detection，语音活动检测，用于判断用户何时开始/停止说话。 |
| **PCM** | Pulse Code Modulation，未经压缩的原始音频采样数据。 |
| **LLM** | Large Language Model，用于意图识别、命令解析与路由决策。 |
| **Intent** | 用户语音对应的命令意图（如切换窗口、发送文本）。 |
| **Plan** | Agent 规划器生成的执行计划，包含目标与若干工具调用步骤。 |
| **Tool** | Agent 可调用的原子能力（聚焦窗口、发送文本、关闭窗口等）。 |
| **Risk** | 工具的风险等级：`read` / `low` / `medium` / `high`，决定能否自动执行。 |
| **Whitelist** | 用户明确允许自动执行的高风险工具列表。 |
| **Delivery** | 把文本输入到目标窗口的行为。 |
| **Window** | 桌面上的应用窗口，由 WindowManager 管理。 |
| **Context** | AgentPlanner 做决策时需要的桌面上下文（窗口列表、焦点窗口、最近动作、偏好）。 |
| **EventBus** | 内部事件总线，用于层间解耦。 |
| **Port** | 六边形架构中的接口契约，定义外部能力。 |
| **Adapter** | Port 的具体实现（如 DoubaoAsrEngine、Win32WindowManager）。 |

## 有界上下文

当前项目为单一上下文：语音命令被识别、规划、风险分类并执行，全程在一个 Electron 主进程内完成。

## 相关文档

- 架构与规范：`AGENTS.md`
- 架构决策记录：`docs/adr/`
- 实施阶段计划：`docs/spec.md`
