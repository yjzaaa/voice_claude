/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../../../../src/renderer/status/App';
import * as hook from '../../../../src/renderer/status/hooks/useRecordingState';

describe('App', () => {
  const useRecordingStateSpy = jest.spyOn(hook, 'useRecordingState');

  afterEach(() => {
    useRecordingStateSpy.mockReset();
  });

  test('renders idle state', () => {
    useRecordingStateSpy.mockReturnValue({ recording: false, error: null, toggle: jest.fn() });
    render(<App />);
    expect(screen.getByText('voice_claude')).toBeInTheDocument();
    expect(screen.getByText('就绪')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('开始录音');
  });

  test('renders recording state', () => {
    useRecordingStateSpy.mockReturnValue({ recording: true, error: null, toggle: jest.fn() });
    render(<App />);
    expect(screen.getByText('🔴 录音中...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('停止录音');
  });

  test('calls toggle on button click', () => {
    const toggle = jest.fn();
    useRecordingStateSpy.mockReturnValue({ recording: false, error: null, toggle });
    render(<App />);
    fireEvent.click(screen.getByRole('button'));
    expect(toggle).toHaveBeenCalled();
  });

  test('shows error message', () => {
    useRecordingStateSpy.mockReturnValue({ recording: false, error: 'IPC 未连接', toggle: jest.fn() });
    render(<App />);
    expect(screen.getByText('❌ IPC 未连接')).toBeInTheDocument();
  });
});
