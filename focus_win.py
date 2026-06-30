"""聚焦窗口 — AttachThreadInput 绕过 Windows 焦点限制"""
import sys, ctypes
from ctypes import wintypes

hwnd = int(sys.argv[1])
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# AttachThreadInput — 把自己线程挂到前台线程，骗过 Windows
fg = user32.GetForegroundWindow()
our_tid = kernel32.GetCurrentThreadId()
fg_tid = user32.GetWindowThreadProcessId(fg, None)
user32.AttachThreadInput(our_tid, fg_tid, True)

# 现在可以抢焦点了
user32.ShowWindow(hwnd, 9)   # SW_RESTORE
user32.BringWindowToTop(hwnd)
user32.SetForegroundWindow(hwnd)
user32.ShowWindow(hwnd, 5)   # SW_SHOW

user32.AttachThreadInput(our_tid, fg_tid, False)
print('ok')
