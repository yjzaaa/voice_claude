/**
 * 键盘/输入模拟端口。
 * 所有平台相关的按键操作必须封装在实现中。
 */
export interface InputSimulator {
  /** 按顺序按下并释放一组虚拟按键（如 ctrl + v）。 */
  sendKeys(...keys: string[]): void;
  /** 模拟“粘贴并回车”的快捷操作。 */
  pasteAndEnter(): void;
  /** 直接以 Unicode 字符模拟键盘输入，绕过剪贴板。 */
  typeText(text: string): void;
}
