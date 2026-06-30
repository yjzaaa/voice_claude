import { InputSimulator } from '../../../ports/incoming/InputSimulator';

export class Win32InputSimulator implements InputSimulator {
  constructor(
    private keybdEvent: (vk: number, scan: number, flags: number, extra: number) => void,
    private sleep: (ms: number) => void,
  ) {}

  sendKeys(...keys: string[]): void {
    const keyMap: Record<string, number> = {
      ctrl: 0x11,
      v: 0x56,
      enter: 0x0d,
      shift: 0x10,
      alt: 0x12,
      tab: 0x09,
      escape: 0x1b,
      backspace: 0x08,
      up: 0x26,
      down: 0x28,
      left: 0x25,
      right: 0x27,
      space: 0x20,
    };

    const codes = keys
      .map((k) => keyMap[k.toLowerCase()])
      .filter((v): v is number => v !== undefined);

    if (codes.length === 0) return;

    for (const c of codes) {
      this.keybdEvent(c, 0, 0, 0);
      this.sleep(50);
    }
    this.sleep(80);
    for (const c of [...codes].reverse()) {
      this.keybdEvent(c, 0, 2, 0);
      this.sleep(50);
    }
  }

  pasteAndEnter(): void {
    this.sendKeys('ctrl', 'v');
    this.sendKeys('enter');
  }
}
