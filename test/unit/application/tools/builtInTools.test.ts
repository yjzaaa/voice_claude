import {
  createSendTextTool,
  createFocusWindowTool,
  createLaunchProcessTool,
  createGetWindowListTool,
} from '../../../../src/application/tools/builtInTools';
import { InputSimulator } from '../../../../src/ports/incoming/InputSimulator';
import { WindowManager, WindowInfo } from '../../../../src/ports/incoming/WindowManager';
import { ProcessLauncher } from '../../../../src/ports/incoming/ProcessLauncher';

describe('builtInTools', () => {
  test('send_text types text and presses enter', async () => {
    const calls: string[] = [];
    const inputSimulator: InputSimulator = {
      sendKeys: (...keys) => {
        calls.push(keys.join('+'));
      },
      pasteAndEnter: jest.fn(),
      typeText: (text) => {
        calls.push(`type:${text}`);
      },
    };
    const tool = createSendTextTool(inputSimulator);

    await tool.execute({ text: 'hello' });

    expect(calls).toEqual(['type:hello', 'enter']);
  });

  test('focus_window focuses the target window', async () => {
    const focused: number[] = [];
    const windowManager: WindowManager = {
      findWindows: () => [],
      focusWindow: async (id) => {
        focused.push(id);
      },
      closeWindow: jest.fn(),
      getActiveWindow: () => null,
      watchEvents: () => ({ stop: () => {} }),
    };
    const tool = createFocusWindowTool(windowManager);

    await tool.execute({ windowId: 42 });

    expect(focused).toEqual([42]);
  });

  test('launch_process launches a terminal and returns window id', async () => {
    const processLauncher: ProcessLauncher = {
      launchTerminal: jest.fn().mockResolvedValue(99),
    };
    const tool = createLaunchProcessTool(processLauncher);

    const result = await tool.execute({ title: 'dev-1' });

    expect(processLauncher.launchTerminal).toHaveBeenCalledWith('dev-1');
    expect(result).toBe(99);
  });

  test('get_window_list returns window list', async () => {
    const windows: WindowInfo[] = [{ id: 1, title: 'terminal-1' }];
    const windowManager: WindowManager = {
      findWindows: () => windows,
      focusWindow: jest.fn(),
      closeWindow: jest.fn(),
      getActiveWindow: () => null,
      watchEvents: () => ({ stop: () => {} }),
    };
    const tool = createGetWindowListTool(windowManager);

    const result = await tool.execute({});

    expect(result).toEqual(windows);
  });
});
