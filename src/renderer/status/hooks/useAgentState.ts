import { useEffect, useState } from 'react';
import { getAgentAPI } from '../../shared/api';

const EVENT_TO_STATUS: Record<string, string> = {
  transcribing: '🎙️ 识别中...',
  planning: '🧠 规划中...',
  acting: '⚡ 执行中...',
  success: '✅ 完成',
  ignored: '⏭️ 已忽略',
  'needs-human': '🛑 需确认',
  'step-failed': '❌ 执行失败',
  'plan-failed': '❌ 规划失败',
};

/**
 * 订阅主进程 agent 生命周期事件，返回当前状态文本。
 */
export function useAgentState(): { status: string } {
  const [status, setStatus] = useState('就绪');

  useEffect(() => {
    const api = getAgentAPI();
    if (!api) return undefined;

    const handlers: Record<string, (payload?: unknown) => void> = {};
    for (const [event, label] of Object.entries(EVENT_TO_STATUS)) {
      handlers[event] = () => setStatus(label);
      api.on(event, handlers[event]);
    }

    return () => {
      for (const event of Object.keys(handlers)) {
        api.removeAllListeners(event);
      }
    };
  }, []);

  return { status };
}
