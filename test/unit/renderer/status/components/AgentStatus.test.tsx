/** @jest-environment jsdom */
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

  test('shows default status', () => {
    render(<AgentStatus />);
    expect(screen.getByTestId('agent-status').textContent).toBe('就绪');
  });

  test('updates status on agent events', () => {
    render(<AgentStatus />);
    act(() => emit('transcribing'));
    expect(screen.getByTestId('agent-status').textContent).toBe('🎙️ 识别中...');
    act(() => emit('success'));
    expect(screen.getByTestId('agent-status').textContent).toBe('✅ 完成');
  });
});
