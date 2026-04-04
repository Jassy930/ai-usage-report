# ai-usage-report 代码质量审查报告

> 审查日期: 2026-04-03
> 审查范围: 全部 24 个源文件 + 13 个测试文件
> 框架: Bun + TypeScript (strict mode)
> 测试状态: 81 tests, 0 fail, 181 expect() calls

---

## 总体评价

项目整体代码质量 **良好**，架构清晰、职责分离合理、类型安全到位。以下按严重程度列出所有发现。

---

## Critical

### C-1: `scanJournals` 文件扫描逻辑存在大量代码重复与潜在内存风险

**文件**: `src/adapters/claude-code/scanner.ts` 第 69-204 行

**问题**: `scanJournals` 函数长度达 135 行，包含两段几乎完全相同的 JSONL 解析循环（第 96-124 行与第 170-199 行）。此外，第 99 行使用 `Bun.file(...).text()` 将整个 JSONL 文件一次性加载到内存，如果用户有大量历史会话（数千个文件、单文件数十 MB），可能导致内存溢出。

另外，第 128-131 行存在空的 subagents 扫描逻辑（注释占位但无实现），属于 dead code。

**修复建议**: 提取公共 JSONL 解析函数，消除重复；对大文件使用流式解析；移除 dead code。

```typescript
// 提取 JSONL 解析为独立函数
async function parseJsonlFile(
  filePath: string,
  sessionMap: Map<string, JournalLine[]>,
): Promise<void> {
  const text = await Bun.file(filePath).text();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as JournalLine;
      if (!parsed.sessionId) continue;
      if (parsed.type !== "user" && parsed.type !== "assistant") continue;
      let arr = sessionMap.get(parsed.sessionId);
      if (!arr) {
        arr = [];
        sessionMap.set(parsed.sessionId, arr);
      }
      arr.push(parsed);
    } catch {
      // 跳过无效行
    }
  }
}

// scanJournals 中调用
for (const file of jsonlFiles) {
  await parseJsonlFile(join(dir, file), sessionMap);
}
```

---

### C-2: Codex scanner 四层嵌套循环串行 I/O

**文件**: `src/adapters/codex/scanner.ts` 第 22-65 行

**问题**: `scanSessionFiles` 对 `sessions/YYYY/MM/DD/*.jsonl` 采用四层嵌套 `for` 循环 + 串行 `await`。每一层都先 `readdir`，然后对每个条目执行 `stat` 判断是否目录。对于拥有大量历史数据的用户（例如一年的数据），这将产生成百上千次串行 I/O 调用，严重影响性能。

圈复杂度: 高（四层嵌套 + 多个 try/catch）。

**修复建议**: 使用 `Bun.glob` 或 `node:fs/promises` 的 `readdir` 递归选项来替代手动遍历。

```typescript
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function scanSessionFiles(
  codexDir: string,
): Promise<Array<{ filePath: string; date: string }>> {
  const sessionsDir = join(codexDir, "sessions");
  const results: Array<{ filePath: string; date: string }> = [];

  let entries: string[];
  try {
    entries = await readdir(sessionsDir, { recursive: true }) as unknown as string[];
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    // 从路径 "YYYY/MM/DD/file.jsonl" 提取日期
    const parts = entry.split("/");
    if (parts.length === 4) {
      results.push({
        filePath: join(sessionsDir, entry),
        date: `${parts[0]}-${parts[1]}-${parts[2]}`,
      });
    }
  }

  return results;
}
```

---

## High

### H-1: `resolveTools` 函数在三个命令文件中完全重复

**文件**:
- `src/cli/commands/report.ts` 第 40-44 行
- `src/cli/commands/sessions.ts` 第 38-42 行
- `src/cli/commands/projects.ts` 第 38-42 行

**问题**: 三份完全相同的 `resolveTools` 函数，违反 DRY 原则。当新增工具类型时需要同时修改三处。

**修复建议**: 提取到共享模块。

```typescript
// src/cli/commands/shared.ts
import type { ToolType } from "../../core/types";

export function resolveTools(tool: string): ToolType[] | undefined {
  if (tool === "codex") return ["codex"];
  if (tool === "claude-code") return ["claude-code"];
  return undefined;
}
```

---

### H-2: `collectAllSessions` 中的 `filterOpts` 缺少 `tool` 过滤

**文件**: `src/core/collect.ts` 第 62-73 行

**问题**: `CollectOptions` 通过 `tools` 字段控制要采集哪些工具的数据，但这是通过有条件地启动采集任务实现的（第 51-56 行）。`filterOpts` 对象中从未设置 `tool` 字段。虽然在当前代码中不会导致 bug（因为采集阶段已经按工具过滤），但 `FilterOptions.tool` 的存在暗示 `filterSessions` 应该能按工具过滤，而 `collectAllSessions` 并没有透传这个能力，使得 `FilterOptions.tool` 成了部分死代码。

**修复建议**: 要么在 `collectAllSessions` 中也传递 `tool` 过滤选项，要么从 `FilterOptions` 中移除 `tool` 字段并在文档中说明工具过滤在采集阶段已完成。

---

### H-3: 全局静默的错误处理模式 -- 所有 `catch {}` 块无诊断输出

**文件**: 多处（`scanner.ts`、`parser.ts` 等十余处 `catch {}` 空块）

**问题**: 项目中大量使用空 `catch {}` 块来静默处理错误，例如：
- `src/adapters/codex/scanner.ts` 第 18, 29, 39, 49, 73 行
- `src/adapters/codex/parser.ts` 第 61, 117, 126, 134 行
- `src/adapters/claude-code/scanner.ts` 第 36, 63, 85, 92, 119, 123 行

当用户数据文件损坏或权限不足时，CLI 会静默返回空结果而不给出任何提示。这导致调试极度困难 -- 用户看到 "0 sessions" 却无法知道原因。

**修复建议**: 引入可选的 verbose/debug 模式，在静默跳过时至少记录警告信息。

```typescript
// 简单方案：引入 logger
const DEBUG = process.env.AI_USAGE_DEBUG === "1";

function debugLog(msg: string): void {
  if (DEBUG) console.error(`[debug] ${msg}`);
}

// 使用示例
try {
  years = await readdir(sessionsDir);
} catch (err) {
  debugLog(`无法读取目录 ${sessionsDir}: ${err}`);
  return results;
}
```

---

### H-4: Codex `parseSessionFile` 缺少 `cacheWriteTokens` 赋值

**文件**: `src/adapters/codex/parser.ts` 第 88-95 行

**问题**: Codex 的 token_count 事件中有 `input_tokens`、`cached_input_tokens`、`output_tokens`，但代码只赋值了三个字段。`cacheWriteTokens` 始终为 0，因为 Codex 的原始数据中没有对应字段。这本身可能是正确的（Codex 确实不报告 cache write），但问题在于 `total` 直接取自 `u.total_tokens`，而 `TokenBreakdown.total` 的语义在 Claude Code 适配器中是 `inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens` 的累加（`parser.ts` 第 131 行）。两个适配器对 `total` 的计算方式不一致，可能导致报告数据比较时产生误解。

**修复建议**: 统一 `total` 的计算语义 -- 要么都使用原始数据的 `total_tokens`，要么都使用四项累加。在 `TokenBreakdown` 类型注释中明确 `total` 的定义。

---

### H-5: Markdown 报告中 `firstPrompt` 可能包含管道符导致表格破损

**文件**: `src/reporters/markdown.ts` 第 78-85 行

**问题**: `firstPrompt` 的内容直接插入 Markdown 表格单元格，但未对 `|` 字符进行转义。如果 prompt 中包含 `|`（例如 "fix a | b issue"），会导致表格列错位。同样的问题也存在于 `src/cli/commands/sessions.ts` 第 79 行和 `projects.ts` 中的项目路径。

**修复建议**:

```typescript
function escapeMarkdownCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

// 使用
const prompt = escapeMarkdownCell(s.firstPrompt?.slice(0, 47) ?? "-");
```

---

## Medium

### M-1: `parseSinceSpec` 不支持周单位 `w`

**文件**: `src/core/time.ts` 第 7 行

**问题**: 正则 `/^(\d+)([dmy])$/` 不支持 `w`（周），但 "2w" 是非常常见的时间筛选规格。帮助文本中也未列出完整的支持格式。

**修复建议**: 在正则和 switch 中增加 `w` 支持。

```typescript
const SPEC_PATTERN = /^(\d+)([dwmy])$/;
// ...
case "w":
  result.setUTCDate(result.getUTCDate() - value * 7);
  break;
```

---

### M-2: `parseArgs` 对未知命令的处理存在类型安全漏洞

**文件**: `src/cli/args.ts` 第 111-113 行

**问题**: 当位置参数不是已知的子命令时，代码使用 `cmd as SubCommand` 强制类型断言，将任意字符串强转为 `SubCommand` 类型。这绕过了 TypeScript 的类型安全，使得下游 `switch` 的 `default` 分支成为唯一的防线。

**修复建议**: 不要断言，而是保持 `command = null` 或引入一个明确的错误状态。

```typescript
if (cmd === "report" || cmd === "sessions" || cmd === "projects") {
  result.command = cmd;
} else {
  // 保持 command = null，让 main.ts 处理 unknown command
  // 或者存储原始值到单独字段
  result.unknownCommand = cmd;
}
```

---

### M-3: `addBreakdown` 每次调用创建新对象，频繁 GC 压力

**文件**: `src/core/aggregate.ts` 第 13-21 行

**问题**: `buildUsageReport`（`report.ts` 第 29-33 行）在循环中调用 `addBreakdown`，每次迭代都创建一个新的 `TokenBreakdown` 对象。虽然对于当前数据规模（数百到数千 session）影响不大，但这是一个不必要的分配模式。

**修复建议**: 使用 mutable 累加模式。

```typescript
export function addBreakdownMut(target: TokenBreakdown, source: TokenBreakdown): void {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.total += source.total;
}
```

---

### M-4: `countActiveDays` 使用字符串切片依赖于特定时间戳格式

**文件**: `src/core/aggregate.ts` 第 54-59 行

**问题**: `s.timestamp.slice(0, 10)` 假设所有时间戳都是 ISO 8601 格式（`YYYY-MM-DD...`）。但 Codex 适配器的 `toSessionRecord` 传入的 `date` 参数格式为 `"2026-04-03"`（纯日期，无时间部分），而 Claude Code 可能返回完整的 ISO 字符串。如果将来某个适配器返回非 ISO 格式的时间戳，此函数将静默失败。

**修复建议**: 使用 `Date` 对象进行标准化处理。

```typescript
export function countActiveDays(sessions: SessionRecord[]): number {
  const days = new Set<string>();
  for (const s of sessions) {
    const d = new Date(s.timestamp);
    if (!isNaN(d.getTime())) {
      days.add(d.toISOString().slice(0, 10));
    }
  }
  return days.size;
}
```

---

### M-5: `renderTerminalReport` 函数命名混淆 -- `rpad` 实际是右对齐，`lpad` 实际是左对齐

**文件**: `src/reporters/terminal.ts` 第 15-22 行

**问题**: `rpad` 使用 `padStart`（右对齐），`lpad` 使用 `padEnd`（左对齐）。命名与实际行为恰好相反（`rpad` 通常暗示 "right padding" 即左对齐，`lpad` 暗示 "left padding" 即右对齐）。

**修复建议**: 重命名为语义更清晰的函数名。

```typescript
function alignRight(s: string, w: number): string {
  return s.padStart(w);
}

function alignLeft(s: string, w: number): string {
  return s.padEnd(w);
}
```

---

### M-6: `collectAllSessions` 中 Date 排序每次比较重复创建 Date 对象

**文件**: `src/core/collect.ts` 第 77-79 行

**问题**: `sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())` 在每次比较操作中创建两个 `Date` 对象。对于 N 个 session 的排序（O(N log N) 次比较），总共创建约 2N*log(N) 个临时对象。

**修复建议**: 预计算时间戳。

```typescript
sessions.sort((a, b) => {
  // 如果时间戳格式一致，可以直接字符串比较（ISO 8601 保证字典序=时间序）
  return b.timestamp.localeCompare(a.timestamp);
});
```

---

### M-7: `processJournalLines` 中 `messageCount` 计算偏差

**文件**: `src/adapters/claude-code/parser.ts` 第 57-58 行

**问题**: `processJournalLines` 对每一行（包括 `user` 和 `assistant`）都执行 `acc.messageCount++`。但在 `applySessionMeta` 中（第 109-110 行），`messageCount` 被定义为 `user_message_count + assistant_message_count`。虽然当前过滤条件确保 `lines` 中只包含 `user` 和 `assistant` 类型，但函数签名接受 `JournalLine[]` 而非更窄的类型，未来如果过滤逻辑变化，计数可能出错。

**修复建议**: 在计数时显式检查类型。

```typescript
for (const line of lines) {
  if (line.type === "user" || line.type === "assistant") {
    acc.messageCount++;
  }
  // ...
}
```

---

### M-8: 测试中 `makeSession` 工厂函数重复定义

**文件**:
- `tests/core/filters.test.ts` 第 5-20 行
- `tests/core/aggregate.test.ts` 第 5-18 行
- `tests/reporters/terminal.test.ts` 第 6-22 行

**问题**: 三个测试文件各自定义了几乎完全相同的 `makeSession` 工厂函数。

**修复建议**: 提取到 `tests/helpers.ts` 共享模块。

---

## Low

### L-1: `package.json` 依赖版本使用 `"latest"`

**文件**: `package.json` 第 16 行

**问题**: `"@types/bun": "latest"` 在不同时间安装可能得到不同版本，破坏构建的可复现性。

**修复建议**: 锁定到具体版本号。

---

### L-2: `Codex parseSessionFile` 使用 Node.js `createReadStream` 而非 Bun 原生 API

**文件**: `src/adapters/codex/parser.ts` 第 3-4 行

**问题**: Codex 解析器使用 `createReadStream` + `createInterface` 进行流式解析，而 Claude Code 的 scanner 使用 `Bun.file(...).text()`。两种 I/O 模式混用，风格不统一。考虑到项目明确绑定 Bun 运行时，建议统一使用 Bun 原生 API。

**修复建议**: 统一为 `Bun.file().text()` + 手动行分割，或统一使用流式接口。

---

### L-3: `fmt` 函数使用硬编码 `"en-US"` locale

**文件**: `src/reporters/format.ts` 第 4-6 行

**问题**: 千分位格式化硬编码为英文格式（逗号分隔），但项目的 UI 语言是中文。虽然在技术报告中使用英文数字格式是常见做法，但没有注释说明这是有意为之。

**修复建议**: 添加注释说明选择此 locale 的原因。

---

### L-4: 库入口 `src/index.ts` 未导出 `CollectOptions` 类型

**文件**: `src/index.ts`

**问题**: 导出了 `collectAllSessions` 函数，但未导出其参数类型 `CollectOptions`。库的消费者无法方便地构造调用参数。

**修复建议**: 添加 `export type { CollectOptions } from "./core/collect";`

---

### L-5: `sessions` 和 `projects` 命令的渲染函数未使用共享的 `format.ts` 工具

**文件**: `src/cli/commands/sessions.ts` 第 57 行, `src/cli/commands/projects.ts` 第 57 行

**问题**: 这两个文件中使用了 `toLocaleString("en-US")` 进行数字格式化，而非复用 `src/reporters/format.ts` 中已有的 `fmt` 函数。

**修复建议**: 导入并使用 `fmt` 函数保持一致性。

---

### L-6: 测试中 `ROOTS` 变量在 `report.test.ts` 中声明但未使用

**文件**: `tests/cli/report.test.ts` 第 6 行

**问题**: `const ROOTS = ...` 声明后从未引用，实际使用的是 `rootArgs()` 函数。

**修复建议**: 删除未使用的变量。

---

### L-7: 时间测试 "defaults to current time" 存在时区敏感性

**文件**: `tests/core/time.test.ts` 第 32-38 行

**问题**: 测试使用 `new Date()` 和 `setDate/setHours` 本地时间方法与 `parseSinceSpec`（使用 UTC 方法）的结果比较。在非 UTC 时区且跨 UTC 日期边界时，此测试可能间歇性失败。

**修复建议**: 使用 UTC 方法构建期望值。

```typescript
test("defaults to current time when now is omitted", () => {
  const since = parseSinceSpec("1d");
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  expect(since.getTime()).toBe(yesterday.getTime());
});
```

---

## 统计摘要

| 严重程度 | 数量 | 类别分布 |
| --- | --- | --- |
| Critical | 2 | 代码重复/复杂度、性能 |
| High | 5 | DRY 违反、错误处理、数据一致性、安全 |
| Medium | 8 | 命名、类型安全、性能、测试 |
| Low | 7 | 风格一致性、依赖管理、导出完整性 |

## 优先修复建议

1. **立即处理** (Critical + High): 重构 `scanJournals` 消除重复、提取 `resolveTools` 到共享模块、修复 Markdown 转义、引入 debug 日志模式
2. **短期处理** (Medium): 修复 `rpad/lpad` 命名、统一 `total` 计算语义、提取测试工厂函数
3. **持续改进** (Low): 统一 I/O 风格、补全库类型导出、锁定依赖版本

## 项目亮点

审查过程中也观察到若干值得肯定的工程实践：

- **清晰的适配器模式**: `codex` 和 `claude-code` 适配器各自独立，通过 `SessionRecord` 统一接口，扩展新工具非常方便
- **CLI 可测试性**: `runCli` 返回 `CliResult` 对象而非直接写 stdout，使得 CLI 可以被单元测试完整覆盖
- **零外部运行时依赖**: 项目除了 `@types/bun` 外无任何依赖，减少供应链风险
- **完善的测试覆盖**: 81 个测试覆盖了核心逻辑、适配器、渲染器和 E2E 场景，且全部通过
- **合理的类型定义**: `TokenBreakdown`、`SessionRecord` 等类型设计合理，字段语义清晰
