import { WindowRepository } from '../../../../src/domain/repositories/WindowRepository';
import { WindowManager, WindowInfo } from '../../../../src/ports/incoming/WindowManager';
import { EventBus } from '../../../../src/application/events/EventBus';

describe('WindowRepository', () => {
  test('scans windows and stores enhanced fields', () => {
    const windows: WindowInfo[] = [
      {
        id: 1,
        title: 'terminal-1',
        processName: 'WindowsTerminal',
        appName: 'Windows Terminal',
        iconPath: 'C:\\wt.exe',
        role: 'terminal',
      },
    ];
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
    expect(repo.getWindowById(1)).toEqual(windows[0]);
  });

  test('emits window:scan event with enhanced context', () => {
    const windows: WindowInfo[] = [
      { id: 2, title: 'code-1', processName: 'Code', appName: 'VS Code', role: 'editor' },
    ];
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

    expect(handler).toHaveBeenCalledWith({
      windows: [
        { id: 2, title: 'code-1', processName: 'Code', appName: 'VS Code', role: 'editor' },
      ],
      active: null,
    });
  });

  test('deduplicates windows by id', () => {
    const windows: WindowInfo[] = [
      { id: 3, title: 'a', processName: 'a' },
      { id: 3, title: 'a-dup', processName: 'a' },
      { id: 4, title: 'b', processName: 'b' },
    ];
    const windowManager: WindowManager = {
      findWindows: () => windows,
      focusWindow: jest.fn(),
      closeWindow: jest.fn(),
      getActiveWindow: () => null,
      watchEvents: () => ({ stop: () => {} }),
    };
    const repo = new WindowRepository(windowManager, new EventBus());
    repo.scan();

    expect(repo.getWindows()).toHaveLength(2);
    expect(repo.getWindows().map((w) => w.id)).toEqual([3, 4]);
  });

  test('getWindowById returns undefined for unknown id', () => {
    const windowManager: WindowManager = {
      findWindows: () => [],
      focusWindow: jest.fn(),
      closeWindow: jest.fn(),
      getActiveWindow: () => null,
      watchEvents: () => ({ stop: () => {} }),
    };
    const repo = new WindowRepository(windowManager, new EventBus());
    repo.scan();
    expect(repo.getWindowById(999)).toBeUndefined();
  });
});
