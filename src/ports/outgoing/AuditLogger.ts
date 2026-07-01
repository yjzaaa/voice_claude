/**
 * 单条审计记录。
 * 只追加、不可修改，用于追溯 agent 的每一次触发与执行。
 */
export interface AuditEntry {
  /** 记录时间戳（毫秒） */
  timestamp: number;
  /** 触发本次执行的原始语音文本 */
  triggerText: string;
  /** AgentPlanner 的解析结果 */
  response: {
    isCommand: boolean;
    confidence: number;
    plan?: { goal: string; steps: Array<{ tool: string; params: unknown; reason?: string }> };
    reason?: string;
  };
  /** 计划执行结果 */
  executionResult: {
    status: 'success' | 'step-failed' | 'error';
    failedStep?: { tool: string; params: unknown; risk?: string };
    error?: string;
  };
}

/**
 * 审计日志端口：记录 agent 行为，便于事后审查。
 */
export interface AuditLogger {
  /** 写入一条审计记录。 */
  log(entry: AuditEntry): void;
}
