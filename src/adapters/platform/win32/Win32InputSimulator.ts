import { InputSimulator } from '../../../ports/incoming/InputSimulator';

/** Win32 SendInput 所需的输入事件结构。 */
export type Win32Input = {
  type: number;
  ki: { wScan: number; dwFlags: number };
};

/**
 * Windows 平台输入模拟器实现。
 * 通过注入的底层函数与 Win32 API 交互，便于单元测试。
 */
export class Win32InputSimulator implements InputSimulator {
  /**
   * @param keybdEvent - keybd_event 函数实现
   * @param sleep - 休眠函数实现
   * @param sendInput - SendInput 函数实现，用于 Unicode 输入
   */
  constructor(
    private keybdEvent: (vk: number, scan: number, flags: number, extra: number) => void,
    private sleep: (ms: number) => void,
    private sendInput: (inputs: Win32Input[]) => void = () => {},
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

    // 依次按下所有按键
    for (const c of codes) {
      this.keybdEvent(c, 0, 0, 0);
      this.sleep(50);
    }
    this.sleep(80);
    // 按相反顺序释放，避免组合键卡死
    for (const c of [...codes].reverse()) {
      this.keybdEvent(c, 0, 2, 0);
      this.sleep(50);
    }
  }

  pasteAndEnter(): void {
    this.sendKeys('ctrl', 'v');
    this.sendKeys('enter');
  }

  typeText(text: string): void {
    const INPUT_KEYBOARD = 1;
    const KEYEVENTF_UNICODE = 0x0004;
    const KEYEVENTF_KEYUP = 0x0002;

    // 每个字符发送 Unicode 按下/抬起事件，避免剪贴板竞争
    for (const char of text) {
      const scan = char.charCodeAt(0);
      this.sendInput([
        { type: INPUT_KEYBOARD, ki: { wScan: scan, dwFlags: KEYEVENTF_UNICODE } },
        { type: INPUT_KEYBOARD, ki: { wScan: scan, dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP } },
      ]);
      this.sleep(30);
    }
  }
}
