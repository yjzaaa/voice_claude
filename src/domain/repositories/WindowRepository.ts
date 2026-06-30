import { WindowManager } from '../../ports/incoming/WindowManager';
import { EventBus } from '../../application/events/EventBus';

/**
 * 被 WindowRepository 追踪的窗口快照。
 */
export interface TrackedWindow {
  id: number;
  title: string;
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
    this.windows = this.windowManager.findWindows();
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
}
