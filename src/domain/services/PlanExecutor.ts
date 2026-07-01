import { ToolRegistry } from './ToolRegistry';
import { ClassifiedPlan, ClassifiedPlanStep } from './RiskClassifier';

/** 计划执行结果。 */
export interface PlanExecutionResult {
  status: 'success' | 'step-failed' | 'error';
  /** 失败的步骤（仅在 step-failed 时存在） */
  failedStep?: ClassifiedPlanStep;
  /** 导致失败的错误 */
  error?: unknown;
  /** 在失败前已经成功执行的步骤 */
  executedSteps?: ClassifiedPlanStep[];
}

/** 单步重试事件。 */
export interface PlanExecutorRetryEvent {
  step: ClassifiedPlanStep;
  attempt: number;
  maxRetries: number;
  error: unknown;
}

/**
 * 计划执行器：按顺序执行计划中的每一步，失败时重试。
 * 重试耗尽后返回失败步骤与已执行步骤，由调用方决定是否重新规划或询问用户。
 */
export class PlanExecutor {
  /**
   * @param toolRegistry - 工具注册表
   * @param maxRetries - 单步最大重试次数（含首次执行）
   * @param onRetry - 每次重试前触发的回调（可选）
   */
  constructor(
    private toolRegistry: ToolRegistry,
    private maxRetries: number = 3,
    private onRetry?: (event: PlanExecutorRetryEvent) => void,
  ) {}

  /**
   * 执行已分类计划。
   * @param plan - 风险分类后的计划
   */
  async execute(plan: ClassifiedPlan): Promise<PlanExecutionResult> {
    const executedSteps: ClassifiedPlanStep[] = [];

    for (const step of plan.steps) {
      let lastError: unknown;
      let succeeded = false;

      // 重试执行当前步骤，直到成功或次数耗尽
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          await this.toolRegistry.execute(step.tool, step.params);
          succeeded = true;
          break;
        } catch (e) {
          lastError = e;
          if (attempt < this.maxRetries - 1) {
            this.onRetry?.({ step, attempt: attempt + 1, maxRetries: this.maxRetries, error: e });
          }
        }
      }

      if (!succeeded) {
        return { status: 'step-failed', failedStep: step, error: lastError, executedSteps };
      }

      executedSteps.push(step);
    }

    return { status: 'success' };
  }
}
