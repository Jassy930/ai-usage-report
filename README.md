# AI Usage Report

读取本机 **Codex** 与 **Claude Code** 的历史使用数据，生成统计报告，或导出面向 Agent 的工作上下文资料包。

## 快速开始

```bash
# 安装 Bun（如未安装）
curl -fsSL https://bun.sh/install | bash

# 克隆并安装
git clone https://github.com/Jassy930/ai-usage-report.git
cd ai-usage-report
bun install

# 查看最近 7 天的使用报告
bun run src/cli/main.ts report all --since 7d

# 导出最近 7 天的工作上下文 JSON
bun run src/cli/main.ts context all
```

输出效果：

```
────────────────────────────────────────────────────────────
  AI 使用报告 — 概览
────────────────────────────────────────────────────────────

  TOTAL TOKENS            3,893,082,878 (3.9B)
  Sessions                                 396
  Messages                              51,480
  Active Days                                8

  Token 明细:
    Input                 2,223,500,607 (2.2B)
    Output                  13,493,797 (13.5M)
    Cache Read            3,481,963,394 (3.5B)
    Cache Write             93,805,176 (93.8M)

────────────────────────────────────────────────────────────
  工具维度
────────────────────────────────────────────────────────────
  Tool                Sessions          Tokens    Messages
  claude-code              241            1.8B      38,300
  codex                    155            2.1B      13,180
```

## 支持的工具

| 工具 | 数据目录 | 说明 |
| --- | --- | --- |
| `codex` | `~/.codex` | OpenAI Codex CLI 会话 |
| `claude-code` | `~/.claude` | Anthropic Claude Code 会话 |

## CLI 用法

```
bun run src/cli/main.ts <command> [tool] [options]
```

### 命令

| 命令 | 说明 |
| --- | --- |
| `report` | 全局汇总报告（概览 + 工具/项目/模型维度 + Top Sessions） |
| `sessions` | 会话明细列表 |
| `projects` | 按项目维度汇总 |
| `context` | 导出细粒度工作上下文，适合作为 Agent 输入 |
| `search` | 在会话消息中搜索关键字并统计出现次数 |

### 工具选择

第二个参数指定数据来源：`codex`、`claude-code`、`all`（默认）。

### 选项

| 选项 | 缩写 | 说明 | 默认值 |
| --- | --- | --- | --- |
| `--format` | `-f` | `terminal` / `json` / `md` | `context` 默认 `json`，其余默认 `terminal` |
| `--since` | `-s` | `7d` / `30d` / `1m` / `1y` | 无限制 |
| `--until` | - | `YYYY-MM-DD` 结束日期 | 当前时间 |
| `--limit` | `-l` | 最大返回条数 | 无限制 |
| `--project` | `-p` | 按项目路径关键字过滤 | - |
| `--model` | `-m` | 按模型名称关键字过滤 | - |
| `--query` | `-q` | 搜索关键字（search 命令） | - |
| `--case-sensitive` | - | 区分大小写（search 命令） | 否 |
| `--role` | - | 搜索角色范围 `user`/`assistant`/`all`（search 命令） | `all` |
| `--out` | `-o` | 输出到文件，仅允许写入当前工作目录内的真实路径 | stdout |
| `--codex-dir` | - | 自定义 Codex 数据目录 | `~/.codex` |
| `--claude-dir` | - | 自定义 Claude 数据目录 | `~/.claude` |

`--out` 会校验目标文件的真实路径；如果路径通过符号链接跳出当前工作目录，会被拒绝。

### 常用示例

```bash
# 最近 7 天全部报告
bun run src/cli/main.ts report all --since 7d

# 最近 30 天 Codex Markdown 报告，输出到文件
bun run src/cli/main.ts report codex --format md --since 30d --out report.md

# Claude Code 最近 10 条会话（JSON）
bun run src/cli/main.ts sessions claude-code --format json --limit 10

# 按项目汇总
bun run src/cli/main.ts projects all

# 只看 opus 模型的使用
bun run src/cli/main.ts report all --model opus --since 7d

# 导出最近 7 天的工作上下文（默认 JSON）
bun run src/cli/main.ts context all

# 导出指定时间范围的上下文 Markdown
bun run src/cli/main.ts context all --since 2026-04-01 --until 2026-04-07 --format md

# 搜索会话中包含"登录"的内容
bun run src/cli/main.ts search all --query "登录" --since 7d

# 仅搜索用户消息中的关键字（区分大小写）
bun run src/cli/main.ts search all --query "TODO" --role user --case-sensitive

# 搜索结果导出为 JSON
bun run src/cli/main.ts search all --query "bug" --format json --since 30d
```

## 作为库使用

```ts
import {
  collectAllSessions,
  buildUsageReport,
  buildContextReport,
  renderTerminalReport,
  renderMarkdownReport,
  renderJsonReport,
} from "ai-usage-report";

const sessions = await collectAllSessions({ since: "7d" });
const report = buildUsageReport(sessions);

console.log(renderTerminalReport(report));   // 终端输出
console.log(renderMarkdownReport(report));   // Markdown
console.log(renderJsonReport(report));       // JSON

const context = buildContextReport(sessions, {
  generatedAt: new Date().toISOString(),
  since: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
  until: new Date().toISOString(),
  sources: ["codex", "claude-code"],
  defaultTimezone: "Asia/Shanghai",
});

console.log(JSON.stringify(context, null, 2)); // Agent 上下文
```

详见 [嵌入说明](./docs/embedding.md)。

## 输出格式

- **terminal** — 对齐的纯文本表格，适合终端和 CI 日志
- **json** — 完整结构化 JSON，适合程序消费
- **md** — Markdown 表格，适合文档和周报
- **context json** — 细粒度工作上下文，适合作为 Agent 输入
- **context md** — 人工审阅版上下文摘要

详见 [输出格式说明](./docs/formats.md)。

## 开发

```bash
# 运行测试
bun test

# 类型检查
bun run typecheck

# 完整校验（测试 + 类型检查）
bun run check
```

## 文档

- [设计文档](./docs/plans/2026-04-03-ai-usage-report-design.md)
- [实施计划](./docs/plans/2026-04-03-ai-usage-report.md)
- [Context 导出设计](./docs/plans/2026-04-07-context-export-design.md)
- [Context 导出实施计划](./docs/plans/2026-04-07-context-export.md)
- [嵌入说明](./docs/embedding.md)
- [输出格式](./docs/formats.md)
