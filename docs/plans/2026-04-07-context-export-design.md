# Context 导出设计文档

## 背景

当前项目主要输出 AI 使用统计报告，适合观察 token、会话数和项目分布，但不适合直接作为 Agent 的工作周报输入。用户希望每周稳定运行一个脚本，从本机 `.codex` 与 `.claude` 数据目录中导出“工作上下文资料包”，供 Agent 结合可选的自然语言说明生成最终周报。

该资料包需要同时服务 Agent 与人工审阅，但优先服务 Agent。因此输出需要尽量保留原始证据，少做脚本侧提炼，并且每个字段都要支持追溯到原始文件。

## 目标

- 提供新的 `context` 命令，按指定时间范围导出工作上下文
- 默认时间范围为当前时间向前追溯 7 天
- 默认输出 `json`，可选输出 `md`
- 尽量统一 `Codex` 与 `Claude Code` 的结构
- 尽量保留原始正文与关键元数据，少做语义提炼
- 为每个会话、消息、派生字段附加原始引用，方便 Agent 回溯

## 非目标

- 不直接生成最终周报
- 不对会话内容进行激进总结、分类或归因
- 不引入 `.git`、任务系统、日历等额外数据源
- 不增加 LLM 参与的脚本内二次总结

## 设计原则

### 1. 证据优先

脚本负责导出“工作上下文”，而不是导出“工作结论”。输出应以 session 和 message 为核心，而不是“完成事项”“进行中”等解释性结构。

### 2. 统一结构优先

`Codex` 与 `Claude Code` 的原始文件格式不同，但导出结果应该统一为稳定 schema，便于 Agent 固定消费。原始格式差异通过 `raw_refs` 和 `source_meta` 保留。

### 3. 保守处理

脚本只做确定性整理：时间过滤、项目归组、字段抽取、消息规范化、原始引用建立。不基于弱信号推断工作结论。

### 4. 可追溯

所有会话级字段和消息级字段都必须附带 `raw_refs`。如果某个字段来源于多个原始文件，允许记录多个引用。

## CLI 设计

主命令：

```bash
ai-usage-report context [tool]
```

其中 `tool` 支持：

- `codex`
- `claude-code`
- `all`

核心参数：

```bash
--format json|md
--since 7d|30d|1m|1y|YYYY-MM-DD
--until YYYY-MM-DD
--project <keyword>
--model <keyword>
--out <file>
--codex-dir <path>
--claude-dir <path>
```

默认行为：

- 默认命令格式：`context all`
- 默认时间范围：当前时间向前追溯 7 天
- 默认输出格式：`json`
- 若只提供 `--since`，则 `until` 取当前时间
- 若同时提供 `--since` 与 `--until`，使用显式时间窗口

## 输出设计

### JSON

JSON 是默认主输出，作为 Agent 的标准输入。顶层结构：

```json
{
  "meta": {},
  "user_brief": null,
  "projects": [],
  "ungrouped_sessions": []
}
```

#### meta

记录本次导出的上下文元数据：

```json
{
  "generated_at": "2026-04-07T12:00:00+08:00",
  "since": "2026-03-31T12:00:00+08:00",
  "until": "2026-04-07T12:00:00+08:00",
  "sources": ["codex", "claude-code"],
  "default_timezone": "Asia/Shanghai"
}
```

#### projects

按 `project_path` 归组的项目列表：

```json
{
  "project_key": "/Users/demo/myapp",
  "project_label": "myapp",
  "sessions": []
}
```

其中：

- `project_key` 使用原始绝对路径
- `project_label` 取路径最后一级目录，供人工阅读

#### ungrouped_sessions

无法识别 `project_path` 的会话进入该数组，避免信息丢失。

#### session

统一会话结构：

```json
{
  "tool": "claude-code",
  "session_id": "sess-001",
  "timestamp_start": "2026-04-03T10:00:00.000Z",
  "timestamp_end": "2026-04-03T10:05:00.000Z",
  "project_path": "/Users/demo/myapp",
  "model": "claude-sonnet-4-6",
  "summary": "修复了登录Bug",
  "goal": "修复认证系统",
  "outcome": "achieved",
  "message_count": 3,
  "token_breakdown": {
    "inputTokens": 3500,
    "outputTokens": 2000,
    "cacheReadTokens": 550,
    "cacheWriteTokens": 130,
    "total": 6180
  },
  "messages": [],
  "raw_refs": []
}
```

#### message

统一消息结构：

```json
{
  "role": "assistant",
  "kind": "message",
  "timestamp": "2026-04-03T10:05:00.000Z",
  "text": "找到问题了，认证 token 过期时间设置错误。",
  "tool_calls": [
    { "name": "Edit", "id": "t2" },
    { "name": "Read", "id": "t3" }
  ],
  "usage": {
    "input_tokens": 2000,
    "output_tokens": 1200,
    "cache_read_input_tokens": 300,
    "cache_creation_input_tokens": 80
  },
  "raw_refs": []
}
```

说明：

- `text` 为消息正文的统一文本视图
- `tool_calls` 只保留结构化工具调用
- `usage` 保留原始 token usage 结构，避免二次转换损失
- 对于没有正文的系统事件，可将 `kind` 设为 `event`

#### raw_refs

所有可追溯字段与对象都必须带 `raw_refs`：

```json
{
  "tool": "claude-code",
  "source_type": "journal_jsonl",
  "file_path": "/Users/jassy/.claude/projects/-Users-demo-myapp/session-1.jsonl",
  "line": 2,
  "session_id": "sess-001"
}
```

或：

```json
{
  "tool": "claude-code",
  "source_type": "facet_json",
  "file_path": "/Users/jassy/.claude/usage-data/facets/sess-001.json",
  "json_pointer": "/brief_summary",
  "session_id": "sess-001"
}
```

要求：

- `file_path` 使用绝对路径
- JSON 数据使用 `json_pointer`
- JSONL 数据使用 `line`
- 允许一个字段引用多个来源

### Markdown

Markdown 不是主消费格式，只用于人工快速审阅。建议包含：

- 生成时间与时间范围
- 项目目录列表
- 每个项目下的 session 简表
- 每个 session 的摘要字段与少量消息预览
- 原始文件路径提示

Markdown 不承担完整证据表达，避免与 JSON 重复维护。

## 数据源映射

### Codex

当前可稳定读取的原始来源：

- `~/.codex/sessions/YYYY/MM/DD/*.jsonl`
- `~/.codex/history.jsonl`

映射策略：

- `session_meta` 提供 `session_id`、`project_path`、`git_remote`
- `event_msg/user_message` 作为 `messages.role = "user"`
- `event_msg/agent_message` 作为 `messages.role = "assistant"`
- `event_msg/token_count` 产生会话级 `token_breakdown`
- `history.jsonl` 可作为首条 prompt 的补充引用来源
- `task_started`、`task_complete` 等事件保留为 `kind = "event"` 的消息或会话事件列表

设计结论：

- v1 中 Codex 不做总结，只保留尽量完整的消息和事件
- 若 session 文件与 `history.jsonl` 重复，优先 session 文件正文，保留双引用

### Claude Code

当前可稳定读取的原始来源：

- `~/.claude/projects/*/*.jsonl`
- `~/.claude/usage-data/session-meta/*.json`
- `~/.claude/usage-data/facets/*.json`

映射策略：

- journal JSONL 作为消息正文与 usage 主来源
- `session-meta` 提供 `project_path`、`start_time`、`duration_minutes`、`tool_counts`、`first_prompt`
- `facets` 提供 `summary`、`goal`、`outcome`、`session_type`
- journal 中的 `tool_use` block 映射为消息级 `tool_calls`

设计结论：

- Claude Code 是 v1 的核心高价值来源
- `summary/goal/outcome` 直接进入统一会话结构，但必须附带 `raw_refs`

## 过滤与排序

- 会话在采集后按时间范围过滤
- 项目内 session 默认按 `timestamp_start` 升序或原始时间顺序输出
- 顶层项目列表按项目标签排序，保证输出稳定
- 对于跨数据源重复 session，不做跨工具合并

## 风险与约束

- 原始消息正文可能包含敏感信息，这是该导出器的预期行为
- 输出 JSON 体积可能显著大于当前 `report` 命令
- 不同工具的数据完整性差异较大，不能要求字段全量存在
- 时间窗口支持 `YYYY-MM-DD` 后，需要统一本地时区边界规则

## 成功标准

- `context` 命令可在默认参数下输出最近 7 天的 JSON 上下文
- 输出同时包含 `Codex` 与 `Claude Code` 的统一 session/message 结构
- 每个会话和关键字段都带有原始文件引用
- Agent 可仅依赖该 JSON 作为周报生成的主要输入
- Markdown 视图可供人工快速核对导出结果
