"""查找所有 Claude Code 窗口"""
import ctypes
from ctypes import wintypes
user32 = ctypes.windll.user32
result = []
WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
def cb(hwnd, _):
    if not user32.IsWindowVisible(hwnd): return True
    n = user32.GetWindowTextLengthW(hwnd)
    if n == 0: return True
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    t = buf.value
    if '✳' in t or 'claude' in t.lower():
        result.append(f'{hwnd}|{t[:60]}')
    return True
user32.EnumWindows(WNDENUMPROC(cb), 0)
for r in result: print(r)
