/**
 * Agent 执行计划中的单一步骤。
 */
export interface PlanStep {
  /** 工具名称 */
  tool: string;
  /** 传给工具的参数 */
  params: Record<string, unknown>;
  /** LLM 对这一步的解释（可选） */
  reason?: string;
}

/**
 * Agent 针对用户意图生成的一次执行计划。
 */
export interface Plan {
  /** 计划目标摘要 */
  goal: string;
  /** 按顺序执行的工具步骤 */
  steps: PlanStep[];
}
