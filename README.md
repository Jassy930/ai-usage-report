# AI Usage Report

读取本机 **Codex** 与 **Claude Code** 的历史使用数据，生成终端、JSON、Markdown 格式的使用报告。

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

### 工具选择

第二个参数指定数据来源：`codex`、`claude-code`、`all`（默认）。

### 选项

| 选项 | 缩写 | 说明 | 默认值 |
| --- | --- | --- | --- |
| `--format` | `-f` | `terminal` / `json` / `md` | `terminal` |
| `--since` | `-s` | `7d` / `30d` / `1m` / `1y` | 无限制 |
| `--limit` | `-l` | 最大返回条数 | 无限制 |
| `--project` | `-p` | 按项目路径关键字过滤 | - |
| `--model` | `-m` | 按模型名称关键字过滤 | - |
| `--out` | `-o` | 输出到文件 | stdout |
| `--codex-dir` | - | 自定义 Codex 数据目录 | `~/.codex` |
| `--claude-dir` | - | 自定义 Claude 数据目录 | `~/.claude` |

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
```

## 作为库使用

```ts
import {
  collectAllSessions,
  buildUsageReport,
  renderTerminalReport,
  renderMarkdownReport,
  renderJsonReport,
} from "ai-usage-report";

const sessions = await collectAllSessions({ since: "7d" });
const report = buildUsageReport(sessions);

console.log(renderTerminalReport(report));   // 终端输出
console.log(renderMarkdownReport(report));   // Markdown
console.log(renderJsonReport(report));       // JSON
```

详见 [嵌入说明](./docs/embedding.md)。

## 输出格式

- **terminal** — 对齐的纯文本表格，适合终端和 CI 日志
- **json** — 完整结构化 JSON，适合程序消费
- **md** — Markdown 表格，适合文档和周报

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
- [嵌入说明](./docs/embedding.md)
- [输出格式](./docs/formats.md)
