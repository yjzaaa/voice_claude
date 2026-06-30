export interface Clipboard {
  writeText(text: string): void;
  readText(): string;
}
