/** Agent 可调用的工具风险等级。 */
import { ToolExecutionError } from '../errors/VoiceAgentError';
export { ToolExecutionError } from '../errors/VoiceAgentError';

export type ToolRisk = 'read' | 'low' | 'medium' | 'high';

/**
 * Agent 可调用的工具定义。
 */
export interface Tool {
  /** 工具唯一名称 */
  name: string;
  /** 工具用途描述，用于 LLM 选择工具 */
  description: string;
  /** 工具参数 JSON Schema */
  parameters: object;
  /** 风险等级，影响是否允许自主执行 */
  risk: ToolRisk;
  /**
   * 执行工具。
   * @param params - 已校验的参数对象
   */
  execute(params: unknown): Promise<unknown>;
}

/** 工具未注册时抛出。 */
export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Tool not found: ${name}`);
    this.name = 'ToolNotFoundError';
  }
}

/** 工具参数校验失败时抛出。 */
export class ToolParameterError extends Error {
  constructor(name: string, cause: unknown) {
    super(`Invalid parameters for tool '${name}': ${cause}`);
    this.name = 'ToolParameterError';
  }
}

/**
 * 工具注册表：按名称管理工具，并在执行前进行参数校验。
 */
export class ToolRegistry {
  /**
   * @param validate - 参数校验函数，接收 JSON Schema 和实际参数
   */
  constructor(private validate: (schema: object, params: unknown) => void = () => {}) {}

  private tools = new Map<string, Tool>();

  /** 注册一个工具。 */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 执行指定工具。
   * @param name - 工具名称
   * @param params - 调用参数
   * @returns 工具执行结果
   * @throws {ToolNotFoundError} 工具未注册
   * @throws {ToolParameterError} 参数校验失败
   */
  async execute(name: string, params: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    try {
      this.validate(tool.parameters, params);
    } catch (cause) {
      throw new ToolParameterError(name, cause);
    }
    try {
      return await tool.execute(params);
    } catch (cause) {
      throw new ToolExecutionError(name, cause);
    }
  }

  /** 列出所有已注册工具。 */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}
