# AI Usage Report Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个独立的 `bun + TypeScript` CLI/库项目，读取本机 `codex` 与 `claude-code` 历史使用数据，并输出 `terminal`、`json`、`markdown` 报告。

**Architecture:** 项目按 `adapters -> core -> reporters -> cli` 分层。`adapters` 负责从本机目录读取与标准化 session，`core` 负责统一过滤与聚合，`reporters` 负责多格式输出，`cli` 仅做参数解析与流程编排。底层采集拆出 `scanner` 接口，为后续 Rust 替换预留边界。

**Tech Stack:** Bun、TypeScript、bun:test、Node.js fs/path/readline、可能使用轻量 CLI 解析库如 `commander`

---

### Task 1: 初始化项目骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `src/cli/main.ts`
- Create: `src/index.ts`
- Create: `tests/smoke.test.ts`
- Create: `README.md`

**Step 1: 写一个最小失败测试**

```ts
import { expect, test } from "bun:test";

test("library entry exports collectAllSessions", async () => {
  const mod = await import("../src/index");
  expect(typeof mod.collectAllSessions).toBe("function");
});
```

**Step 2: 运行测试确认失败**

Run: `bun test`
Expected: 因 `src/index.ts` 不存在或未导出目标函数而失败

**Step 3: 写最小实现与工程配置**

```ts
export async function collectAllSessions() {
  return [];
}
```

**Step 4: 再次运行测试**

Run: `bun test`
Expected: PASS

**Step 5: 提交**

```bash
git add package.json tsconfig.json bunfig.toml src/index.ts src/cli/main.ts tests/smoke.test.ts README.md
git commit -m "chore: bootstrap ai-usage-report project"
```

### Task 2: 定义统一类型与时间过滤工具

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/time.ts`
- Create: `src/core/filters.ts`
- Create: `tests/core/time.test.ts`
- Create: `tests/core/filters.test.ts`

**Step 1: 写失败测试，覆盖 timespec 解析与 session 过滤**

```ts
import { expect, test } from "bun:test";
import { parseSinceSpec } from "../../src/core/time";

test("parseSinceSpec parses day range", () => {
  const now = new Date("2026-04-03T12:00:00Z");
  const since = parseSinceSpec("7d", now);
  expect(since.toISOString()).toBe("2026-03-27T00:00:00.000Z");
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/core/time.test.ts`
Expected: FAIL，函数尚未实现

**Step 3: 实现统一类型与过滤函数**

```ts
export interface SessionRecord {
  tool: "codex" | "claude-code";
  sessionId: string;
  timestamp: string;
  messageCount: number;
  tokenBreakdown: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    total: number;
  };
}
```

**Step 4: 运行全部 core 测试**

Run: `bun test tests/core`
Expected: PASS

**Step 5: 提交**

```bash
git add src/core/types.ts src/core/time.ts src/core/filters.ts tests/core/time.test.ts tests/core/filters.test.ts
git commit -m "feat: add shared session types and filters"
```

### Task 3: 实现 Codex 采集器

**Files:**
- Create: `src/adapters/codex/types.ts`
- Create: `src/adapters/codex/scanner.ts`
- Create: `src/adapters/codex/parser.ts`
- Create: `src/adapters/codex/index.ts`
- Create: `tests/fixtures/codex/sessions/2026/04/03/rollout-sample.jsonl`
- Create: `tests/fixtures/codex/history.jsonl`
- Create: `tests/adapters/codex.test.ts`

**Step 1: 写失败测试，验证 token 解析和 firstPrompt 回填**

```ts
import { expect, test } from "bun:test";
import { collectCodexSessions } from "../../src/adapters/codex";

test("collectCodexSessions parses token usage from session jsonl", async () => {
  const sessions = await collectCodexSessions({
    codexDir: "tests/fixtures/codex",
  });
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.tokenBreakdown.total).toBeGreaterThan(0);
  expect(sessions[0]?.firstPrompt).toBe("帮我修一下测试");
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/adapters/codex.test.ts`
Expected: FAIL

**Step 3: 实现 Codex 扫描与解析**

实现要求：

- 按 `sessions/YYYY/MM/DD/*.jsonl` 扫描
- 使用流式读取 JSONL
- 从 `session_meta`、`turn_context`、`event_msg` 提取字段
- 从 `token_count` 计算统一 tokenBreakdown
- 从 `history.jsonl` 回填首条 prompt

**Step 4: 运行 Codex 适配器测试**

Run: `bun test tests/adapters/codex.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/adapters/codex tests/adapters/codex.test.ts tests/fixtures/codex
git commit -m "feat: add codex history adapter"
```

### Task 4: 实现 Claude Code 采集器

**Files:**
- Create: `src/adapters/claude-code/types.ts`
- Create: `src/adapters/claude-code/scanner.ts`
- Create: `src/adapters/claude-code/parser.ts`
- Create: `src/adapters/claude-code/index.ts`
- Create: `tests/fixtures/claude-code/usage-data/facets/sample.json`
- Create: `tests/fixtures/claude-code/usage-data/session-meta/sample.json`
- Create: `tests/fixtures/claude-code/projects/-Users-jassy-demo/session-1.jsonl`
- Create: `tests/adapters/claude-code.test.ts`

**Step 1: 写失败测试，覆盖 facets/session-meta/jsonl 合并**

```ts
import { expect, test } from "bun:test";
import { collectClaudeCodeSessions } from "../../src/adapters/claude-code";

test("collectClaudeCodeSessions merges summary data and token slices", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  expect(sessions.length).toBeGreaterThan(0);
  expect(sessions[0]?.tool).toBe("claude-code");
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/adapters/claude-code.test.ts`
Expected: FAIL

**Step 3: 实现 Claude Code 采集器**

实现要求：

- 读取 `facets`、`session-meta`、`projects/*/*.jsonl`
- 用 `Map` 按 sessionId 合并，禁止使用全量 `find`
- 解析 assistant message 的 `usage`
- 统计 `tool_use`
- 支持跨天切片
- 回填 `summary/goal/conclusion/firstPrompt`

**Step 4: 运行 Claude Code 适配器测试**

Run: `bun test tests/adapters/claude-code.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/adapters/claude-code tests/adapters/claude-code.test.ts tests/fixtures/claude-code
git commit -m "feat: add claude code history adapter"
```

### Task 5: 实现统一采集入口

**Files:**
- Modify: `src/index.ts`
- Create: `src/core/collect.ts`
- Create: `tests/core/collect.test.ts`

**Step 1: 写失败测试，验证多工具采集与过滤**

```ts
import { expect, test } from "bun:test";
import { collectAllSessions } from "../../src/core/collect";

test("collectAllSessions respects tool filter", async () => {
  const sessions = await collectAllSessions({
    tools: ["codex"],
    roots: { codexDir: "tests/fixtures/codex" },
  });
  expect(sessions.every(s => s.tool === "codex")).toBe(true);
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/core/collect.test.ts`
Expected: FAIL

**Step 3: 实现统一入口**

实现要求：

- 支持 `codex`、`claude-code`、`all`
- 支持 `since`、`project`、`model` 过滤
- 返回按时间排序的 `SessionRecord[]`

**Step 4: 运行 collect 测试**

Run: `bun test tests/core/collect.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/index.ts src/core/collect.ts tests/core/collect.test.ts
git commit -m "feat: add unified session collection entry"
```

### Task 6: 实现聚合与报告数据模型

**Files:**
- Create: `src/core/aggregate.ts`
- Create: `src/core/report.ts`
- Create: `tests/core/aggregate.test.ts`

**Step 1: 写失败测试，验证 token、项目、模型聚合**

```ts
import { expect, test } from "bun:test";
import { buildUsageReport } from "../../src/core/report";

test("buildUsageReport aggregates totals by tool and project", () => {
  const report = buildUsageReport([
    {
      tool: "codex",
      sessionId: "s1",
      timestamp: "2026-04-03T10:00:00.000Z",
      messageCount: 1,
      tokenBreakdown: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        total: 15,
      },
    },
  ]);
  expect(report.summary.totalTokens).toBe(15);
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/core/aggregate.test.ts`
Expected: FAIL

**Step 3: 实现聚合逻辑**

实现要求：

- 汇总 total/session/message/activeDays
- 产出 tool、project、model、sessionTop 列表
- 为 reporters 提供稳定结构

**Step 4: 运行聚合测试**

Run: `bun test tests/core/aggregate.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/core/aggregate.ts src/core/report.ts tests/core/aggregate.test.ts
git commit -m "feat: add report aggregation layer"
```

### Task 7: 实现 JSON 与 Markdown 输出

**Files:**
- Create: `src/reporters/json.ts`
- Create: `src/reporters/markdown.ts`
- Create: `tests/reporters/json.test.ts`
- Create: `tests/reporters/markdown.test.ts`

**Step 1: 写失败测试，验证输出稳定结构**

```ts
import { expect, test } from "bun:test";
import { renderMarkdownReport } from "../../src/reporters/markdown";

test("renderMarkdownReport includes summary heading", () => {
  const md = renderMarkdownReport({
    summary: { totalTokens: 15, totalSessions: 1, totalMessages: 1, activeDays: 1 },
    tools: [],
    projects: [],
    models: [],
    sessions: [],
  } as any);
  expect(md.includes("# AI Usage Report")).toBe(true);
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/reporters/json.test.ts tests/reporters/markdown.test.ts`
Expected: FAIL

**Step 3: 实现 reporters**

实现要求：

- JSON 输出只序列化稳定结构
- Markdown 输出包含概览、工具、项目、模型、Top sessions
- 数值格式统一

**Step 4: 运行 reporter 测试**

Run: `bun test tests/reporters`
Expected: PASS

**Step 5: 提交**

```bash
git add src/reporters/json.ts src/reporters/markdown.ts tests/reporters/json.test.ts tests/reporters/markdown.test.ts
git commit -m "feat: add json and markdown reporters"
```

### Task 8: 实现终端报告输出

**Files:**
- Create: `src/reporters/terminal.ts`
- Create: `tests/reporters/terminal.test.ts`

**Step 1: 写失败测试，验证关键段落存在**

```ts
import { expect, test } from "bun:test";
import { renderTerminalReport } from "../../src/reporters/terminal";

test("renderTerminalReport includes total tokens", () => {
  const text = renderTerminalReport({
    summary: { totalTokens: 1500, totalSessions: 2, totalMessages: 4, activeDays: 1 },
    tools: [],
    projects: [],
    models: [],
    sessions: [],
  } as any);
  expect(text.includes("TOTAL TOKENS")).toBe(true);
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/reporters/terminal.test.ts`
Expected: FAIL

**Step 3: 实现终端 renderer**

实现要求：

- 纯文本输出，适配终端复制与 CI 日志
- 保持信息密度高，但不要依赖复杂交互
- 对空数据和过滤后无结果有清晰提示

**Step 4: 运行 reporter 测试**

Run: `bun test tests/reporters/terminal.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/reporters/terminal.ts tests/reporters/terminal.test.ts
git commit -m "feat: add terminal reporter"
```

### Task 9: 实现 CLI 命令

**Files:**
- Modify: `src/cli/main.ts`
- Create: `src/cli/args.ts`
- Create: `src/cli/commands/report.ts`
- Create: `src/cli/commands/sessions.ts`
- Create: `src/cli/commands/projects.ts`
- Create: `tests/cli/report.test.ts`
- Create: `tests/cli/sessions.test.ts`

**Step 1: 写失败测试，验证 CLI 参数和格式选择**

```ts
import { expect, test } from "bun:test";
import { runCli } from "../../src/cli/main";

test("report command returns markdown when format=md", async () => {
  const output = await runCli([
    "report",
    "codex",
    "--format",
    "md",
    "--since",
    "7d",
  ]);
  expect(output.exitCode).toBe(0);
});
```

**Step 2: 运行测试确认失败**

Run: `bun test tests/cli/report.test.ts tests/cli/sessions.test.ts`
Expected: FAIL

**Step 3: 实现 CLI**

实现要求：

- 支持 `report`、`sessions`、`projects`
- 支持 `codex`、`claude-code`、`all`
- 支持 `--format terminal|json|md`
- 支持 `--out`
- CLI 输出层只拼装，不重复实现聚合逻辑

**Step 4: 运行 CLI 测试**

Run: `bun test tests/cli`
Expected: PASS

**Step 5: 提交**

```bash
git add src/cli tests/cli
git commit -m "feat: add ai usage cli commands"
```

### Task 10: 补全文档与嵌入说明

**Files:**
- Modify: `README.md`
- Create: `docs/embedding.md`
- Create: `docs/formats.md`

**Step 1: 先写文档草稿**

文档至少包含：

- 安装方式
- CLI 示例
- 库调用示例
- 输出格式说明
- 数据源说明

**Step 2: 验证示例命令与代码片段**

Run: `bun run src/cli/main.ts report codex --format md --since 7d`
Expected: 成功输出 Markdown

**Step 3: 整理 README**

README 必须能回答：

- 这是干什么的
- 支持哪些工具
- 如何运行
- 如何嵌入别的仓库

**Step 4: 提交**

```bash
git add README.md docs/embedding.md docs/formats.md
git commit -m "docs: add usage and embedding documentation"
```

### Task 11: 端到端验证与发布准备

**Files:**
- Modify: `package.json`
- Create: `tests/e2e/fixtures.test.ts`

**Step 1: 添加最终校验命令**

在 `package.json` 中至少包含：

```json
{
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "check": "bun test && tsc --noEmit"
  }
}
```

**Step 2: 添加端到端 fixture 测试**

覆盖：

- `report codex`
- `report claude-code`
- `report all --format json`

**Step 3: 运行完整校验**

Run: `bun run check`
Expected: 全部通过

**Step 4: 试跑本地示例**

Run: `bun run src/cli/main.ts report all --since 30d`
Expected: 能从本机目录读取数据并输出报告

**Step 5: 提交**

```bash
git add package.json tests/e2e/fixtures.test.ts
git commit -m "chore: finalize verification and release scripts"
```

## 交付检查清单

- 独立 CLI 可运行
- 库接口可导入
- `codex` 与 `claude-code` 适配器可用
- `terminal/json/markdown` 三种格式都可输出
- README 与嵌入文档齐全
- `bun test` 与 `tsc --noEmit` 通过

## 执行建议

先按此计划完成纯 TypeScript 版本，验证真实数据与接口体验。只有在真实大数据样本下确认瓶颈集中于扫描层时，再把 `src/adapters/*/scanner.ts` 收敛成 Rust 替换点。

