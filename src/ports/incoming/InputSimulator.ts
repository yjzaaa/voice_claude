export interface InputSimulator {
  sendKeys(...keys: string[]): void;
  pasteAndEnter(): void;
}
