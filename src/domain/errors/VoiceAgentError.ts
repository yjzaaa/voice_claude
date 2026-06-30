/**
 * VoiceAgent 错误基类。
 * 所有 agent 相关错误都应携带组件名与原始 cause，便于统一日志和诊断。
 */
export class VoiceAgentError extends Error {
  constructor(
    message: string,
    /** 错误发生的组件，如 'asr' | 'planner' | 'tool' */
    public readonly component: string,
    /** 原始错误 */
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VoiceAgentError';
  }
}

/** ASR 阶段失败。 */
export class AsrError extends VoiceAgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'asr', cause);
    this.name = 'AsrError';
  }
}

/** AgentPlanner 解析或调用 LLM 失败。 */
export class PlannerError extends VoiceAgentError {
  constructor(message: string, cause?: unknown) {
    super(message, 'planner', cause);
    this.name = 'PlannerError';
  }
}

/** 工具执行失败。 */
export class ToolExecutionError extends VoiceAgentError {
  constructor(
    /** 失败的工具名 */
    public readonly tool: string,
    cause?: unknown,
  ) {
    super(`Tool execution failed: ${tool}`, 'tool', cause);
    this.name = 'ToolExecutionError';
  }
}

/** 高风险操作被拒绝。 */
export class PermissionDeniedError extends VoiceAgentError {
  constructor(public readonly tools: string[]) {
    super(`Permission denied for high-risk tools: ${tools.join(', ')}`, 'permission');
    this.name = 'PermissionDeniedError';
  }
}
