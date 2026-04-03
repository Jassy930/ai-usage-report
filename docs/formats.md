# 输出格式说明

CLI 通过 `--format` 参数选择输出格式：`terminal`（默认）、`json`、`md`。

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

完整结构化 JSON，2-space 缩进。顶层字段：

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

## Markdown 格式

Markdown 表格，适合嵌入文档、PR 评论或 GitHub Issues。

包含以下章节：
- **Summary** — 概览表格（Total Tokens / Sessions / Messages / Active Days）
- **Token Breakdown** — Token 明细表格
- **Tools** — 工具维度表格
- **Projects** — 项目维度表格
- **Models** — 模型维度表格
- **Top Sessions** — 前 10 条会话表格（SessionId / Tool / Model / Messages / Tokens / Prompt）

Prompt 超过 50 字符时自动截断。
