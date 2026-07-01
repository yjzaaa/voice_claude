/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { useRecordingState } from '../../../../../src/renderer/status/hooks/useRecordingState';

describe('useRecordingState', () => {
  afterEach(() => {
    delete (window as any).statusAPI;
  });

  test('subscribes to statusAPI and reflects state changes', () => {
    let stateChangeHandler: (recording: boolean) => void = () => {};
    let readyStateChangeHandler: (ready: boolean) => void = () => {};
    const toggle = jest.fn();

    (window as any).statusAPI = {
      toggle,
      onStateChange: (fn: (recording: boolean) => void) => {
        stateChangeHandler = fn;
      },
      onRecorderReadyStateChange: (fn: (ready: boolean) => void) => {
        readyStateChangeHandler = fn;
      },
      removeAllListeners: jest.fn(),
    };

    const { result } = renderHook(() => useRecordingState());
    expect(result.current.recording).toBe(false);
    expect(result.current.ready).toBe(false);

    act(() => readyStateChangeHandler(true));
    expect(result.current.ready).toBe(true);

    act(() => stateChangeHandler(true));
    expect(result.current.recording).toBe(true);

    act(() => result.current.toggle());
    expect(toggle).toHaveBeenCalled();
  });

  test('reports error when statusAPI is unavailable', () => {
    const { result } = renderHook(() => useRecordingState());
    expect(result.current.error).toBe('IPC 未连接');
  });

  test('removes listeners on unmount', () => {
    const removeAllListeners = jest.fn();
    (window as any).statusAPI = {
      toggle: jest.fn(),
      onStateChange: jest.fn(),
      onRecorderReadyStateChange: jest.fn(),
      removeAllListeners,
    };

    const { unmount } = renderHook(() => useRecordingState());
    unmount();
    expect(removeAllListeners).toHaveBeenCalled();
  });
});
