# Phase 3 进展：ASR 适配器 + 音频捕获

## 目标

从旧 `src/asr/` 提取 ASR 引擎适配器，实现 `AsrEngine` port；将录音模块重构为 `ElectronAudioCapture`，实现 `AudioCapture` port 并通过事件输出 PCM。

## 已完成

### CompositeAsrEngine

| 文件 | 端口 | 说明 |
|------|------|------|
| `src/adapters/asr/CompositeAsrEngine.ts` | `AsrEngine` | 按优先级持有多个引擎，依次尝试 `isAvailable()` 为 true 的引擎，任一成功即返回文本；全部失败返回 `null`。 |
| `test/unit/adapters/asr/CompositeAsrEngine.test.ts` | ✅ 5/5 | 首个可用、跳过不可用、全部失败、无可用、isAvailable 聚合。 |

### ElectronAudioCapture

| 文件 | 端口 | 说明 |
|------|------|------|
| `src/adapters/audio/ElectronAudioCapture.ts` | `AudioCapture` | 通过注入的 `BrowserWindow` 工厂与 `ipcMain` 管理隐藏录音窗口；`recorder:ready`、`recorder:pcm`、`recorder:log` 事件驱动；`start/stop/toggle` 与 `onStateChange/onPcm` 符合 port。 |
| `test/unit/adapters/audio/ElectronAudioCapture.test.ts` | ✅ 5/5 | 窗口创建、就绪后启动、状态回调、PCM 累积与 stop Promise、toggle。 |

### 新增目录

- `src/adapters/asr/`
- `src/adapters/audio/`
- `test/unit/adapters/asr/`
- `test/unit/adapters/audio/`

## 待完成

- `DoubaoAsrEngine`：从 `src/asr/doubao.ts` 提取，注入 `DoubaoConfig` 与网络依赖。
- `VoskAsrEngine`：从 `src/asr/vosk.ts` 提取，注入 `BrowserWindow` 工厂与模型路径。
- `AsrEngineFactory`：根据 `config.asr.backend` 组合 Doubao / Vosk / Composite。
- 在 `composition-root.ts` 中装配 `audioCapture` 与 `asrEngine`。

## 验证命令

```bash
npm run test:unit
npm run build
```

## 当前状态

Phase 3 完成 2/5 子任务：16 个测试文件、73 个测试用例全部通过，`npm run build` 无错误。旧 `src/asr/doubao.ts`、`src/asr/vosk.ts`、`src/asr/recorder.ts` 仍保持原样，未被破坏。

---
记录时间：2026-06-29
