/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { DebugPanel } from '../../../../../src/renderer/status/components/DebugPanel';

describe('DebugPanel', () => {
  const listeners: Record<string, ((payload?: unknown) => void)[]> = {};

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

  test('shows recording hint when recording', () => {
    render(<DebugPanel recording />);
    expect(screen.getByText('正在听，请说话（静音1.5秒自动结束）')).toBeInTheDocument();
  });

  test('shows idle hint when not recording and no data', () => {
    render(<DebugPanel recording={false} />);
    expect(screen.getByText('等待语音输入...')).toBeInTheDocument();
  });

  test('shows latest transcript from planning event', () => {
    render(<DebugPanel recording={false} />);
    act(() => emit('planning', { text: '打开浏览器' }));
    expect(screen.getByTestId('debug-transcript')).toHaveTextContent('打开浏览器');
  });

  test('shows plan goal and risk level from acting event', () => {
    render(<DebugPanel recording={false} />);
    act(() =>
      emit('acting', {
        plan: { goal: '打开 Chrome', steps: [{ tool: 'run', risk: 'high' }] },
      }),
    );
    expect(screen.getByTestId('debug-goal')).toHaveTextContent('打开 Chrome');
    expect(screen.getByTestId('debug-risk')).toHaveTextContent('高');
  });

  test('shows error from step-failed event', () => {
    render(<DebugPanel recording={false} />);
    act(() => emit('step-failed', { result: { status: 'error', error: '权限不足' } }));
    expect(screen.getByTestId('debug-error')).toHaveTextContent('权限不足');
  });
});
