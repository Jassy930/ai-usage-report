# 输出格式说明

CLI 通过 `--format` 参数选择输出格式：`terminal`、`json`、`md`。其中 `context` 命令默认 `json`，其他命令默认 `terminal`。

## Terminal 格式

纯文本对齐表格，适合终端直接查看和 CI 日志。

包含以下区块：
- **概览** — 总 Token、会话数、消息数、活跃天数
- **Token 明细** — Input / Output / Cache Read / Cache Write
- **工具维度** — 按工具分组的会话数、Token、消息数
- **项目维度** — 按项目路径分组
- **模型维度** — 按模型名称分组
- **Top Sessions** — 按 Token 降序排列的前 10 条会话

无数据时显示"（无数据）"提示。

## JSON 格式

对于 `report` 命令，输出完整结构化 JSON，2-space 缩进。顶层字段：

```json
{
  "summary": {
    "totalTokens": 123456,
    "totalSessions": 42,
    "totalMessages": 300,
    "activeDays": 7,
    "tokenBreakdown": {
      "inputTokens": 50000,
      "outputTokens": 30000,
      "cacheReadTokens": 20000,
      "cacheWriteTokens": 23456,
      "total": 123456
    }
  },
  "tools": [
    { "tool": "codex", "sessions": 20, "tokens": 60000, "messages": 150 }
  ],
  "projects": [
    { "project": "/path/to/project", "sessions": 10, "tokens": 30000, "messages": 80 }
  ],
  "models": [
    { "model": "claude-sonnet-4-20250514", "sessions": 15, "tokens": 45000, "messages": 120 }
  ],
  "sessions": [
    {
      "tool": "claude-code",
      "sessionId": "abc-123",
      "timestamp": "2026-04-01T10:00:00Z",
      "projectPath": "/path/to/project",
      "model": "claude-sonnet-4-20250514",
      "messageCount": 12,
      "firstPrompt": "...",
      "tokenBreakdown": {
        "inputTokens": 5000,
        "outputTokens": 3000,
        "cacheReadTokens": 1000,
        "cacheWriteTokens": 500,
        "total": 9500
      }
    }
  ]
}
```

### 会话记录字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tool` | `"codex" \| "claude-code"` | 来源工具 |
| `sessionId` | `string` | 会话 ID |
| `timestamp` | `string` | ISO 8601 时间戳 |
| `projectPath` | `string?` | 项目路径 |
| `gitRemote` | `string?` | Git 远程地址 |
| `model` | `string?` | 模型名称 |
| `messageCount` | `number` | 消息数 |
| `firstPrompt` | `string?` | 首条用户提示 |
| `summary` | `string?` | 会话摘要 |
| `goal` | `string?` | 会话目标 |
| `conclusion` | `string?` | 会话结论 |
| `toolUsage` | `Record<string, number>?` | 工具调用次数 |
| `tokenBreakdown` | `TokenBreakdown` | Token 使用明细 |
| `outcome` | `string?` | Claude facets 中的结果状态 |
| `messages` | `SessionMessage[]?` | 统一后的消息正文与事件 |
| `rawRefs` | `RawRef[]?` | 指向原始文件的绝对路径引用 |

## Context JSON 格式

`context` 命令默认输出细粒度 JSON，作为 Agent 的主输入。顶层字段：

```json
{
  "meta": {
    "generatedAt": "2026-04-07T12:00:00.000Z",
    "since": "2026-03-31T12:00:00.000Z",
    "until": "2026-04-07T12:00:00.000Z",
    "sources": ["codex", "claude-code"],
    "defaultTimezone": "Asia/Shanghai"
  },
  "userBrief": null,
  "projects": [
    {
      "projectKey": "/Users/demo/myapp",
      "projectLabel": "myapp",
      "sessions": []
    }
  ],
  "ungroupedSessions": []
}
```

### Context session 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tool` | `"codex" \| "claude-code"` | 来源工具 |
| `sessionId` | `string` | 会话 ID |
| `timestampStart` | `string` | 会话开始时间 |
| `timestampEnd` | `string?` | 会话结束时间 |
| `projectPath` | `string?` | 项目路径 |
| `model` | `string?` | 模型名称 |
| `summary` | `string?` | 会话摘要 |
| `goal` | `string?` | 会话目标 |
| `outcome` | `string?` | 会话结果状态 |
| `messageCount` | `number` | 消息数量 |
| `tokenBreakdown` | `TokenBreakdown` | Token 使用明细 |
| `messages` | `SessionMessage[]` | 消息正文、工具调用与事件 |
| `rawRefs` | `RawRef[]` | 指向原始文件的绝对路径引用 |

### RawRef 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tool` | `ToolType` | 来源工具 |
| `sourceType` | `string` | 原始来源类型，如 `journal_jsonl` |
| `filePath` | `string` | 原始文件绝对路径 |
| `sessionId` | `string` | 会话 ID |
| `line` | `number?` | JSONL 行号 |
| `jsonPointer` | `string?` | JSON 字段路径 |

## Markdown 格式

对于 `report` 命令，Markdown 表格适合嵌入文档、PR 评论或 GitHub Issues。

包含以下章节：
- **Summary** — 概览表格（Total Tokens / Sessions / Messages / Active Days）
- **Token Breakdown** — Token 明细表格
- **Tools** — 工具维度表格
- **Projects** — 项目维度表格
- **Models** — 模型维度表格
- **Top Sessions** — 前 10 条会话表格（SessionId / Tool / Model / Messages / Tokens / Prompt）

Prompt 超过 50 字符时自动截断。

## Context Markdown 格式

`context --format md` 输出人工审阅版摘要，包含：

- 生成时间、时间范围、来源工具
- 项目列表
- 每个项目下的 session 简表
- 未归组 session 列表

它不是完整证据表达；完整上下文应使用 `context` 的默认 JSON。
