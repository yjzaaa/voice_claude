import { Tool } from '../../domain/services/ToolRegistry';
import { InputSimulator } from '../../ports/incoming/InputSimulator';
import { WindowManager } from '../../ports/incoming/WindowManager';
import { ProcessLauncher } from '../../ports/incoming/ProcessLauncher';
import { Clipboard } from '../../ports/incoming/Clipboard';

/**
 * 创建“发送文本”工具：直接模拟键盘输入文本并回车，绕过剪贴板竞争。
 * @param inputSimulator - 键盘输入模拟器
 */
export function createSendTextTool(inputSimulator: InputSimulator): Tool {
  return {
    name: 'send_text',
    description: 'Type text into the active window and press Enter',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    risk: 'low',
    async execute(params: unknown) {
      const { text } = params as { text: string };
      inputSimulator.typeText(text);
      inputSimulator.sendKeys('enter');
    },
  };
}

/**
 * 创建“聚焦窗口”工具。
 * @param windowManager - 窗口管理器
 */
export function createFocusWindowTool(windowManager: WindowManager): Tool {
  return {
    name: 'focus_window',
    description: 'Focus a window by its numeric ID',
    parameters: {
      type: 'object',
      properties: { windowId: { type: 'number' } },
      required: ['windowId'],
    },
    risk: 'low',
    async execute(params: unknown) {
      const { windowId } = params as { windowId: number };
      await windowManager.focusWindow(windowId);
    },
  };
}

/**
 * 创建“关闭窗口”工具（高风险，默认禁止自主执行）。
 * @param windowManager - 窗口管理器
 */
export function createCloseWindowTool(windowManager: WindowManager): Tool {
  return {
    name: 'close_window',
    description: 'Close a window by its numeric ID',
    parameters: {
      type: 'object',
      properties: { windowId: { type: 'number' } },
      required: ['windowId'],
    },
    risk: 'high',
    async execute(params: unknown) {
      const { windowId } = params as { windowId: number };
      await windowManager.closeWindow(windowId);
    },
  };
}

/**
 * 创建“获取窗口列表”工具，用于 agent 观察桌面状态。
 * @param windowManager - 窗口管理器
 */
export function createGetWindowListTool(windowManager: WindowManager): Tool {
  return {
    name: 'get_window_list',
    description: 'List all tracked windows',
    parameters: { type: 'object', properties: {} },
    risk: 'read',
    async execute() {
      return windowManager.findWindows();
    },
  };
}

/**
 * 创建“获取当前焦点窗口”工具。
 * @param windowManager - 窗口管理器
 */
export function createGetActiveWindowTool(windowManager: WindowManager): Tool {
  return {
    name: 'get_active_window',
    description: 'Return the ID of the currently focused window',
    parameters: { type: 'object', properties: {} },
    risk: 'read',
    async execute() {
      return windowManager.getActiveWindow();
    },
  };
}

/**
 * 创建“启动进程”工具：打开一个新的终端窗口。
 * @param processLauncher - 进程启动器
 */
export function createLaunchProcessTool(processLauncher: ProcessLauncher): Tool {
  return {
    name: 'launch_process',
    description: 'Launch a new terminal window and return its window ID',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
    },
    risk: 'medium',
    async execute(params: unknown) {
      const { title } = params as { title: string };
      return processLauncher.launchTerminal(title);
    },
  };
}

/**
 * 创建“写入剪贴板”工具，用于需要显式复制的场景。
 * @param clipboard - 剪贴板端口
 */
export function createSetClipboardTool(clipboard: Clipboard): Tool {
  return {
    name: 'set_clipboard',
    description: 'Write text to the clipboard',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    risk: 'low',
    async execute(params: unknown) {
      const { text } = params as { text: string };
      clipboard.writeText(text);
    },
  };
}
