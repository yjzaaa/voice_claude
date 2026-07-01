"""查找所有相关窗口，并返回 HWND、标题、进程名、可执行路径。"""
import os
import ctypes
from ctypes import wintypes

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
psapi = ctypes.windll.psapi

WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)


def window_title(hwnd):
    n = user32.GetWindowTextLengthW(hwnd)
    if n == 0:
        return ""
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return buf.value


def process_info(hwnd):
    """返回 (process_name, exe_path) 或 ('', None)。"""
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    hproc = kernel32.OpenProcess(0x0410, False, pid.value)  # QUERY_INFORMATION | VM_READ
    if not hproc:
        return "", None
    try:
        buf = ctypes.create_unicode_buffer(1024)
        psapi.GetModuleFileNameExW(hproc, None, buf, 1024)
        exe_path = buf.value
        name = os.path.basename(exe_path).replace('.exe', '') if exe_path else ''
        return name, exe_path
    finally:
        kernel32.CloseHandle(hproc)


def is_relevant(title, process_name):
    """保留与 Claude 相关的窗口，或常见终端/编辑器窗口。"""
    t = title.lower()
    p = process_name.lower()
    keywords = ['claude', '✳', 'cmd', 'powershell', 'terminal', 'code', 'cursor', 'wt.exe']
    return any(k in t or k in p for k in keywords)


result = []


def cb(hwnd, _):
    if not user32.IsWindowVisible(hwnd):
        return True
    title = window_title(hwnd)
    if not title:
        return True
    process_name, exe_path = process_info(hwnd)
    if not is_relevant(title, process_name):
        return True
    # 字段顺序：hwnd|title|processName|iconPath
    result.append(f'{hwnd}|{title[:80]}|{process_name}|{exe_path or ""}')
    return True


user32.EnumWindows(WNDENUMPROC(cb), 0)
for r in result:
    print(r)
