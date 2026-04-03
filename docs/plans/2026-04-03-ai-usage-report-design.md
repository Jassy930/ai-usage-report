# AI Usage Report 设计文档

## 目标

构建一个独立项目，直接读取本机 `Codex` 与 `Claude Code` 的历史使用数据，生成适合终端查看、程序消费和文档沉淀的使用报告。该项目既可以作为独立 CLI 运行，也可以被其他仓库以库的形式嵌入。

## 设计结论

采用 `bun + TypeScript` 作为首版实现语言，不直接引入 Rust。原因是首版需要优先验证数据模型、CLI 体验和嵌入接口，而不是过早为潜在性能瓶颈付出额外复杂度。为了给后续性能演进留余地，采集链路会拆成 `scanner -> parser -> aggregator -> reporter` 四层，其中 `scanner` 以后可以替换为 Rust 实现，而不影响上层接口。

## 范围

首版只包含以下能力：

- 采集 `Codex` 历史 session 数据
- 采集 `Claude Code` 历史 session 数据
- 输出 `terminal`、`json`、`markdown` 三种格式
- 提供 CLI 命令与可嵌入的 TypeScript API

首版不包含以下内容：

- `Qoder` 支持
- 持久化数据仓库
- Web 页面
- daemon、定时任务、远程同步
- Rust 实现

## 数据源

### Codex

主要来源：

- `~/.codex/sessions/YYYY/MM/DD/*.jsonl`
- `~/.codex/history.jsonl`

读取策略：

- 以 `sessions` 目录下的 JSONL 为 token 事实来源
- 读取 `session_meta`、`turn_context`、`event_msg`
- 从 `token_count` 中提取 `input_tokens`、`output_tokens`、`cached_input_tokens`
- `history.jsonl` 只用于回填 `firstPrompt`，不参与 token 统计

### Claude Code

主要来源：

- `~/.claude/usage-data/facets/*.json`
- `~/.claude/usage-data/session-meta/*.json`
- `~/.claude/projects/*/*.jsonl`

读取策略：

- 优先使用 `projects/*/*.jsonl` 作为历史 token 与工具调用的明细来源
- `facets` 与 `session-meta` 用于补全摘要、目标、结论、首条 prompt 等结构化字段
- 支持跨天 session 切片，按本地日期输出多条 session slice

## 统一数据模型

所有适配器最终产出统一的 `SessionRecord`：

```ts
interface SessionRecord {
  tool: 'codex' | 'claude-code';
  sessionId: string;
  timestamp: string;
  projectPath?: string;
  gitRemote?: string;
  model?: string;
  messageCount: number;
  firstPrompt?: string;
  summary?: string;
  goal?: string;
  conclusion?: string;
  toolUsage?: Record<string, number>;
  tokenBreakdown: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    total: number;
  };
}
```

设计原则：

- 统一字段语义，不暴露底层工具的原始格式差异
- 报告层只依赖统一模型，不关心数据来源
- 允许保留少量工具特定字段，但必须通过可选属性承载

## CLI 设计

主命令：

```bash
ai-usage report [tool]
ai-usage sessions [tool]
ai-usage projects [tool]
```

其中 `tool` 支持：

- `codex`
- `claude-code`
- `all`

核心参数：

```bash
--since 7d|30d|1m|1y
--format terminal|json|md
--limit <n>
--project <keyword>
--model <keyword>
--out <file>
--debug
```

命令职责：

- `report`：输出全局汇总报告
- `sessions`：输出 session 明细
- `projects`：按项目或仓库聚合

## 输出设计

### Terminal

适合人直接看，包含：

- 总览
- 工具维度汇总
- 模型维度汇总
- 项目维度汇总
- Top sessions
- Tool usage 汇总

### JSON

适合其他程序消费，建议输出：

```json
{
  "meta": {},
  "summary": {},
  "projects": [],
  "models": [],
  "sessions": []
}
```

### Markdown

适合沉淀到仓库文档、日报、周报：

- 概览
- 按工具汇总
- 按项目汇总
- 按模型汇总
- 重要 session 列表

## 可嵌入库接口

首版对外导出以下接口：

```ts
collectCodexSessions(options)
collectClaudeCodeSessions(options)
collectAllSessions(options)
buildUsageReport(sessions, options)
renderTerminalReport(report, options)
renderMarkdownReport(report, options)
```

嵌入方式：

- 其他仓库直接 `import`
- 或通过 `bunx` 调用 CLI

这样可以同时满足“脚本调用”和“产品内部集成”两类需求。

## 目录结构

```text
src/
  adapters/
    codex/
      scanner.ts
      parser.ts
      index.ts
    claude-code/
      scanner.ts
      parser.ts
      index.ts
  core/
    types.ts
    filters.ts
    aggregate.ts
    time.ts
  reporters/
    terminal.ts
    json.ts
    markdown.ts
  cli/
    main.ts
    commands/
      report.ts
      sessions.ts
      projects.ts
tests/
  adapters/
  core/
  reporters/
docs/
  embedding.md
```

## 性能设计

首版直接规避当前仓库里最明显的性能问题：

- JSONL 采用流式读取，避免整文件加载
- 合并 session 时统一使用 `Map`
- 扫描时优先按日期目录裁剪
- 报告生成与扫描分离，便于缓存与复用
- 预留 `Scanner` 接口，为未来 Rust 替换做准备

Rust 不是首版前提，但架构会提前适配“底层替换而上层不变”的演进路线。

## 测试策略

测试分三层：

- 适配器测试：使用 fixture 文件验证解析正确性
- 聚合测试：验证 token、项目、模型、工具调用统计
- CLI 测试：验证命令输出格式和参数行为

重点覆盖：

- Codex token 计算规则
- Claude Code 跨天 session 切片
- `--since` 过滤
- `--format` 输出一致性
- 空数据与坏文件容错

## 风险与约束

- 本地工具数据结构未来可能变更，适配器必须容错
- Claude Code 编码路径解码存在边界情况，必须用 fixture 锁住
- 首版不保证超大数据量下最优性能，但必须保证结构清晰、可演进

## 成功标准

- 可在本机直接运行并读取 `Codex` 与 `Claude Code` 历史数据
- 同一份会话数据可输出 `terminal/json/markdown`
- 其他仓库可以通过库接口嵌入
- 后续若有性能瓶颈，可以单独替换扫描层

