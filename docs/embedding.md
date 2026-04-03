# 库接口嵌入说明

`ai-usage-report` 可作为库直接导入，无需通过 CLI 调用。

## 导入

```ts
import {
  collectAllSessions,
  collectCodexSessions,
  collectClaudeCodeSessions,
  buildUsageReport,
  renderTerminalReport,
  renderMarkdownReport,
  renderJsonReport,
} from "ai-usage-report";
```

所有类型定义也可导入：

```ts
import type {
  SessionRecord,
  TokenBreakdown,
  ToolType,
  FilterOptions,
  UsageReport,
} from "ai-usage-report";
```

## 采集函数

### collectAllSessions

统一采集入口，支持工具选择和过滤。

```ts
const sessions = await collectAllSessions({
  tools: ["codex", "claude-code"], // 可选，默认全部
  since: "7d",                     // 可选，时间范围
  project: "my-app",               // 可选，项目关键字过滤
  model: "claude",                 // 可选，模型关键字过滤
  roots: {                         // 可选，自定义数据目录
    codexDir: "/custom/codex",
    claudeDir: "/custom/claude",
  },
});
```

返回 `Promise<SessionRecord[]>`，按时间降序排列。

### collectCodexSessions

仅采集 Codex 会话。

```ts
const sessions = await collectCodexSessions({
  codexDir: "~/.codex", // 可选，默认 ~/.codex
});
```

### collectClaudeCodeSessions

仅采集 Claude Code 会话。

```ts
const sessions = await collectClaudeCodeSessions({
  claudeDir: "~/.claude", // 可选，默认 ~/.claude
});
```

## 报告构建

### buildUsageReport

将 `SessionRecord[]` 聚合为 `UsageReport`，包含概览、工具/项目/模型维度统计和按 token 降序排列的会话列表。

```ts
const report = buildUsageReport(sessions);
// report.summary    — 总计数据
// report.tools      — 按工具分组
// report.projects   — 按项目分组
// report.models     — 按模型分组
// report.sessions   — 按 token 降序排列的会话
```

## 渲染函数

三个渲染函数均接收 `UsageReport`，返回 `string`。

```ts
// 终端纯文本
const text = renderTerminalReport(report);

// JSON
const json = renderJsonReport(report);

// Markdown
const md = renderMarkdownReport(report);
```

## 完整示例

```ts
import {
  collectAllSessions,
  buildUsageReport,
  renderMarkdownReport,
} from "ai-usage-report";

async function generateWeeklyReport(): Promise<string> {
  const sessions = await collectAllSessions({
    since: "7d",
    tools: ["claude-code"],
  });
  const report = buildUsageReport(sessions);
  return renderMarkdownReport(report);
}
```
