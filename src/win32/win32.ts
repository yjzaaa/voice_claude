/**
 * Win32 桥接 — 通过 PowerShell 操控窗口和剪贴板
 */
import { execSync } from 'child_process';

function ps(script: string): string {
  try {
    return execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8', timeout: 5000,
    }).trim();
  } catch { return ''; }
}

/** 查找 Claude Code 窗口 */
export function findClaudeWindows(): { hwnd: number; title: string; kind: string }[] {
  const result: { hwnd: number; title: string; kind: string }[] = [];
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type @'
      using System; using System.Runtime.InteropServices; using System.Text;
      public class Win32 {
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
        [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
      }
'@
    $results = @()
    $cb = [Win32+EnumWindowsProc]{
      param($h, $l)
      if (-not [Win32]::IsWindowVisible($h)) { return $true }
      $t = New-Object System.Text.StringBuilder(512)
      [Win32]::GetWindowText($h, $t, 512)
      $title = $t.ToString()
      if (-not $title) { return $true }
      $c = New-Object System.Text.StringBuilder(256)
      [Win32]::GetClassName($h, $c, 256)
      $cls = $c.ToString().ToLower()
      $isTerminal = $cls -match 'cascadia|conhost|console'
      $hasStar = $title -match '✳'
      $hasClaude = $title -match 'claude'
      if ($isTerminal -and ($hasStar -or $hasClaude)) {
        $results += @{hwnd=$h.ToString(); title=$title; kind='claude_terminal'}
      }
      return $true
    }
    [Win32]::EnumWindows($cb, [IntPtr]::Zero)
    ConvertTo-Json -Compress @($results)
  `;
  try {
    const raw = ps(script);
    if (raw) {
      const items = JSON.parse(raw);
      for (const item of items) {
        result.push({ hwnd: parseInt(item.hwnd), title: item.title, kind: item.kind });
      }
    }
  } catch { /* PowerShell failed, return empty */ }
  return result;
}

/** 获取前台窗口 HWND */
export function getForegroundHwnd(): number | null {
  const r = ps('[System.Windows.Forms.Form]::ActiveForm; (Get-Process -Id (Get-Process | ?{$_.MainWindowTitle -ne ""} | Select -First 1).Id).MainWindowHandle');
  return r ? parseInt(r) || null : null;
}

/** 聚焦窗口 */
export function focusWindow(hwnd: number): void {
  ps(`
    Add-Type -Name Win32 -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);'
    [Win32.Win32]::ShowWindow([IntPtr]${hwnd}, 5)
    [Win32.Win32]::SetForegroundWindow([IntPtr]${hwnd})
  `);
}

/** 设置剪贴板文字 */
export function setClipboard(text: string): void {
  ps(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.Clipboard]::SetText('${text.replace(/'/g, "''")}')
  `);
}

/** 获取剪贴板文字 */
export function getClipboard(): string {
  return ps('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()');
}

/** 发送组合键 (Ctrl+V, Enter 等) 到指定窗口 */
export function sendKeys(hwnd: number, ...keys: string[]): void {
  const keyMap: Record<string, number> = { ctrl: 0x11, v: 0x56, enter: 0x0D };
  const codes = keys.map(k => keyMap[k] || 0).filter(Boolean);
  if (codes.length === 0) return;
  focusWindow(hwnd);

  const presses = codes.map(c => `[Win32.Win32]::keybd_event(${c}, 0, 0, 0)`).join('; Start-Sleep -Milliseconds 30; ');
  const releases = codes.reverse().map(c => `[Win32.Win32]::keybd_event(${c}, 0, 2, 0)`).join('; Start-Sleep -Milliseconds 30; ');
  ps(`
    Add-Type -Name Win32 -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, IntPtr extra);'
    ${presses}; Start-Sleep -Milliseconds 80; ${releases}
  `);
}

/** 粘贴+回车 */
export function pasteAndEnter(hwnd: number): void {
  sendKeys(hwnd, 'ctrl', 'v');
  setTimeout(() => sendKeys(hwnd, 'enter'), 100);
}

/** 启动新 Claude Code 窗口 */
export function launchClaudeCode(title: string): number | null {
  const before = new Set(findClaudeWindows().map(w => w.hwnd));
  ps(`Start-Process wt.exe -ArgumentList '--title','${title}','cmd','/c','claude'`);
  // 等新窗口
  for (let i = 0; i < 20; i++) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    const after = findClaudeWindows();
    for (const w of after) {
      if (!before.has(w.hwnd)) return w.hwnd;
    }
  }
  return null;
}
