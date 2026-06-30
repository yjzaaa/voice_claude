/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Settings } from '../../../../src/renderer/status/Settings';

describe('Settings', () => {
  const createMockAPI = () => ({
    getPreferences: jest
      .fn()
      .mockResolvedValue({ llm: { apiKey: 'sk-test' }, asr: { backend: 'google' } }),
    setPreferences: jest.fn().mockResolvedValue(undefined),
    getRiskWhitelist: jest.fn().mockResolvedValue(['send_text']),
    addRiskWhitelist: jest.fn().mockResolvedValue(undefined),
    removeRiskWhitelist: jest.fn().mockResolvedValue(undefined),
    getRecentActions: jest.fn().mockResolvedValue(['success: open code']),
  });

  let mockAPI: ReturnType<typeof createMockAPI>;

  beforeEach(() => {
    mockAPI = createMockAPI();
    (window as any).settingsAPI = mockAPI;
  });

  afterEach(() => {
    delete (window as any).settingsAPI;
  });

  test('loads and displays preferences, whitelist and recent actions', async () => {
    render(<Settings onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('设置')).toBeInTheDocument());

    expect(screen.getByDisplayValue('sk-test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('google')).toBeInTheDocument();
    expect(screen.getByText('send_text')).toBeInTheDocument();
    expect(screen.getByText('success: open code')).toBeInTheDocument();
    expect(mockAPI.getPreferences).toHaveBeenCalled();
    expect(mockAPI.getRiskWhitelist).toHaveBeenCalled();
    expect(mockAPI.getRecentActions).toHaveBeenCalled();
  });

  test('shows error when settings API is unavailable', async () => {
    delete (window as any).settingsAPI;
    render(<Settings onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(/IPC 未连接/)).toBeInTheDocument());
  });

  test('saves preferences when save button is clicked', async () => {
    render(<Settings onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('设置')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: 'sk-new' } });
    fireEvent.change(screen.getByPlaceholderText('google_stt'), { target: { value: 'doubao' } });
    fireEvent.click(screen.getByText('保存偏好'));

    await waitFor(() => {
      expect(mockAPI.setPreferences).toHaveBeenCalledWith({
        llm: { apiKey: 'sk-new' },
        asr: { backend: 'doubao' },
      });
    });
  });

  test('adds a tool to the whitelist', async () => {
    render(<Settings onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('设置')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('输入工具名，按回车添加'), {
      target: { value: 'close_window' },
    });
    fireEvent.click(screen.getByText('添加'));

    await waitFor(() => expect(mockAPI.addRiskWhitelist).toHaveBeenCalledWith('close_window'));
  });

  test('removes a tool from the whitelist', async () => {
    render(<Settings onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('send_text')).toBeInTheDocument());

    fireEvent.click(screen.getByText('删除'));
    await waitFor(() => expect(mockAPI.removeRiskWhitelist).toHaveBeenCalledWith('send_text'));
  });

  test('calls onClose when back button is clicked', async () => {
    const onClose = jest.fn();
    render(<Settings onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('设置')).toBeInTheDocument());

    fireEvent.click(screen.getByText('← 返回'));
    expect(onClose).toHaveBeenCalled();
  });
});
