import { Win32WindowManager } from '../../../../../src/adapters/platform/win32/Win32WindowManager';
import { WindowEvent } from '../../../../../src/ports/incoming/WindowManager';

describe('Win32WindowManager', () => {
  let execCalls: { command: string; options: any }[];
  let spawnCalls: { command: string; args: string[]; options: any }[];
  const eventHandlers: { stdout?: (data: Buffer) => void; stderr?: (data: Buffer) => void } = {};
  let fakeProcess: { kill: jest.Mock; stdout: { on: jest.Mock }; stderr: { on: jest.Mock } };
  let manager: Win32WindowManager;

  beforeEach(() => {
    execCalls = [];
    spawnCalls = [];

    const execSync = (command: string, options?: any) => {
      execCalls.push({ command, options });
      if (command.includes('find_win.py')) return '101|Claude Dev\n102|terminal-2\n';
      if (command.includes('focus_win.py')) return '';
      if (command.includes('kill_win.py')) return '';
      if (command.includes('GetForegroundWindow')) return '101';
      return '';
    };

    fakeProcess = {
      kill: jest.fn(),
      stdout: {
        on: jest.fn((event, cb) => {
          eventHandlers.stdout = cb;
        }),
      },
      stderr: {
        on: jest.fn((event, cb) => {
          eventHandlers.stderr = cb;
        }),
      },
    };

    const spawn = (command: string, args: string[], options: any) => {
      spawnCalls.push({ command, args, options });
      return fakeProcess as any;
    };

    manager = new Win32WindowManager({
      pythonExecutable: 'py.exe',
      scriptRoot: '/scripts',
      execSync,
      spawn,
    });
  });

  test('findWindows parses Python script output', () => {
    const windows = manager.findWindows();
    expect(windows).toEqual([
      { id: 101, title: 'Claude Dev' },
      { id: 102, title: 'terminal-2' },
    ]);
    expect(execCalls[0].command).toContain('py.exe');
    expect(execCalls[0].command).toContain('find_win.py');
  });

  test('findWindows returns empty array on failure', () => {
    const failingManager = new Win32WindowManager({
      pythonExecutable: 'py.exe',
      scriptRoot: '/scripts',
      execSync: () => {
        throw new Error('boom');
      },
      spawn: () => fakeProcess as any,
    });
    expect(failingManager.findWindows()).toEqual([]);
  });

  test('focusWindow runs focus_win.py', async () => {
    await manager.focusWindow(101);
    expect(execCalls[0].command).toContain('focus_win.py');
    expect(execCalls[0].command).toContain('101');
  });

  test('closeWindow runs kill_win.py', async () => {
    await manager.closeWindow(101);
    expect(execCalls[0].command).toContain('kill_win.py');
    expect(execCalls[0].command).toContain('101');
  });

  test('getActiveWindow parses foreground handle', () => {
    expect(manager.getActiveWindow()).toBe(101);
  });

  test('getActiveWindow returns null on failure', () => {
    const failingManager = new Win32WindowManager({
      pythonExecutable: 'py.exe',
      scriptRoot: '/scripts',
      execSync: () => {
        throw new Error('boom');
      },
      spawn: () => fakeProcess as any,
    });
    expect(failingManager.getActiveWindow()).toBeNull();
  });

  test('watchEvents spawns watch_win.py and forwards parsed events', () => {
    const events: WindowEvent[] = [];
    const handle = manager.watchEvents((e: WindowEvent) => events.push(e));

    expect(spawnCalls[0].command).toBe('py.exe');
    expect(spawnCalls[0].args[0]).toContain('watch_win.py');

    eventHandlers.stdout!(
      Buffer.from(JSON.stringify({ event: 'create', hwnd: 103, title: 'new' })),
    );
    eventHandlers.stdout!(Buffer.from('\n'));

    expect(events).toEqual([{ type: 'create', id: 103, title: 'new' }]);

    handle.stop();
    expect(fakeProcess.kill).toHaveBeenCalled();
  });

  test('watchEvents ignores malformed lines without throwing', () => {
    const events: WindowEvent[] = [];
    manager.watchEvents((e: WindowEvent) => events.push(e));

    expect(() => {
      eventHandlers.stdout!(Buffer.from('not-json\n'));
    }).not.toThrow();

    expect(events).toEqual([]);
  });
});
