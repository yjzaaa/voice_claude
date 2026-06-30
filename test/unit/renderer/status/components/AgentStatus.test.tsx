/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { AgentStatus } from '../../../../../src/renderer/status/components/AgentStatus';

describe('AgentStatus', () => {
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

  test('renders step labels by default', () => {
    render(<AgentStatus />);
    expect(screen.getByTestId('agent-step-transcribing')).toHaveTextContent('识别中');
    expect(screen.getByTestId('agent-step-planning')).toHaveTextContent('规划中');
    expect(screen.getByTestId('agent-step-acting')).toHaveTextContent('执行中');
    expect(screen.getByTestId('agent-status-label')).toHaveTextContent('就绪');
  });

  test('marks transcribing step active', () => {
    render(<AgentStatus />);
    act(() => emit('transcribing'));
    expect(screen.getByTestId('agent-status-label')).toHaveTextContent('🎙️ 识别中');
  });

  test('marks planning and previous steps completed', () => {
    render(<AgentStatus />);
    act(() => emit('transcribing'));
    act(() => emit('planning', { text: '打开浏览器' }));
    expect(screen.getByTestId('agent-status-label')).toHaveTextContent('🧠 规划中');
    expect(screen.getByTestId('agent-connector-0')).toBeInTheDocument();
  });

  test('marks acting and completes previous connectors', () => {
    render(<AgentStatus />);
    act(() => emit('transcribing'));
    act(() => emit('planning', { text: '打开浏览器' }));
    act(() => emit('acting', { plan: { goal: '打开 Chrome', steps: [] } }));
    expect(screen.getByTestId('agent-status-label')).toHaveTextContent('⚡ 执行中');
  });

  test('shows success status', () => {
    render(<AgentStatus />);
    act(() => emit('success'));
    expect(screen.getByTestId('agent-status-label')).toHaveTextContent('✅ 完成');
  });

  test('shows needs-human status', () => {
    render(<AgentStatus />);
    act(() => emit('needs-human', { text: '删除文件', plan: { goal: '删除', steps: [] } }));
    expect(screen.getByTestId('agent-status-label')).toHaveTextContent('🛑 需确认');
  });

  test('shows step-failed status with error styling', () => {
    render(<AgentStatus />);
    act(() => emit('step-failed', { result: { status: 'error', error: '权限不足' } }));
    expect(screen.getByTestId('agent-status-label')).toHaveTextContent('❌ 失败');
  });
});
