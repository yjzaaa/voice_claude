import { useEffect, useRef, useState } from 'react';
import { getAgentAPI } from '../../shared/api';

export type AgentStep =
  'idle' | 'transcribing' | 'planning' | 'acting' | 'completed' | 'error' | 'needs-human';

export interface AgentPlanStep {
  tool: string;
  risk?: 'low' | 'medium' | 'high' | 'critical';
}

export interface AgentPlan {
  goal: string;
  steps: AgentPlanStep[];
  canAutoExecute?: boolean;
}

export interface AgentState {
  /** 当前步骤状态 */
  step: AgentStep;
  /** 当前步骤的显示文本 */
  status: string;
  /** 最近一次识别文本 */
  lastTranscript: string | null;
  /** 当前计划目标 */
  planGoal: string | null;
  /** 当前计划最高风险等级 */
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | null;
  /** 当前执行耗时（毫秒） */
  executionDuration: number;
  /** 最近一次失败的错误信息 */
  lastError: string | null;
}

interface EventPayload {
  text?: string;
  reason?: string;
  error?: string;
  plan?: AgentPlan;
  result?: { status: string; error?: string };
}

const STATUS_LABELS: Record<AgentStep | string, string> = {
  idle: '就绪',
  transcribing: '🎙️ 识别中',
  planning: '🧠 规划中',
  acting: '⚡ 执行中',
  completed: '✅ 完成',
  error: '❌ 失败',
  'needs-human': '🛑 需确认',
};

function getHighestRisk(steps?: AgentPlanStep[]): AgentState['riskLevel'] {
  if (!steps || steps.length === 0) return null;
  const order: AgentState['riskLevel'][] = ['low', 'medium', 'high', 'critical'];
  let maxIndex = -1;
  for (const step of steps) {
    const idx = order.indexOf(step.risk ?? 'low');
    if (idx > maxIndex) maxIndex = idx;
  }
  return maxIndex >= 0 ? order[maxIndex] : null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 订阅主进程 agent 生命周期事件，返回当前步骤、调试信息和状态文本。
 */
export function useAgentState(): AgentState {
  const [state, setState] = useState<AgentState>({
    step: 'idle',
    status: STATUS_LABELS.idle,
    lastTranscript: null,
    planGoal: null,
    riskLevel: null,
    executionDuration: 0,
    lastError: null,
  });
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const api = getAgentAPI();
    if (!api) return undefined;

    const updateDuration = () => {
      if (startRef.current == null) return;
      setState((prev) => ({
        ...prev,
        executionDuration: Date.now() - startRef.current!,
      }));
    };

    const clearDurationTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const startDurationTimer = () => {
      clearDurationTimer();
      startRef.current = Date.now();
      timerRef.current = setInterval(updateDuration, 100);
    };

    const stopDurationTimer = () => {
      clearDurationTimer();
      updateDuration();
      startRef.current = null;
    };

    const handlers: Record<string, (payload?: EventPayload) => void> = {
      transcribing: () => {
        startDurationTimer();
        setState((prev) => ({
          ...prev,
          step: 'transcribing',
          status: STATUS_LABELS.transcribing,
          lastError: null,
        }));
      },
      planning: (payload) => {
        setState((prev) => ({
          ...prev,
          step: 'planning',
          status: STATUS_LABELS.planning,
          lastTranscript: payload?.text ?? prev.lastTranscript,
          lastError: null,
        }));
      },
      acting: (payload) => {
        const plan = payload?.plan;
        setState((prev) => ({
          ...prev,
          step: 'acting',
          status: STATUS_LABELS.acting,
          planGoal: plan?.goal ?? prev.planGoal,
          riskLevel: getHighestRisk(plan?.steps),
          lastError: null,
        }));
      },
      success: () => {
        stopDurationTimer();
        setState((prev) => ({
          ...prev,
          step: 'completed',
          status: STATUS_LABELS.completed,
        }));
      },
      ignored: (payload) => {
        stopDurationTimer();
        setState((prev) => ({
          ...prev,
          step: 'completed',
          status: payload?.reason ? `⏭️ ${payload.reason}` : '⏭️ 已忽略',
        }));
      },
      'needs-human': (payload) => {
        stopDurationTimer();
        const plan = payload?.plan;
        setState((prev) => ({
          ...prev,
          step: 'needs-human',
          status: STATUS_LABELS['needs-human'],
          planGoal: plan?.goal ?? prev.planGoal,
          riskLevel: getHighestRisk(plan?.steps) ?? prev.riskLevel,
        }));
      },
      'step-failed': (payload) => {
        stopDurationTimer();
        setState((prev) => ({
          ...prev,
          step: 'error',
          status: STATUS_LABELS.error,
          lastError: payload?.result?.error ?? '执行失败',
        }));
      },
      'plan-failed': (payload) => {
        stopDurationTimer();
        setState((prev) => ({
          ...prev,
          step: 'error',
          status: STATUS_LABELS.error,
          lastError: payload?.error ?? '规划失败',
        }));
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      api.on(event, handler as (payload?: unknown) => void);
    }

    return () => {
      clearDurationTimer();
      for (const event of Object.keys(handlers)) {
        api.removeAllListeners(event);
      }
    };
  }, []);

  return state;
}

export { formatDuration };
