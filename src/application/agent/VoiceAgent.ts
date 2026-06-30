import { AsrEngine } from '../../ports/incoming/AsrEngine';
import { AuditLogger, AuditEntry } from '../../ports/outgoing/AuditLogger';
import { EventBus } from '../events/EventBus';
import {
  AgentPlanner,
  AgentPlannerContext,
  AgentPlannerResponse,
} from '../../domain/services/AgentPlanner';
import { RiskClassifier } from '../../domain/services/RiskClassifier';
import { PlanExecutor, PlanExecutionResult } from '../../domain/services/PlanExecutor';

/** VoiceAgent 运行配置。 */
export interface VoiceAgentConfig {
  /** 判定为指令的最小置信度 */
  confidenceThreshold?: number;
  /** 音频采样率 */
  sampleRate?: number;
}

/**
 * VoiceAgent：常驻监听型语音 agent 的核心编排器。
 * 负责把 PCM 音频流转为 ASR 文本，再经规划、风险分类、执行，最终输出结果与审计日志。
 */
export class VoiceAgent {
  /**
   * @param asr - ASR 引擎
   * @param planner - Agent 规划器
   * @param riskClassifier - 风险分类器
   * @param executor - 计划执行器
   * @param eventBus - 内部事件总线
   * @param audit - 审计日志器
   * @param getContext - 返回当前桌面上下文的函数，允许同步或异步
   * @param config - 运行配置
   */
  constructor(
    private asr: AsrEngine,
    private planner: AgentPlanner,
    private riskClassifier: RiskClassifier,
    private executor: PlanExecutor,
    private eventBus: EventBus,
    private audit: AuditLogger,
    private getContext: () => AgentPlannerContext | Promise<AgentPlannerContext> = () => ({
      windows: [],
      recentActions: [],
      preferences: {},
    }),
    private config: VoiceAgentConfig = {},
  ) {}

  /**
   * 处理一段 PCM 音频：识别 → 规划 → 执行。
   * @param pcm - 原始 PCM 音频数据
   */
  async onPcm(pcm: Buffer): Promise<void> {
    this.eventBus.emit('agent:transcribing');
    const text = await this.asr.transcribe(pcm, this.config.sampleRate ?? 16000);

    // 空识别直接忽略，避免对无意义音频继续处理
    if (!text) {
      this.eventBus.emit('agent:ignored', { reason: 'empty transcription' });
      return;
    }

    this.eventBus.emit('agent:planning', { text });

    let response: AgentPlannerResponse;
    let context: AgentPlannerContext;
    try {
      context = await this.getContext();
      response = await this.planner.plan(text, context);
    } catch (error) {
      this.eventBus.emit('agent:plan-failed', {
        text,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // 低置信度或非指令：忽略并记录审计
    if (!response.isCommand || response.confidence < (this.config.confidenceThreshold ?? 0.7)) {
      this.eventBus.emit('agent:ignored', { text, reason: response.reason });
      this.audit.log(this.makeAuditEntry(text, response, { status: 'success' }));
      return;
    }

    if (!response.plan) {
      this.eventBus.emit('agent:ignored', { text, reason: 'command without plan' });
      return;
    }

    const classified = this.riskClassifier.classify(response.plan, context.riskWhitelist);
    this.eventBus.emit('agent:acting', { plan: classified });

    // 高风险计划需要人类确认；若存在明确的高风险工具，先请求权限
    if (!classified.canAutoExecute) {
      const blockedTools = classified.steps
        .filter((s) => s.risk === 'high' && !context.riskWhitelist?.includes(s.tool))
        .map((s) => s.tool);

      if (blockedTools.length > 0) {
        this.eventBus.emit('agent:permission-request', {
          text,
          plan: classified,
          tools: blockedTools,
        });
      } else {
        this.eventBus.emit('agent:needs-human', { text, plan: classified });
      }
      this.audit.log(this.makeAuditEntry(text, response, { status: 'success' }));
      return;
    }

    const result = await this.executor.execute(classified);

    if (result.status === 'success') {
      this.eventBus.emit('agent:success', { text, plan: classified });
    } else {
      this.eventBus.emit('agent:step-failed', { text, plan: classified, result });
    }

    this.audit.log(this.makeAuditEntry(text, response, result));
  }

  /** 生成审计条目。 */
  private makeAuditEntry(
    triggerText: string,
    response: AgentPlannerResponse,
    executionResult: PlanExecutionResult,
  ): AuditEntry {
    return {
      timestamp: Date.now(),
      triggerText,
      response: {
        isCommand: response.isCommand,
        confidence: response.confidence,
        plan: response.plan,
        reason: response.reason,
      },
      executionResult: {
        status: executionResult.status,
        failedStep: executionResult.failedStep,
        error: executionResult.error instanceof Error ? executionResult.error.message : undefined,
      },
    };
  }
}
