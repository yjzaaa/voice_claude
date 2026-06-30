/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../../../src/renderer/status/App';
import * as recordingHook from '../../../../src/renderer/status/hooks/useRecordingState';

jest.mock('../../../../src/renderer/status/components/StatusIcon', () => ({
  StatusIcon: ({ recording }: { recording: boolean }) => (
    <div data-testid="status-icon">{recording ? 'recording' : 'idle'}</div>
  ),
}));

jest.mock('../../../../src/renderer/status/components/DebugPanel', () => ({
  DebugPanel: ({ recording }: { recording: boolean }) => (
    <div data-testid="debug-panel">{recording ? 'debug-recording' : 'debug-idle'}</div>
  ),
}));

jest.mock('../../../../src/renderer/status/components/AgentStatus', () => ({
  AgentStatus: () => <div data-testid="agent-status-mock">AgentStatus</div>,
}));

describe('App', () => {
  const useRecordingStateSpy = jest.spyOn(recordingHook, 'useRecordingState');

  beforeEach(() => {
    (window as any).settingsAPI = {
      getPreferences: jest.fn().mockResolvedValue({}),
      setPreferences: jest.fn().mockResolvedValue(undefined),
      getRiskWhitelist: jest.fn().mockResolvedValue([]),
      addRiskWhitelist: jest.fn().mockResolvedValue(undefined),
      removeRiskWhitelist: jest.fn().mockResolvedValue(undefined),
      getRecentActions: jest.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => {
    useRecordingStateSpy.mockReset();
    delete (window as any).settingsAPI;
  });

  test('renders idle state', () => {
    useRecordingStateSpy.mockReturnValue({ recording: false, error: null, toggle: jest.fn() });
    render(<App />);
    expect(screen.getByText('voice_claude')).toBeInTheDocument();
    expect(screen.getByText('就绪')).toBeInTheDocument();
    expect(screen.getByText('开始录音')).toBeInTheDocument();
    expect(screen.getByTestId('status-icon')).toHaveTextContent('idle');
  });

  test('renders recording state', () => {
    useRecordingStateSpy.mockReturnValue({ recording: true, error: null, toggle: jest.fn() });
    render(<App />);
    expect(screen.getByText('🔴 录音中...')).toBeInTheDocument();
    expect(screen.getByText('停止录音')).toBeInTheDocument();
    expect(screen.getByTestId('status-icon')).toHaveTextContent('recording');
  });

  test('calls toggle on status button click', () => {
    const toggle = jest.fn();
    useRecordingStateSpy.mockReturnValue({ recording: false, error: null, toggle });
    render(<App />);
    fireEvent.click(screen.getByText('开始录音'));
    expect(toggle).toHaveBeenCalled();
  });

  test('shows error message', () => {
    useRecordingStateSpy.mockReturnValue({
      recording: false,
      error: 'IPC 未连接',
      toggle: jest.fn(),
    });
    render(<App />);
    expect(screen.getByText('❌ IPC 未连接')).toBeInTheDocument();
  });

  test('opens settings page when gear is clicked and can go back', async () => {
    useRecordingStateSpy.mockReturnValue({ recording: false, error: null, toggle: jest.fn() });
    render(<App />);

    fireEvent.click(screen.getByLabelText('设置'));
    await waitFor(() => expect(screen.getByText('设置')).toBeInTheDocument());
    expect(screen.getByText('偏好设置')).toBeInTheDocument();

    fireEvent.click(screen.getByText('← 返回'));
    expect(screen.getByText('voice_claude')).toBeInTheDocument();
  });
});
