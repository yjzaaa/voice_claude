import { Clipboard } from '../../../ports/incoming/Clipboard';

export class Win32Clipboard implements Clipboard {
  constructor(private execSync: (command: string, options?: any) => Buffer | string) {}

  writeText(text: string): void {
    const escaped = text.replace(/'/g, "''");
    this.execSync(`powershell.exe -Command "Set-Clipboard -Value '${escaped}'"`, {
      windowsHide: true,
      timeout: 2000,
    });
  }

  readText(): string {
    const result = this.execSync('powershell.exe -Command "Get-Clipboard"', {
      windowsHide: true,
      timeout: 2000,
      encoding: 'utf-8',
    });
    return (result?.toString() ?? '').trim();
  }
}
