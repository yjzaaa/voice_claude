# Phase 1 进展：端口 + 基础设施 + DI

## 目标

建立新架构骨架：目录结构、Ports 接口、事件总线、日志、配置、指标收集器，以及 `composition-root.ts` 初版。旧代码保持运行。

## 已完成

### 目录结构

- `src/application/events/`
- `src/ports/outgoing/`
- `src/ports/incoming/`
- `src/infrastructure/logging/`
- `src/infrastructure/metrics/`
- `src/adapters/config/`
- `test/unit/application/events/`
- `test/unit/infrastructure/logging/`
- `test/unit/infrastructure/metrics/`
- `test/unit/adapters/config/`
- `docs/`
- `docs/progress/`

### 代码

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/application/events/EventBus.ts` | ✅ | 内部事件总线，支持订阅/发布/取消订阅/异常隔离。 |
| `src/ports/outgoing/Logger.ts` | ✅ | 日志 Port 接口。 |
| `src/infrastructure/logging/FileLogger.ts` | ✅ | Logger 实现，JSON 格式、分级、投递指标。 |
| `src/ports/outgoing/MetricsCollector.ts` | ✅ | 指标收集 Port 接口。 |
| `src/infrastructure/metrics/InMemoryMetrics.ts` | ✅ | 内存指标实现，支持计数器、分布、标签。 |
| `src/ports/incoming/ConfigSource.ts` | ✅ | 配置 Port 与 `AppConfig` 类型。 |
| `src/adapters/config/EnvConfigSource.ts` | ✅ | 从 `VOICE_CLAUDE_*` 环境变量读取配置。 |
| `src/adapters/config/FileConfigSource.ts` | ✅ | 从 `~/.voice_claude.json` 读取并深层合并配置。 |
| `src/ports/incoming/*.ts` | ✅ | `AsrEngine`、`AudioCapture`、`WindowManager`、`InputSimulator`、`Clipboard`、`ProcessLauncher`、`LlmClient`。 |
| `src/composition-root.ts` | ✅ | 初版 DI 装配点，返回 `{ logger, metrics, eventBus, config }`。 |

### 测试

| 测试 | 状态 | 说明 |
|------|------|------|
| `test/unit/application/events/EventBus.test.ts` | ✅ 5/5 | 订阅、多监听器、取消订阅、空事件、异常隔离。 |
| `test/unit/infrastructure/logging/FileLogger.test.ts` | ✅ 5/5 | JSON 输出、分级、console 打印、投递指标、错误指标。 |
| `test/unit/infrastructure/metrics/InMemoryMetrics.test.ts` | ✅ 4/4 | 记录、递增、标签、空快照。 |
| `test/unit/adapters/config/EnvConfigSource.test.ts` | ✅ 4/4 | 环境变量读取与默认值。 |
| `test/unit/adapters/config/FileConfigSource.test.ts` | ✅ 4/4 | 文件读取、缺失文件、JSON 损坏、部分合并。 |
| `test/unit/composition-root.test.ts` | ✅ 2/2 | 核心服务创建、事件总线可正常使用。 |

### 基础设施/配置修复

- 新增 `tsconfig.test.json`，让 Jest 能正确编译 `test/` 下的文件。
- 更新 `jest.config.js`，让 `ts-jest` 使用 `tsconfig.test.json`。
- 修正 `package.json` 中的 Jest 脚本：`--testPathPattern` → `--testPathPatterns`（Jest 30）。

## 遇到的问题

1. **测试文件无法解析源码模块**：原因是相对路径层级数错（`test/unit/application/events/EventBus.test.ts` 到 `src` 应为 `../../../../src` 而非 `../../../src`）。已修正。
2. **Jest 找不到测试 tsconfig**：原 `ts-jest` 配置为空，导致 test 目录文件不在编译范围内。通过新增 `tsconfig.test.json` 解决。
3. **`composition-root.test.ts` 导入路径错误**：`test/unit/composition-root.test.ts` 到 `src` 应为 `../../src/composition-root`。已修正。

## 验证命令

```bash
# 单个组件测试
npx jest --testPathPatterns='test/unit/application/events/EventBus.test.ts'
npx jest --testPathPatterns='test/unit/infrastructure/logging/FileLogger.test.ts'

# 全部单元测试
npm run test:unit

# TypeScript 检查
npm run build
```

## 当前状态

Phase 1 全部完成：10 个测试文件、42 个测试用例全部通过。`npm run build` 未破坏旧 Electron 入口。准备进入 Phase 2：平台适配器拆分。

---
记录时间：2026-06-29
