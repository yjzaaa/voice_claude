import { ProcessLauncher } from '../../../ports/incoming/ProcessLauncher';
import { WindowManager } from '../../../ports/incoming/WindowManager';

export interface Win32ProcessLauncherOptions {
  maxAttempts?: number;
  intervalMs?: number;
}

interface SpawnedProcess {
  unref?(): void;
}

export class Win32ProcessLauncher implements ProcessLauncher {
  constructor(
    private windowManager: WindowManager,
    private spawn: (command: string, args: string[], options: any) => SpawnedProcess,
    private sleep: (ms: number) => Promise<void>,
    private options: Win32ProcessLauncherOptions = {},
  ) {}

  async launchTerminal(title: string): Promise<number | null> {
    const maxAttempts = this.options.maxAttempts ?? 20;
    const intervalMs = this.options.intervalMs ?? 500;

    const before = new Set(this.windowManager.findWindows().map((w) => w.id));

    const child = this.spawn('wt.exe', ['--title', title, 'cmd', '/c', 'claude'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref?.();

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(intervalMs);
      const after = this.windowManager.findWindows();
      for (const w of after) {
        if (!before.has(w.id)) {
          return w.id;
        }
      }
    }

    return null;
  }
}
