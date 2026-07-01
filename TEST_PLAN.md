# voice_claude 测试计划

> 按层级划分 — 依赖语音 vs 不依赖语音 — 独立日志文件

## 日志文件

| 文件 | 组件 | 内容 |
|------|------|------|
| `logs/http.log` | HTTP 服务器 | 请求/响应/延迟/错误 |
| `logs/delivery.log` | 投递 | 投递成功/失败/延迟 |
| `logs/router.log` | 路由 | 路由决策/LLM调用/命令 |
| `logs/registry.log` | 实例管理 | 窗口发现/创建/销毁 |
| `logs/asr.log` | ASR | 识别结果/错误/降级 |
| `logs/metrics.log` | 指标 | 聚合统计 |

---

## L1: 单元测试 (无需语音, 无需窗口)

### config
| # | 测试 | 验证 |
|---|------|------|
| T1.1 | 默认配置生成 | Config.defaults() 返回有效对象 |
| T1.2 | JSON 序列化往返 | save→load 一致 |
| T1.3 | 缺少文件回退默认 | 文件不存在→默认值 |
| T1.4 | 部分覆盖 | JSON 只覆盖指定字段 |

### logger
| # | 测试 | 验证 |
|---|------|------|
| T1.5 | 各组件写不同文件 | http→http.log, delivery→delivery.log |
| T1.6 | JSON 格式 | 每行合法 JSON |
| T1.7 | 指标计数 | delivery计数/错误/平均延迟 |

### router (mock InstanceRegistry)
| # | 测试 | 验证 |
|---|------|------|
| T1.8 | 空窗口列表 | resolve() 不抛异常 |
| T1.9 | 切换命令匹配 | "切换到 terminal-2" → target=terminal-2 |
| T1.10 | 切换命令无匹配 | "切换到xxx" → 不吞,继续路由 |
| T1.11 | 创建命令 | "新建窗口" → 调用 registry.create() |
| T1.12 | 前台优先 | getActive 返回窗口→直接返回 |
| T1.13 | 双速路由 | 非Claude→立即返回 lastUsed |
| T1.14 | LLM 超时 | 模拟网络超时→回退默认 |

### registry (mock Python 脚本)
| # | 测试 | 验证 |
|---|------|------|
| T1.15 | scan 空结果 | execSync 返回空→list()=[]
| T1.16 | scan 解析 | "hwnd|title"→正确解析 |
| T1.17 | 去重 | 同名窗口不重复注册 |
| T1.18 | Schema 默认 | 新窗口从标题提取 task |

---

## L2: 集成测试 (需要HTTP, 无需语音)

### HTTP API
| # | 测试 | 验证 |
|---|------|------|
| T2.1 | GET / | 返回 speech.html |
| T2.2 | GET /status | 返回 {target,count,windows} |
| T2.3 | GET /metrics | 返回 {delivered,errors,avgLatencyMs} |
| T2.4 | POST /send | curl -d '{"text":"测试"}' → 200 |
| T2.5 | POST 空体 | 返回 200, ok=false |
| T2.6 | CORS | OPTIONS 返回正确头 |
| T2.7 | 并发 POST | 10并发→全部返回 200 |

### 投递链 (mock 窗口)
| # | 测试 | 验证 |
|---|------|------|
| T2.8 | 剪贴板写入 | clipboard.writeText→读回一致 |
| T2.9 | 粘贴模拟 | koffi keybd_event 无异常 |
| T2.10 | 窗口聚焦 | focus_win.py 执行不报错 |
| T2.11 | 端到端 | curl POST→日志出现 [voice] 记录 |

---

## L3: 系统测试 (需要麦克风, 需要Chrome)

### 语音识别
| # | 测试 | 验证 |
|---|------|------|
| T3.1 | Chrome 启动 | --app 模式窗口弹出 |
| T3.2 | 麦克风权限 | getUserMedia 成功 |
| T3.3 | SR 启动 | 点击开始→SR started |
| T3.4 | 语音检测 | 说话→onspeechstart 触发 |
| T3.5 | 中文短句 | "你好" → 识别为"你好" |
| T3.6 | 中文长句 | "帮我修复认证模块的bug" → 完整识别 |
| T3.7 | 噪声过滤 | 不说话→不误识别 |
| T3.8 | 代理连通 | SR 不报 network 错误 |

### 端到端
| # | 测试 | 验证 |
|---|------|------|
| T3.9 | 语音→路由 | 说"帮我修bug"→日志显示路由到某窗口 |
| T3.10 | 语音→投递 | 说"你好"→目标窗口出现"你好" |
| T3.11 | 连续对话 | 说3句→3条都投递 |
| T3.12 | 切换命令 | "切换到 terminal-2"→目标切换 |
| T3.13 | 前台跟随 | 切到terminal-3→后续消息到terminal-3 |
| T3.14 | 空窗口投递 | 关掉所有Claude→贴前台 |

---

## L4: 压力测试 (需要语音)

| # | 测试 | 验证 |
|---|------|------|
| T4.1 | 快速连续 | 1秒内说5个短句→5条都投递 |
| T4.2 | 长时间运行 | 启动后1小时不崩溃 |
| T4.3 | Chrome 重启 | 关掉Chrome→Electron不离线 |
| T4.4 | 内存泄漏 | 1000次投递→内存无明显增长 |

---

## 不需要语音的测试 (可直接运行)

```
L1: T1.1 - T1.18  (18个单元测试, mock依赖)
L2: T2.1 - T2.11  (11个集成测试, 需要Electron运行)
```

## 需要语音的测试

```
L3: T3.1 - T3.14  (14个系统测试, 需要人说话)
L4: T4.1 - T4.4   (4个压力测试, 需要人说话)
```

## L5: ASR 音频 fixture 测试 (需要预录音频)

### 录制方法
```
1. 打开 test/asr/capture.html 在 Chrome
2. 输入期望文本，点击录制，说话
3. 保存 .pcm + .txt 到 test/asr/fixtures/
```

### ASR 对比测试

| # | 音频 | 期望文本 | 测试后端 |
|---|------|---------|---------|
| T5.1 | hello.pcm | "你好" | Doubao v3 |
| T5.2 | hello.pcm | "你好" | Chrome Web Speech |
| T5.3 | debug.pcm | "帮我修复这个bug" | Doubao v3 |
| T5.4 | debug.pcm | "帮我修复这个bug" | Chrome Web Speech |
| T5.5 | switch.pcm | "切换到终端" | Doubao v3 |
| T5.6 | long.pcm | 长句30字 | Doubao v3 |
| T5.7 | noise.pcm | (空) | Doubao v3 → 期望 null |
| T5.8 | english.pcm | "hello world" | Doubao v3 |

### 精度指标

```
Word Error Rate (WER) < 20% → 通过
文本相似度 > 80% → 通过
噪音输入 → 必须返回 null 或空字符串
```

## L6: Electron E2E 冒烟测试 (无需语音, 需要 Electron)

使用 Playwright 启动 Electron 应用，验证状态页、设置页、录音状态与 Agent 状态UI。

| # | 测试 | 验证 |
|---|------|------|
| T6.1 | 状态页加载 | 窗口显示 `voice_claude` 与 `就绪` |
| T6.2 | 设置页导航 | 点击设置按钮进入设置页，显示偏好设置与白名单 |
| T6.3 | 返回状态页 | 点击返回按钮回到状态页 |
| T6.4 | 录音状态切换 | 模拟 `status:state` 事件，UI 显示 `录音中...` / `就绪` |
| T6.5 | 模拟 ASR 触发 Agent 状态 | 模拟 `agent:transcribing/planning/acting/success`，UI 依次显示识别中/规划中/执行中/完成 |
| T6.6 | 无控制台错误 | reload 后无 pageerror 或 error 级 console 消息 |

### 运行方法

```bash
# 先构建应用
npm run build

# 运行 E2E 冒烟测试
npm run test:e2e

# 运行性能基准（结果写入 logs/e2e-perf.jsonl）
npm run test:e2e:perf
```

### 性能基准指标

`logs/e2e-perf.jsonl` 每行一条 JSON，包含：

| 字段 | 含义 |
|------|------|
| `launchMs` | `electron.launch()` 耗时 |
| `readyMs` | 从启动到状态页显示 `就绪` 耗时 |
| `asr_pipeline.totalMs` | 模拟 ASR 到完成的总耗时 |
| `asr_pipeline.transcribingMs` | 识别中阶段耗时 |
| `asr_pipeline.planningMs` | 规划中阶段耗时 |
| `asr_pipeline.actingMs` | 执行中阶段耗时 |
| `asr_pipeline.executionMs` | 执行到完成阶段耗时 |

---

## CI 脚本

```bash
# .github/workflows/test.yml 或本地运行
npm test              # L1 单元测试 (无硬件依赖)
npm run test:http     # L2 HTTP 集成测试 (需要启动 Electron)
npm run test:e2e      # L6 E2E 冒烟测试 (需要 Windows + Electron)
npm run test:asr      # L5 ASR fixture 测试 (需要预录音频)
npm run test:all      # 全部 (除 L3/L4 需人工)
```

## 测试覆盖率目标

| 层 | 目标覆盖率 | 自动化 |
|----|----------|--------|
| L1 单元 | 80%+ | ✅ CI |
| L2 集成 | 核心路径 | ✅ CI (需 Electron) |
| L5 ASR | 8 条 fixture | ✅ CI (需代理) |
| L3 系统 | 手动 | 👤 人工 |
| L4 压力 | 手动 | 👤 人工 |

## 日志验证

```bash
cat logs/http.log | jq '.lvl,.cmp,.msg'   # HTTP请求
cat logs/delivery.log | jq '.target,.ms'   # 投递指标
cat logs/router.log | jq '.reason,.target'  # 路由决策
cat logs/registry.log | jq '.event,.title'  # 窗口变化
```
