"""WinEvent Hook 实时监听 Claude 窗口创建/销毁，stdout 输出 JSON"""
import ctypes, ctypes.wintypes, json, sys, time, threading

user32 = ctypes.windll.user32
ole32 = ctypes.windll.ole32
kernel32 = ctypes.windll.kernel32

def window_title(hwnd):
    n = user32.GetWindowTextLengthW(hwnd)
    if n == 0: return ""
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return buf.value

def is_claude_window(hwnd):
    title = window_title(hwnd)
    if not title: return False
    return '✳' in title or 'claude' in title.lower()

EVENT_OBJECT_CREATE = 0x8000
EVENT_OBJECT_DESTROY = 0x8001
EVENT_OBJECT_SHOW = 0x8002
WINEVENT_OUTOFCONTEXT = 0

WinEventProc = ctypes.WINFUNCTYPE(None, ctypes.wintypes.HANDLE, ctypes.wintypes.DWORD,
    ctypes.wintypes.HWND, ctypes.wintypes.LONG, ctypes.wintypes.LONG,
    ctypes.wintypes.DWORD, ctypes.wintypes.DWORD)

def callback(hook, event, hwnd, idObject, idChild, thread, time_ms):
    if idObject != 0 or idChild != 0: return
    if not user32.IsWindow(hwnd): return
    title = window_title(hwnd)
    if not is_claude_window(hwnd): return
    if event in (EVENT_OBJECT_CREATE, EVENT_OBJECT_SHOW):
        print(json.dumps({"event": "create", "hwnd": hwnd, "title": title}), flush=True)
    elif event == EVENT_OBJECT_DESTROY:
        print(json.dumps({"event": "destroy", "hwnd": hwnd, "title": title}), flush=True)

cb = WinEventProc(callback)
hook1 = user32.SetWinEventHook(EVENT_OBJECT_CREATE, EVENT_OBJECT_CREATE, 0, cb, 0, 0, WINEVENT_OUTOFCONTEXT)
hook2 = user32.SetWinEventHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_DESTROY, 0, cb, 0, 0, WINEVENT_OUTOFCONTEXT)
hook3 = user32.SetWinEventHook(EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW, 0, cb, 0, 0, WINEVENT_OUTOFCONTEXT)

ole32.CoInitialize(0)
msg = ctypes.wintypes.MSG()
while True:
    while user32.PeekMessageW(ctypes.byref(msg), 0, 0, 0, 1):
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))
    time.sleep(0.1)
