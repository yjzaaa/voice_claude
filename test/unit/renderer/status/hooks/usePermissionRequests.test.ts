/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { usePermissionRequests } from '../../../../../src/renderer/status/hooks/usePermissionRequests';

describe('usePermissionRequests', () => {
  let requestHandler: (payload: unknown) => void = () => {};
  const respondPermission = jest.fn();
  const removeAllListeners = jest.fn();

  beforeEach(() => {
    requestHandler = () => {};
    respondPermission.mockReset();
    removeAllListeners.mockReset();

    (window as any).permissionAPI = {
      onPermissionRequest: (fn: (payload: unknown) => void) => {
        requestHandler = fn;
      },
      respondPermission,
      removeAllListeners,
    };
  });

  afterEach(() => {
    delete (window as any).permissionAPI;
  });

  const makeRequest = (id: string, text: string, tools: string[] = ['typeText']) => ({
    requestId: id,
    text,
    plan: { goal: '打开记事本', steps: [{ tool: 'typeText' }] },
    tools,
  });

  test('subscribes to permission requests', () => {
    const { result } = renderHook(() => usePermissionRequests());
    expect(result.current.current).toBeNull();

    act(() => requestHandler(makeRequest('r1', '打开记事本')));
    expect(result.current.current?.requestId).toBe('r1');
  });

  test('responds to current request and advances queue', () => {
    const { result } = renderHook(() => usePermissionRequests());

    act(() => {
      requestHandler(makeRequest('r1', '第一句'));
      requestHandler(makeRequest('r2', '第二句'));
    });
    expect(result.current.current?.requestId).toBe('r1');

    act(() => result.current.respond(true, false));
    expect(respondPermission).toHaveBeenCalledWith({
      allow: true,
      remember: false,
      requestId: 'r1',
    });
    expect(result.current.current?.requestId).toBe('r2');
  });

  test('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => usePermissionRequests());
    unmount();
    expect(removeAllListeners).toHaveBeenCalled();
  });

  test('does nothing when permissionAPI is unavailable', () => {
    delete (window as any).permissionAPI;
    const { result } = renderHook(() => usePermissionRequests());
    expect(result.current.current).toBeNull();
    expect(() => act(() => result.current.respond(true, false))).not.toThrow();
  });
});
