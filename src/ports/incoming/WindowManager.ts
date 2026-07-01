export interface WindowInfo {
  id: number;
  title: string;
  /** 进程名（不含 .exe） */
  processName?: string;
  /** 应用显示名 */
  appName?: string;
  /** 可执行文件路径，可作为图标来源 */
  iconPath?: string | null;
  /** 窗口语义角色 */
  role?: WindowRole;
}

export type WindowRole =
  'assistant' | 'terminal' | 'browser' | 'editor' | 'file_manager' | 'chat' | 'unknown';

export interface WindowEvent {
  type: 'create' | 'destroy' | 'title-change';
  id: number;
  title: string;
}

export interface WindowManager {
  findWindows(): WindowInfo[];
  focusWindow(id: number): Promise<void>;
  closeWindow(id: number): Promise<void>;
  getActiveWindow(): number | null;
  watchEvents(cb: (e: WindowEvent) => void): { stop(): void };
}
