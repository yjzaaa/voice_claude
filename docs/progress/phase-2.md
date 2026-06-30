# Phase 2 进展：平台适配器拆分

## 目标

从旧 `src/platform/win32.ts` 中拆出 4 个聚焦的 `Ports` 适配器，使窗口管理、输入模拟、剪贴板、进程启动各自独立，并可在 `composition-root.ts` 中装配。旧 `main.ts` 继续走旧的 `createPlatform()`，不被破坏。

## 已完成

### 新增适配器

| 文件 | 端口 | 说明 |
|------|------|------|
| `src/adapters/platform/win32/Win32WindowManager.ts` | `WindowManager` | 封装 `find_win.py`、`focus_win.py`、`kill_win.py`、`watch_win.py` 与前景窗口查询。 |
| `src/adapters/platform/win32/Win32InputSimulator.ts` | `InputSimulator` | 通过 koffi `keybd_event` 发送按键，`pasteAndEnter` 组合 `ctrl+v` + `enter`。 |
| `src/adapters/platform/win32/Win32Clipboard.ts` | `Clipboard` | 通过 PowerShell `Set-Clipboard` / `Get-Clipboard` 读写剪贴板。 |
| `src/adapters/platform/win32/Win32ProcessLauncher.ts` | `ProcessLauncher` | 启动 `wt.exe --title <title> cmd /c claude`，并轮询新窗口。 |

### 依赖注入

每个适配器都通过构造函数注入外部依赖（`execSync`、`spawn`、koffi 函数、`WindowManager`、sleep 等），单元测试无需调用真实 Win32 API 或子进程。

### 装配点更新

`src/composition-root.ts` 现在返回：

- `logger`、`metrics`、`eventBus`、`config`
- `windowManager`、`inputSimulator`、`clipboard`、`processLauncher`

平台脚本根目录通过 `path.resolve(__dirname, '..', '..', '..', '..')` 自动定位到项目根目录，Python 解释器路径可通过 `VOICE_CLAUDE_PYTHON_PATH` 覆盖，默认 `python.exe`。

### 测试

| 测试 | 状态 | 说明 |
|------|------|------|
| `test/unit/adapters/platform/win32/Win32InputSimulator.test.ts` | ✅ 5/5 | 按键映射、大小写、未知键忽略、粘贴+回车、事件间隔。 |
| `test/unit/adapters/platform/win32/Win32Clipboard.test.ts` | ✅ 4/4 | 写入文本、单引号转义、读取、trim。 |
| `test/unit/adapters/platform/win32/Win32ProcessLauncher.test.ts` | ✅ 3/3 | 启动并发现新窗口、超时返回 null、`unref`。 |
| `test/unit/adapters/platform/win32/Win32WindowManager.test.ts` | ✅ 8/8 | 窗口发现、失败兜底、聚焦、关闭、活动窗口、监听事件、 malformed 行忽略。 |
| `test/unit/composition-root.test.ts` | ✅ 3/3 | 核心服务 + Win32 平台适配器装配。 |

## 遇到的问题

1. **相对导入路径错误**：`test/unit/composition-root.test.ts` 最初写成 `../src/...`，应为 `../../src/...`。已修正。
2. **Windows 路径断言失败**：测试中用了 `/scripts/...`，而 `path.join` 在 Windows 下生成 `\\scripts\\...`。已改为只断言脚本名/可执行文件名，避免平台差异。
3. **TypeScript `ChildProcess` 类型过严**：测试注入的 fake spawn 对象不满足完整 `ChildProcess`。将 `Win32ProcessLauncher` 的 spawn 依赖收窄为 `{ unref?(): void }`。
4. **`Win32WindowManager` 测试中的闭包变量**：`eventHandlers` 在 jest.fn 闭包中使用，TypeScript 报使用前未赋值。已初始化为空对象 `{}`。

## 验证命令

```bash
# 全部单元测试
npm run test:unit

# TypeScript 检查
npm run build
```

## 当前状态

Phase 2 完成：14 个测试文件、63 个测试用例全部通过，`npm run build` 无错误。旧 `main.ts` 未改动，仍可独立运行。准备进入 Phase 3：ASR 适配器 + 音频捕获。

---
记录时间：2026-06-29
