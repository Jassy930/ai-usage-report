# AI Usage Report

独立 CLI 与可嵌入库，用于读取本机 **Codex** 与 **Claude Code** 的历史使用详情，并输出终端、JSON、Markdown 报告。

## 文档导航

- [设计文档](./docs/plans/2026-04-03-ai-usage-report-design.md)
- [实施计划](./docs/plans/2026-04-03-ai-usage-report.md)
- [嵌入说明](./docs/embedding.md)
- [输出格式](./docs/formats.md)

## 支持工具

| 工具 | 数据目录 | 说明 |
| --- | --- | --- |
| `codex` | `~/.codex` | OpenAI Codex CLI 会话 |
| `claude-code` | `~/.claude` | Anthropic Claude Code 会话 |

## 安装与运行

需要 [Bun](https://bun.sh/) 运行时。

```bash
# 克隆仓库
git clone <repo-url> && cd ai-usage-report

# 安装依赖
bun install

# 运行 CLI
bun run src/cli/main.ts <command> [tool] [options]
```

## CLI 命令

```
ai-usage <command> [tool] [options]
```

### 子命令

| 命令 | 说明 |
| --- | --- |
| `report` | 生成使用报告（概览、工具/项目/模型维度、Top Sessions） |
| `sessions` | 列出会话记录 |
| `projects` | 按项目维度汇总 |

### 工具选择

第二个位置参数指定工具：`codex`、`claude-code`、`all`（默认）。

### 选项

| 选项 | 缩写 | 说明 | 默认值 |
| --- | --- | --- | --- |
| `--format` | `-f` | 输出格式：`terminal` / `json` / `md` | `terminal` |
| `--since` | `-s` | 时间范围：`7d` / `30d` / `1m` / `1y` | 无限制 |
| `--limit` | `-l` | 最大返回条数 | 无限制 |
| `--project` | `-p` | 按项目路径关键字过滤 | - |
| `--model` | `-m` | 按模型名称关键字过滤 | - |
| `--out` | `-o` | 输出到文件 | stdout |
| `--codex-dir` | - | 自定义 Codex 数据目录 | `~/.codex` |
| `--claude-dir` | - | 自定义 Claude 数据目录 | `~/.claude` |

### 示例

```bash
# 最近 7 天全部工具报告（终端格式）
bun run src/cli/main.ts report all --format terminal --since 7d

# 最近 30 天 Codex 报告（Markdown）
bun run src/cli/main.ts report codex --format md --since 30d

# Claude Code 最近 10 条会话（JSON）
bun run src/cli/main.ts sessions claude-code --format json --limit 10

# 所有项目汇总（终端格式）
bun run src/cli/main.ts projects all --format terminal
```

## 作为库嵌入

本项目导出全部核心函数，可直接 import 使用。详见 [嵌入说明](./docs/embedding.md)。

```ts
import {
  collectAllSessions,
  buildUsageReport,
  renderTerminalReport,
} from "ai-usage-report";

const sessions = await collectAllSessions({ since: "7d" });
const report = buildUsageReport(sessions);
console.log(renderTerminalReport(report));
```

## 输出格式

支持三种输出格式，详见 [输出格式说明](./docs/formats.md)：

- **terminal** — 对齐的纯文本表格，适合终端和 CI 日志
- **json** — 完整结构化 JSON，适合程序消费
- **md** — Markdown 表格，适合文档和 PR 评论
