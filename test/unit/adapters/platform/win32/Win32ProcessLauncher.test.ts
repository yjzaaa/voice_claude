import { Win32ProcessLauncher } from '../../../../../src/adapters/platform/win32/Win32ProcessLauncher';
import { WindowManager, WindowInfo } from '../../../../../src/ports/incoming/WindowManager';

describe('Win32ProcessLauncher', () => {
  let spawnCalls: { command: string; args: string[]; options: any }[];
  let spawnedChildren: { on: (event: string, cb: any) => void; unref?: () => void }[];
  let windows: WindowInfo[];
  let launcher: Win32ProcessLauncher;

  beforeEach(() => {
    spawnCalls = [];
    spawnedChildren = [];
    windows = [];

    const windowManager: WindowManager = {
      findWindows: () => windows,
      focusWindow: () => Promise.resolve(),
      closeWindow: () => Promise.resolve(),
      getActiveWindow: () => null,
      watchEvents: () => ({ stop: () => {} }),
    };

    const spawn = (command: string, args: string[], options: any) => {
      spawnCalls.push({ command, args, options });
      const child = { on: () => {}, unref: () => {} };
      spawnedChildren.push(child);
      return child;
    };

    const sleep = () => Promise.resolve();

    launcher = new Win32ProcessLauncher(windowManager, spawn, sleep, { maxAttempts: 5 });
  });

  test('launches Windows Terminal with a titled Claude tab and returns the new window id', async () => {
    windows = [{ id: 1, title: 'existing' }];
    const promise = launcher.launchTerminal('dev-1');

    windows = [
      { id: 1, title: 'existing' },
      { id: 2, title: 'dev-1' },
    ];

    const result = await promise;
    expect(result).toBe(2);
    expect(spawnCalls[0].command).toBe('wt.exe');
    expect(spawnCalls[0].args).toEqual(['--title', 'dev-1', 'cmd', '/c', 'claude']);
    expect(spawnCalls[0].options.detached).toBe(true);
  });

  test('returns null if no new window appears within max attempts', async () => {
    windows = [{ id: 1, title: 'existing' }];
    const result = await launcher.launchTerminal('dev-1');
    expect(result).toBeNull();
  });

  test('unrefs the spawned process to let Electron exit cleanly', async () => {
    const unrefSpy = jest.fn();
    const spawn = () => ({ on: () => {}, unref: unrefSpy });
    const windowManager: WindowManager = {
      findWindows: () => [{ id: 1, title: 'existing' }],
      focusWindow: () => Promise.resolve(),
      closeWindow: () => Promise.resolve(),
      getActiveWindow: () => null,
      watchEvents: () => ({ stop: () => {} }),
    };
    const launcher = new Win32ProcessLauncher(windowManager, spawn, () => Promise.resolve(), { maxAttempts: 1 });
    await launcher.launchTerminal('dev-1');
    expect(unrefSpy).toHaveBeenCalled();
  });
});
