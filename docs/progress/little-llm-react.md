# little-llm 库 + React 前端改造 进展

## 已完成

### little-llm 库

新增 provider-agnostic LLM 适配器库，位于 `src/adapters/llm/`：

| 文件 | 说明 |
|------|------|
| `src/adapters/llm/Provider.ts` | 内部 provider 契约（`ProviderConfig`、`Provider`）。 |
| `src/adapters/llm/internal/HttpsJsonClient.ts` | Node 内置 `https`/`http` JSON POST 客户端，通过 `HttpClient` 接口注入，便于测试。 |
| `src/adapters/llm/providers/OpenAiCompatibleProvider.ts` | 通用 `/v1/chat/completions` 提供商。 |
| `src/adapters/llm/providers/DeepSeekProvider.ts` | DeepSeek 提供商，继承 OpenAI-compatible 协议。 |
| `src/adapters/llm/LittleLlmClient.ts` | 实现 `LlmClient` port，支持 `timeoutMs` 覆盖。 |
| `src/adapters/llm/LlmClientFactory.ts` | 根据 `config.llm.apiUrl` 自动选择 provider。 |
| `src/adapters/llm/errors.ts` | `LlmError`、`LlmTimeoutError`、`LlmAuthError`。 |

`composition-root.ts` 现在装配 `llmClient`，并加入 `AppServices`。

新增测试 13 个：

- `test/unit/adapters/llm/internal/HttpsJsonClient.test.ts` ✅ 4/4
- `test/unit/adapters/llm/providers/OpenAiCompatibleProvider.test.ts` ✅ 3/3
- `test/unit/adapters/llm/providers/DeepSeekProvider.test.ts` ✅ 1/1
- `test/unit/adapters/llm/LittleLlmClient.test.ts` ✅ 3/3
- `test/unit/adapters/llm/LlmClientFactory.test.ts` ✅ 2/2

### React 前端改造

- 新增依赖：`react`、`react-dom`、`vite`、`@vitejs/plugin-react`、`@testing-library/react`、`@testing-library/jest-dom`、`jest-environment-jsdom`。
- 新增配置：`vite.config.ts`、`tsconfig.renderer.json`，更新 `jest.config.js` 支持 `*.test.tsx`，更新 `tsconfig.test.json` 支持 JSX。
- 新增 React status 页面：
  - `src/renderer/status.html`（Vite 入口）
  - `src/renderer/status/main.tsx`
  - `src/renderer/status/App.tsx`
  - `src/renderer/status/components/StatusIcon.tsx`
  - `src/renderer/status/components/StatusButton.tsx`
  - `src/renderer/status/components/DebugPanel.tsx`
  - `src/renderer/status/hooks/useRecordingState.ts`
  - `src/renderer/shared/api.ts`（preload API 类型封装）
- 原有 vanilla HTML 页面移动到 `html/`：
  - `html/speech.html`
  - `html/recorder.html`
  - `html/vosk.html`
  - `html/renderer.html`
- `src/main.ts` 更新：开发时加载 Vite dev server `http://localhost:5173/status.html`，生产时加载 `dist/renderer/status.html`。
- `src/asr/recorder.ts` 与 `src/asr/vosk.ts` 的 HTML 路径更新为 `html/recorder.html` / `html/vosk.html`。

新增 renderer 测试 8 个：

- `test/unit/renderer/status/hooks/useRecordingState.test.ts` ✅ 3/3
- `test/unit/renderer/status/components/StatusIcon.test.tsx` ✅ 2/2
- `test/unit/renderer/status/components/StatusButton.test.tsx` ✅ 3/3
- `test/unit/renderer/status/components/DebugPanel.test.tsx` ✅ 2/2
- `test/unit/renderer/status/App.test.tsx` ✅ 4/4

### AGENTS.md 更新

- 新增“前端开发规范”章节：技术栈、目录结构、IPC 边界、状态管理、构建命令、新增页面检查清单、frontend-dev agent 职责。
- 更新 TDD 测试命名规则为 `*.test.ts` / `*.test.tsx`。
- 更新当前状态描述。

## 验证

```bash
cd D:/voice_claude
npm run test:unit        # 26 suites, 101 tests passed
npm run build            # tsc + vite build 无错误
```

## 待继续

- Phase 3 剩余：提取 `DoubaoAsrEngine` 与 `VoskAsrEngine`。
- Phase 4：使用 `LlmClient` 实现 `IntentClassifier`、`Router`、`SchemaEnricher`。
- 前端：逐步将 `speech.html`、`recorder.html`、`vosk.html` 迁移到 React。

---
记录时间：2026-06-30
