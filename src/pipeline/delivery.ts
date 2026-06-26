/**
 * Delivery — 剪贴板投递到目标窗口
 */
import { setClipboard, getClipboard, pasteAndEnter, focusWindow } from '../win32/win32';
import { Instance } from '../instance/registry';
import { Router } from '../instance/router';

export class DeliveryWorker {
  private router: Router;
  private queue: string[] = [];
  private running = false;
  private delivered = 0;

  constructor(router: Router) { this.router = router; }

  feed(text: string) { this.queue.push(text); if (!this.running) this.process(); }

  private async process() {
    this.running = true;
    while (this.queue.length > 0) {
      const text = this.queue.shift()!;
      const target = await this.router.resolve(text);
      if (!target || this.router.wasCommand()) continue;

      const saved = getClipboard();
      setClipboard(text);
      await sleep(100);
      pasteAndEnter(target.hwnd);
      await sleep(300);
      setClipboard(saved);
      this.delivered++;
      await sleep(2000); // cooldown
    }
    this.running = false;
  }

  count(): number { return this.delivered; }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
