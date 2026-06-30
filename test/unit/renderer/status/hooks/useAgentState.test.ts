/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { useAgentState } from '../../../../../src/renderer/status/hooks/useAgentState';

const listeners: Record<string, ((payload?: unknown) => void)[]> = {};

describe('useAgentState', () => {
  beforeEach(() => {
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    (window as any).agentAPI = {
      on: (event: string, fn: (payload?: unknown) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      },
      removeAllListeners: jest.fn(),
    };
  });

  afterEach(() => {
    delete (window as any).agentAPI;
  });

  function emit(event: string, payload?: unknown) {
    listeners[event]?.forEach((fn) => fn(payload));
  }

  test('returns idle state when API is unavailable', () => {
    delete (window as any).agentAPI;
    const { result } = renderHook(() => useAgentState());
    expect(result.current.step).toBe('idle');
    expect(result.current.status).toBe('就绪');
  });

  test('tracks transcribing step', () => {
    const { result } = renderHook(() => useAgentState());
    act(() => emit('transcribing'));
    expect(result.current.step).toBe('transcribing');
    expect(result.current.status).toBe('🎙️ 识别中');
  });

  test('captures transcript on planning event', () => {
    const { result } = renderHook(() => useAgentState());
    act(() => emit('transcribing'));
    act(() => emit('planning', { text: '打开浏览器' }));
    expect(result.current.step).toBe('planning');
    expect(result.current.lastTranscript).toBe('打开浏览器');
  });

  test('captures goal and highest risk on acting event', () => {
    const { result } = renderHook(() => useAgentState());
    act(() => emit('transcribing'));
    act(() => emit('planning', { text: '访问' }));
    act(() =>
      emit('acting', {
        plan: {
          goal: '打开 Chrome',
          steps: [
            { tool: 'write', risk: 'low' },
            { tool: 'run', risk: 'high' },
          ],
        },
      }),
    );
    expect(result.current.step).toBe('acting');
    expect(result.current.planGoal).toBe('打开 Chrome');
    expect(result.current.riskLevel).toBe('high');
  });

  test('measures execution duration', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAgentState());
    act(() => emit('transcribing'));
    act(() => emit('acting', { plan: { goal: '测试', steps: [] } }));
    act(() => jest.advanceTimersByTime(250));
    expect(result.current.executionDuration).toBeGreaterThanOrEqual(200);
    jest.useRealTimers();
  });

  test('stops duration and shows success', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useAgentState());
    act(() => emit('transcribing'));
    act(() => emit('acting', { plan: { goal: '测试', steps: [] } }));
    act(() => jest.advanceTimersByTime(300));
    act(() => emit('success'));
    expect(result.current.step).toBe('completed');
    expect(result.current.executionDuration).toBeGreaterThanOrEqual(200);
    jest.useRealTimers();
  });

  test('captures error on step-failed', () => {
    const { result } = renderHook(() => useAgentState());
    act(() => emit('step-failed', { result: { status: 'error', error: '权限不足' } }));
    expect(result.current.step).toBe('error');
    expect(result.current.lastError).toBe('权限不足');
  });

  test('captures error on plan-failed', () => {
    const { result } = renderHook(() => useAgentState());
    act(() => emit('plan-failed', { text: '指令', error: '规划失败' }));
    expect(result.current.step).toBe('error');
    expect(result.current.lastError).toBe('规划失败');
  });

  test('shows needs-human step with plan info', () => {
    const { result } = renderHook(() => useAgentState());
    act(() =>
      emit('needs-human', {
        text: '删除文件',
        plan: { goal: '删除文件', steps: [{ tool: 'delete', risk: 'high' }] },
      }),
    );
    expect(result.current.step).toBe('needs-human');
    expect(result.current.planGoal).toBe('删除文件');
    expect(result.current.riskLevel).toBe('high');
  });

  test('removes listeners on unmount', () => {
    const removeAllListeners = jest.fn();
    (window as any).agentAPI = {
      on: jest.fn(),
      removeAllListeners,
    };
    const { unmount } = renderHook(() => useAgentState());
    unmount();
    expect(removeAllListeners).toHaveBeenCalled();
  });
});
