export interface WindowInfo {
  id: number;
  title: string;
}

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
