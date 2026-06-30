"""关闭指定 HWND 的窗口"""
import sys, ctypes
hwnd = int(sys.argv[1])
WM_CLOSE = 0x0010
ctypes.windll.user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
print('ok')
