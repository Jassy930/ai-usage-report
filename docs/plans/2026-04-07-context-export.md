# Context 导出 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 `context` 命令，按指定时间范围导出面向 Agent 的细粒度工作上下文 JSON，并提供可选 Markdown 审阅视图。

**Architecture:** 在现有 `adapters -> core -> reporters -> cli` 分层上新增 `context` 数据模型与导出链路。适配器补充原始消息和引用信息，`core` 负责时间窗口与项目归组，`reporters` 负责 JSON/Markdown 输出，CLI 负责参数编排与默认行为。

**Tech Stack:** Bun、TypeScript、bun:test、现有 CLI 参数解析与本地文件读取能力

---

### Task 1: 定义 context 数据模型

**Files:**
- Create: `src/core/context.ts`
- Test: `tests/core/context.test.ts`

**Step 1: 写失败测试**

```ts
import { expect, test } from "bun:test";
import type { ContextReport } from "../../src/core/context";

test("context report types can represent projects and sessions", () => {
  const report: ContextReport = {
    meta: {
      generatedAt: "2026-04-07T12:00:00+08:00",
      since: "2026-03-31T12:00:00+08:00",
      until: "2026-04-07T12:00:00+08:00",
      sources: ["codex", "claude-code"],
      defaultTimezone: "Asia/Shanghai",
    },
    userBrief: null,
    projects: [],
    ungroupedSessions: [],
  };

  expect(report.projects).toEqual([]);
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/core/context.test.ts`
Expected: FAIL，因 `src/core/context.ts` 尚不存在

**Step 3: 写最小实现**

在 `src/core/context.ts` 中定义：

- `RawRef`
- `ContextUsage`
- `ContextMessage`
- `ContextSession`
- `ContextProject`
- `ContextReport`

并为后续构建函数预留类型导出。

**Step 4: 运行测试确认通过**

Run: `bun test tests/core/context.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/core/context.ts tests/core/context.test.ts
git commit -m "feat: add context report types"
```

### Task 2: 扩展时间窗口与 CLI 参数

**Files:**
- Modify: `src/cli/args.ts`
- Modify: `src/cli/main.ts`
- Modify: `src/core/time.ts`
- Test: `tests/cli/args.test.ts`
- Test: `tests/core/time.test.ts`

**Step 1: 写失败测试**

补充测试覆盖：

- `context` 子命令可识别
- `context` 默认 `format=json`
- `--until` 参数可解析
- `--since 2026-04-01 --until 2026-04-07` 可生成显式窗口

**Step 2: 运行测试确认失败**

Run: `bun test tests/cli/args.test.ts tests/core/time.test.ts`
Expected: FAIL，当前不支持 `context` 和 `--until`

**Step 3: 写最小实现**

- 在 `src/cli/args.ts` 中新增：
  - `SubCommand = "report" | "sessions" | "projects" | "context"`
  - `until?: string`
  - `context` 的默认格式覆盖规则
- 在 `src/core/time.ts` 中新增：
  - 解析 `YYYY-MM-DD` 的工具函数
  - 计算默认最近 7 天窗口的函数
  - `since/until` 的统一解析入口
- 在 `src/cli/main.ts` 中把 `context` 加入帮助文本与命令分发

**Step 4: 运行测试确认通过**

Run: `bun test tests/cli/args.test.ts tests/core/time.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/cli/args.ts src/cli/main.ts src/core/time.ts tests/cli/args.test.ts tests/core/time.test.ts
git commit -m "feat: add context CLI time window options"
```

### Task 3: 为 Claude Code 提取完整上下文消息与原始引用

**Files:**
- Modify: `src/adapters/claude-code/types.ts`
- Modify: `src/adapters/claude-code/scanner.ts`
- Modify: `src/adapters/claude-code/parser.ts`
- Test: `tests/adapters/claude-code.test.ts`

**Step 1: 写失败测试**

新增测试断言：

- 会话包含完整 `messages`
- `summary/goal/outcome` 带 `raw_refs`
- 每条消息带绝对路径 `file_path` 与 `line`
- assistant `tool_use` 被保留为结构化 `tool_calls`

**Step 2: 运行测试确认失败**

Run: `bun test tests/adapters/claude-code.test.ts`
Expected: FAIL，当前适配器未输出消息数组与引用信息

**Step 3: 写最小实现**

- 扩展 scanner，使 journal 解析时保留来源文件路径与行号
- 扩展 facets/session-meta 扫描结果，使其可生成 `json_pointer` 引用
- 在 parser 中：
  - 规范化 journal 为统一消息结构
  - 接入 `outcome`
  - 为 `summary/goal/outcome` 和消息生成 `raw_refs`
  - 保留 usage 与 tool_calls

**Step 4: 运行测试确认通过**

Run: `bun test tests/adapters/claude-code.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/adapters/claude-code tests/adapters/claude-code.test.ts
git commit -m "feat: enrich claude context export data"
```

### Task 4: 为 Codex 提取完整上下文消息与原始引用

**Files:**
- Modify: `src/adapters/codex/types.ts`
- Modify: `src/adapters/codex/parser.ts`
- Modify: `src/adapters/codex/index.ts`
- Test: `tests/adapters/codex.test.ts`

**Step 1: 写失败测试**

新增测试断言：

- Codex 会话导出完整 `user_message` 与 `agent_message`
- `task_started/task_complete` 可作为事件保留
- `history.jsonl` 引用可附加到首条 prompt
- JSONL 消息带文件路径与行号引用

**Step 2: 运行测试确认失败**

Run: `bun test tests/adapters/codex.test.ts`
Expected: FAIL，当前适配器只做消息计数

**Step 3: 写最小实现**

- 扩展 `CodexRawEvent` 的来源元信息
- 在 parser 中：
  - 保留每条原始消息和关键事件
  - 将 `user_message`、`agent_message` 规范化为统一消息结构
  - 为消息和会话级 token 信息生成 `raw_refs`
  - 如 `history.jsonl` 存在对应 prompt，附加补充引用

**Step 4: 运行测试确认通过**

Run: `bun test tests/adapters/codex.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/adapters/codex tests/adapters/codex.test.ts
git commit -m "feat: enrich codex context export data"
```

### Task 5: 构建 context 聚合层

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/collect.ts`
- Create: `src/core/context-builder.ts`
- Test: `tests/core/collect.test.ts`
- Test: `tests/core/context-builder.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- 默认最近 7 天窗口生效
- session 可按 `project_path` 分组
- 缺少项目路径的 session 进入 `ungroupedSessions`
- 输出项目按标签稳定排序

**Step 2: 运行测试确认失败**

Run: `bun test tests/core/collect.test.ts tests/core/context-builder.test.ts`
Expected: FAIL，当前没有 context builder

**Step 3: 写最小实现**

- 在 `src/core/types.ts` 中为 `SessionRecord` 补充 context 导出所需的可选字段
- 在 `src/core/collect.ts` 中支持显式 `since/until` 时间窗口
- 新建 `src/core/context-builder.ts`：
  - 接收 `SessionRecord[]`
  - 构建 `ContextReport`
  - 按项目归组
  - 处理 `ungroupedSessions`
  - 组装顶层 `meta`

**Step 4: 运行测试确认通过**

Run: `bun test tests/core/collect.test.ts tests/core/context-builder.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/core/types.ts src/core/collect.ts src/core/context-builder.ts tests/core/collect.test.ts tests/core/context-builder.test.ts
git commit -m "feat: add context report aggregation"
```

### Task 6: 实现 context 输出与 CLI 命令

**Files:**
- Create: `src/cli/commands/context.ts`
- Create: `src/reporters/context-markdown.ts`
- Modify: `src/index.ts`
- Test: `tests/cli/context.test.ts`
- Test: `tests/e2e/fixtures.test.ts`

**Step 1: 写失败测试**

新增测试覆盖：

- `context all --format json` 返回可解析 JSON
- `context` 默认输出 JSON
- `context --format md` 返回 Markdown 标题与项目区块
- `context` 默认时间窗口为最近 7 天

**Step 2: 运行测试确认失败**

Run: `bun test tests/cli/context.test.ts tests/e2e/fixtures.test.ts`
Expected: FAIL，当前不存在 `context` 命令

**Step 3: 写最小实现**

- 新建 `src/cli/commands/context.ts`
- 新建 `src/reporters/context-markdown.ts`
- 在 `src/index.ts` 导出 context 相关类型与构建函数
- 在 `src/cli/main.ts` 中接入 `context` 命令

JSON 输出直接 `JSON.stringify(contextReport, null, 2)`；Markdown 仅输出人工审阅摘要，不复刻完整 JSON。

**Step 4: 运行测试确认通过**

Run: `bun test tests/cli/context.test.ts tests/e2e/fixtures.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/cli/commands/context.ts src/reporters/context-markdown.ts src/index.ts tests/cli/context.test.ts tests/e2e/fixtures.test.ts
git commit -m "feat: add context export command"
```

### Task 7: 更新文档与最终校验

**Files:**
- Modify: `README.md`
- Modify: `docs/formats.md`
- Modify: `docs/embedding.md`

**Step 1: 更新文档**

补充：

- `context` 命令说明
- 默认 JSON、可选 Markdown
- 时间窗口参数示例
- context 数据结构示例

**Step 2: 运行完整校验**

Run: `bun run check`
Expected: PASS

**Step 3: 运行关键命令验证**

Run: `bun run src/cli/main.ts context all --format json --codex-dir tests/fixtures/codex --claude-dir tests/fixtures/claude-code`
Expected: 输出可解析 JSON，含 `meta/projects/ungroupedSessions`

Run: `bun run src/cli/main.ts context all --format md --codex-dir tests/fixtures/codex --claude-dir tests/fixtures/claude-code`
Expected: 输出 Markdown 概览与项目区块

**Step 4: 提交**

```bash
git add README.md docs/formats.md docs/embedding.md
git commit -m "docs: add context export documentation"
```
