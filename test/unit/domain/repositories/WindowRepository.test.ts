import { WindowRepository } from '../../../../src/domain/repositories/WindowRepository';
import { WindowManager, WindowInfo } from '../../../../src/ports/incoming/WindowManager';
import { EventBus } from '../../../../src/application/events/EventBus';

describe('WindowRepository', () => {
  test('scans windows and stores them', () => {
    const windows: WindowInfo[] = [{ id: 1, title: 'terminal-1' }];
    const windowManager: WindowManager = {
      findWindows: () => windows,
      focusWindow: jest.fn(),
      closeWindow: jest.fn(),
      getActiveWindow: () => 1,
      watchEvents: () => ({ stop: () => {} }),
    };
    const bus = new EventBus();
    const repo = new WindowRepository(windowManager, bus);

    repo.scan();

    expect(repo.getWindows()).toEqual(windows);
    expect(repo.getActiveWindowId()).toBe(1);
  });

  test('emits window:scan event after scanning', () => {
    const windows: WindowInfo[] = [{ id: 2, title: 'code-1' }];
    const windowManager: WindowManager = {
      findWindows: () => windows,
      focusWindow: jest.fn(),
      closeWindow: jest.fn(),
      getActiveWindow: () => null,
      watchEvents: () => ({ stop: () => {} }),
    };
    const bus = new EventBus();
    const handler = jest.fn();
    bus.on('window:scan', handler);
    const repo = new WindowRepository(windowManager, bus);

    repo.scan();

    expect(handler).toHaveBeenCalledWith({ windows, active: null });
  });
});
