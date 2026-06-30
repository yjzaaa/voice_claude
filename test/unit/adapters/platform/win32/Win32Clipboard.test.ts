import { Win32Clipboard } from '../../../../../src/adapters/platform/win32/Win32Clipboard';

describe('Win32Clipboard', () => {
  let execCalls: { command: string; options: any }[];
  let clipboard: Win32Clipboard;

  beforeEach(() => {
    execCalls = [];
    const execSync = (command: string, options?: any) => {
      execCalls.push({ command, options });
      if (command.includes('Get-Clipboard')) return 'copied text';
      return '';
    };
    clipboard = new Win32Clipboard(execSync);
  });

  test('writeText calls Set-Clipboard with the text', () => {
    clipboard.writeText('hello world');

    expect(execCalls.length).toBe(1);
    expect(execCalls[0].command).toContain("Set-Clipboard -Value 'hello world'");
  });

  test('writeText escapes single quotes in text', () => {
    clipboard.writeText("it's fine");

    expect(execCalls[0].command).toContain("Set-Clipboard -Value 'it''s fine'");
  });

  test('readText returns trimmed clipboard content', () => {
    const result = clipboard.readText();

    expect(execCalls.length).toBe(1);
    expect(execCalls[0].command).toContain('Get-Clipboard');
    expect(result).toBe('copied text');
  });

  test('readText trims trailing whitespace', () => {
    const execSync = () => '  text with spaces  \n';
    const cb = new Win32Clipboard(execSync);
    expect(cb.readText()).toBe('text with spaces');
  });
});
