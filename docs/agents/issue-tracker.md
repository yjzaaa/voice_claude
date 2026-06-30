# Issue tracker

本项目使用 **GitHub Issues** 跟踪需求、Bug 和技术债务。

- 仓库：`https://github.com/yjzaaa/voice_claude.git`
- 创建 issue：`gh issue create` 或 GitHub Web UI。
- 功能请求和缺陷统一走 issue；PR 仅作为代码评审和合并流程，不作为外部需求入口。

## Issue 模板

提交 issue 时请参考 `docs/templates/issue.md` 填写以下信息：

1. 问题类型（bug / feature / refactor / doc）
2. 复现步骤或期望行为
3. 验收标准
4. 相关文件/模块
5. 是否阻塞其他任务

## PRD 流程

较大功能在编码前需先写 PRD：

1. 在 `docs/prd/<feature>.md` 中描述背景、目标、范围、非目标、验收标准。
2. 把 PRD 链接到对应 issue。
3. PRD 评审通过后再拆分为子任务并开始 TDD 实现。
