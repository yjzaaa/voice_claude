import { LlmClient, LlmRequest } from '../../ports/incoming/LlmClient';
import { ToolRegistry } from './ToolRegistry';
import { Plan } from '../models/Plan';
import { SkillRegistry } from './SkillRegistry';
import { WindowRole } from '../../ports/incoming/WindowManager';

/** AgentPlanner 做决策时需要的桌面上下文。 */
export interface AgentPlannerContext {
  /** 当前打开的窗口列表 */
  windows: Array<{
    id: string;
    title: string;
    processName?: string;
    appName?: string;
    iconPath?: string | null;
    role?: WindowRole;
  }>;
  /** 当前焦点窗口 */
  activeWindow?: {
    id: string;
    title: string;
    processName?: string;
    appName?: string;
    iconPath?: string | null;
    role?: WindowRole;
  };
  /** 最近执行的操作摘要 */
  recentActions: string[];
  /** 用户长期偏好 */
  preferences: Record<string, unknown>;
  /** 用户明确允许自动执行的高风险工具白名单 */
  riskWhitelist?: string[];
}

/** AgentPlanner 对单次语音输入的解析结果。 */
export interface AgentPlannerResponse {
  /** 是否是给 agent 的指令 */
  isCommand: boolean;
  /** 置信度 0-1 */
  confidence: number;
  /** 执行计划，仅当 isCommand 为 true 时存在 */
  plan?: Plan;
  /** 解释：为什么忽略或为什么选择这些步骤 */
  reason?: string;
}

/** AgentPlanner 无法解析 LLM 输出时抛出。 */
export class AgentPlannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentPlannerError';
  }
}

/**
 * Agent 规划器：通过一次 LLM 调用判断用户意图并生成执行计划。
 */
export class AgentPlanner {
  /**
   * @param llm - LLM 客户端
   * @param tools - 工具注册表，用于生成可用工具描述
   * @param skills - 可选的技能注册表，匹配到技能时直接返回预定义计划
   */
  constructor(
    private llm: LlmClient,
    private tools: ToolRegistry,
    private skills?: SkillRegistry,
  ) {}

  /**
   * 替换当前 LLM 客户端，用于配置变更后热切换。
   * @param llm - 新的 LLM 客户端
   */
  setLlmClient(llm: LlmClient): void {
    this.llm = llm;
  }

  /**
   * 解析用户语音文本，决定是否为指令并生成计划。
   * 如果已配置 SkillRegistry 且文本匹配某个技能，直接返回该技能计划，不走 LLM。
   * @param text - ASR 识别后的文本
   * @param context - 当前桌面上下文
   */
  async plan(text: string, context: AgentPlannerContext): Promise<AgentPlannerResponse> {
    const skillMatch = this.skills?.match(text);
    if (skillMatch) {
      return {
        isCommand: true,
        confidence: 1,
        plan: skillMatch.plan,
        reason: `matched skill: ${skillMatch.skill}`,
      };
    }

    const req: LlmRequest = {
      systemPrompt: this.buildSystemPrompt(),
      userPrompt: this.buildUserPrompt(text, context),
      maxTokens: 1024,
      temperature: 0.2,
    };

    const raw = await this.llm.complete(req);
    if (raw == null) {
      throw new AgentPlannerError('LLM returned null');
    }

    const parsed = extractFirstJsonObject(raw);
    if (!parsed) {
      throw new AgentPlannerError('Failed to parse planner response');
    }

    return parsed as AgentPlannerResponse;
  }

  /** 构建系统提示，包含工具列表和输出格式要求。 */
  private buildSystemPrompt(): string {
    const toolDescriptions = this.tools
      .list()
      .map((t) => `- ${t.name}: ${t.description} (risk: ${t.risk})`)
      .join('\n');

    return [
      'You are a desktop voice assistant. Decide whether the user wants you to perform an action.',
      '',
      'Available tools:',
      toolDescriptions,
      '',
      'Respond with a single JSON object:',
      '{"isCommand": boolean, "confidence": number (0-1), "plan": {"goal": "string", "steps": [{"tool": "string", "params": object}]}, "reason": "string"}',
      'If the user is not giving a command, set isCommand to false and omit the plan.',
    ].join('\n');
  }

  /** 构建用户提示，包含用户语音和桌面上下文。 */
  private buildUserPrompt(text: string, context: AgentPlannerContext): string {
    const active = context.activeWindow;
    const activeLine = active
      ? `Active window: "${active.title}" [id=${active.id}, app=${active.appName ?? 'unknown'}, role=${active.role ?? 'unknown'}]`
      : 'Active window: none';

    const windowLines = context.windows
      .map(
        (w) =>
          `  - "${w.title}" [id=${w.id}, app=${w.appName ?? 'unknown'}, role=${w.role ?? 'unknown'}]`,
      )
      .join('\n');

    const lines = [
      `User said: "${text}"`,
      '',
      'Desktop context:',
      activeLine,
      'Open windows:',
      windowLines || '  none',
      `Recent actions: ${context.recentActions.join(', ') || 'none'}`,
      `Permitted high-risk tools: ${context.riskWhitelist?.join(', ') || 'none'}`,
    ];
    return lines.join('\n');
  }
}

/**
 * 从文本中提取第一个 JSON 对象，兼容 markdown 代码块包裹。
 * @param text - LLM 原始输出
 */
function extractFirstJsonObject(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
