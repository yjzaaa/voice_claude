import { WindowInfo, WindowManager, WindowRole } from '../../ports/incoming/WindowManager';
import { EventBus } from '../../application/events/EventBus';

/**
 * 被 WindowRepository 追踪的窗口快照。
 */
export interface TrackedWindow {
  id: number;
  title: string;
  processName?: string;
  appName?: string;
  iconPath?: string | null;
  role?: WindowRole;
}

/**
 * 窗口仓库：维护当前桌面窗口列表与焦点窗口，为 AgentPlanner 提供上下文。
 */
export class WindowRepository {
  private windows: TrackedWindow[] = [];
  private activeWindowId: number | null = null;

  /**
   * @param windowManager - 窗口管理器
   * @param eventBus - 内部事件总线
   */
  constructor(
    private windowManager: WindowManager,
    private eventBus: EventBus,
  ) {}

  /** 重新扫描桌面窗口并更新内部状态。 */
  scan(): void {
    const found = this.windowManager.findWindows();
    this.windows = dedupWindows(found.map(adaptWindow));
    this.activeWindowId = this.windowManager.getActiveWindow();
    this.eventBus.emit('window:scan', { windows: this.windows, active: this.activeWindowId });
  }

  /** 获取最近一次扫描到的窗口列表。 */
  getWindows(): TrackedWindow[] {
    return this.windows;
  }

  /** 获取当前焦点窗口 ID。 */
  getActiveWindowId(): number | null {
    return this.activeWindowId;
  }

  /** 获取指定 ID 窗口的标题。 */
  getWindowTitle(id: number): string | undefined {
    return this.windows.find((w) => w.id === id)?.title;
  }

  /** 获取指定 ID 窗口的完整信息。 */
  getWindowById(id: number): TrackedWindow | undefined {
    return this.windows.find((w) => w.id === id);
  }
}

function adaptWindow(info: WindowInfo): TrackedWindow {
  return {
    id: info.id,
    title: info.title,
    processName: info.processName,
    appName: info.appName,
    iconPath: info.iconPath,
    role: info.role,
  };
}

function dedupWindows(windows: TrackedWindow[]): TrackedWindow[] {
  const seen = new Set<number>();
  const result: TrackedWindow[] = [];
  for (const w of windows) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    result.push(w);
  }
  return result;
}
