import { Plan, PlanStep } from '../models/Plan';

/** 工具或操作的风险等级。 */
export type RiskLevel = 'read' | 'low' | 'medium' | 'high';

/** 已标注风险等级的计划步骤。 */
export interface ClassifiedPlanStep extends PlanStep {
  risk: RiskLevel;
}

/** 经过风险分类后的完整计划。 */
export interface ClassifiedPlan {
  goal: string;
  steps: ClassifiedPlanStep[];
  /** 为 true 时表示计划不含高风险步骤，可在 Level 3 下自主执行 */
  canAutoExecute: boolean;
}

/**
 * 风险分类器：根据工具名称映射为风险等级，并判断整个计划是否允许自主执行。
 */
export class RiskClassifier {
  /**
   * @param toolRisks - 工具名到风险等级的映射；未映射的工具默认 high
   */
  constructor(private toolRisks: Record<string, RiskLevel> = {}) {}

  /**
   * 对计划进行风险分类。
   * @param plan - AgentPlanner 生成的原始计划
   * @param whitelist - 允许自动执行的高风险工具白名单
   */
  classify(plan: Plan, whitelist: string[] = []): ClassifiedPlan {
    const steps = plan.steps.map((step) => {
      const risk = this.toolRisks[step.tool] ?? 'high';
      return { ...step, risk };
    });

    return {
      goal: plan.goal,
      steps,
      canAutoExecute: !steps.some((s) => s.risk === 'high' && !whitelist.includes(s.tool)),
    };
  }
}
