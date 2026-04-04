# Bun + TypeScript 最佳实践审查

**项目**: ai-usage-report  
**日期**: 2026-04-03  
**运行时**: Bun 1.3.11 | TypeScript ESNext + strict  
**范围**: 24 源文件，零外部运行时依赖

---

## 审查摘要

| 严重级 | 数量 |
| --- | --- |
| High | 4 |
| Medium | 6 |
| Low | 3 |

整体评价：项目结构清晰、类型系统使用合理，但在 Bun 原生 API 的利用上存在明显差距——大量 `node:` 兼容层 API 可替换为更高效的 Bun 原生 API。TypeScript 层面存在少量类型断言和惯用语法改进空间。

---

## 1. Bun 原生 API 未充分利用

### 1.1 [HIGH] Codex scanner: 手动递归目录遍历 -> `Bun.Glob`

`src/adapters/codex/scanner.ts` 用 4 层嵌套 `readdir` + `stat` 手动遍历 `sessions/YYYY/MM/DD/*.jsonl`，共 70 行代码。Bun 内置 `Glob` API 可一行解决。

**当前代码** (70 行):
```ts
import { readdir, stat } from "node:fs/promises";
// 4 层嵌套 for 循环 + isDir 辅助函数...
```

**推荐代码** (~10 行):
```ts
import { Glob } from "bun";

export async function scanSessionFiles(
  codexDir: string,
): Promise<Array<{ filePath: string; date: string }>> {
  const glob = new Glob("sessions/*/*/*/*.jsonl");
  const results: Array<{ filePath: string; date: string }> = [];

  for await (const match of glob.scan({ cwd: codexDir, absolute: true })) {
    // match: /path/to/sessions/2026/04/03/abc.jsonl
    const parts = match.split("/");
    const len = parts.length;
    const date = `${parts[len - 4]}-${parts[len - 3]}-${parts[len - 2]}`;
    results.push({ filePath: match, date });
  }
  return results;
}
```

**收益**: 代码量减少 85%，消除 4 层串行 `stat()` 调用，Glob.scan 内部基于 readdir 的高效迭代。

### 1.2 [HIGH] Codex parser: `node:readline` 流式读取 -> `Bun.file().text()` + split

`src/adapters/codex/parser.ts` 使用 `createReadStream` + `createInterface` 组合（Node.js readline 模式）读 JSONL。这是 Node 旧式 API，Bun 的 `Bun.file().text()` 更简洁且同样高效。

**当前代码**:
```ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const rl = createInterface({
  input: createReadStream(filePath, "utf-8"),
  crlfDelay: Infinity,
});
for await (const line of rl) { ... }
```

**推荐代码**:
```ts
const text = await Bun.file(filePath).text();
for (const line of text.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  // ...
}
```

**注意**: 如果单文件可能很大 (>100MB)，可保留流式方案，但应使用 Bun 原生的 `ReadableStream`。对于典型 Codex session JSONL（KB 到低 MB 级别），全量读取完全合适。该项目的 claude-code scanner 中已经用了 `Bun.file().text()` 模式，应统一。

### 1.3 [HIGH] CLI writeFileSync -> `Bun.write()`

`src/cli/main.ts` 使用 `node:fs` 的 `writeFileSync` 写出文件。

**当前代码**:
```ts
import { writeFileSync } from "node:fs";
writeFileSync(args.out, output, "utf-8");
```

**推荐代码**:
```ts
await Bun.write(args.out, output);
```

`Bun.write()` 更简洁，无需导入 `node:fs`，且性能优于 Node.js 兼容 API。

### 1.4 [MEDIUM] Claude Code scanner: `readdir` + `stat` -> `Bun.Glob`

`src/adapters/claude-code/scanner.ts` 的 `scanJournals()` 函数(200 行) 也是手动递归遍历目录。同样可用 `Bun.Glob` 大幅简化。

**推荐**:
```ts
const glob = new Glob("**/*.jsonl");
for await (const match of glob.scan({ cwd: projectsDir, absolute: true })) {
  // 处理每个 JSONL 文件
}
```

### 1.5 [MEDIUM] `node:os` homedir -> `Bun.env.HOME`

`src/core/collect.ts` 导入 `homedir` from `"node:os"`。

**推荐**:
```ts
const home = Bun.env.HOME ?? Bun.env.USERPROFILE ?? "/tmp";
```

减少一个 `node:` 模块导入。不过这是较小的改进，`homedir()` 在 Bun 中完全兼容。

---

## 2. TypeScript 惯用语法

### 2.1 [HIGH] 不安全类型断言 (unsafe casts)

`src/adapters/codex/parser.ts` 有两处 `as unknown as` 双重断言:

```ts
// 第 68 行
const meta = payload as unknown as CodexSessionMetaPayload;
// 第 78 行
const tc = payload as unknown as CodexTokenCountPayload;
```

`src/adapters/claude-code/parser.ts` 第 79 行:
```ts
for (const block of line.message.content as ContentBlock[]) {
```

**推荐**: 使用类型守卫（type guard）替代断言:

```ts
function isSessionMeta(p: unknown): p is CodexSessionMetaPayload {
  return typeof p === "object" && p !== null && "id" in p && "cwd" in p;
}

// 使用
if (type === "session_meta" && isSessionMeta(payload)) {
  result.sessionId = payload.id;  // 类型安全
}
```

或者将 `CodexRawEvent` 改为判别联合类型 (discriminated union):

```ts
type CodexRawEvent =
  | { timestamp: string; type: "session_meta"; payload: CodexSessionMetaPayload }
  | { timestamp: string; type: "event_msg"; payload: CodexTokenCountPayload | CodexMessagePayload };
```

### 2.2 [MEDIUM] parseArgs 手写 -> `util.parseArgs` 或 Bun 原生方案

`src/cli/args.ts` 用 155 行手写参数解析器，包含对 `--key=value`、`-f value`、位置参数的处理。Node.js 18+ / Bun 内置 `util.parseArgs` 可大幅简化:

```ts
import { parseArgs as nodeParseArgs } from "node:util";

const { values, positionals } = nodeParseArgs({
  args: argv,
  options: {
    format: { type: "string", short: "f", default: "terminal" },
    since:  { type: "string", short: "s" },
    limit:  { type: "string", short: "l" },
    project:{ type: "string", short: "p" },
    model:  { type: "string", short: "m" },
    out:    { type: "string", short: "o" },
    "codex-dir": { type: "string" },
    "claude-dir": { type: "string" },
    help:   { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
  strict: false,
});
```

**收益**: 消除手写解析器的边界 bug（如 `-short` 两字符以上的短选项不处理）、减少 100+ 行代码。

### 2.3 [MEDIUM] `resolveTools` 函数重复三次

`src/cli/commands/report.ts`、`sessions.ts`、`projects.ts` 中各有一个完全相同的 `resolveTools`:

```ts
function resolveTools(tool: string): ToolType[] | undefined {
  if (tool === "codex") return ["codex"];
  if (tool === "claude-code") return ["claude-code"];
  return undefined;
}
```

**推荐**: 提取到共享模块（如 `src/cli/utils.ts` 或直接放 `args.ts`）:

```ts
// src/cli/args.ts 中导出
export function resolveTools(tool: ParsedArgs["tool"]): ToolType[] | undefined {
  if (tool === "all") return undefined;
  return [tool];
}
```

三行替代三份重复，且利用类型系统确保穷尽性。

### 2.4 [LOW] Non-null assertion `!` 偏好

测试中多处使用 `sessions[0]!`（非空断言）。在测试中可接受，但更健壮的写法:

```ts
const s = sessions[0];
expect(s).toBeDefined();
// 后续 s! 或使用 if guard
```

---

## 3. 构建与包管理配置

### 3.1 [MEDIUM] tsconfig.json 缺少 Bun 推荐选项

**当前**:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    ...
  }
}
```

**推荐补充**:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["@types/bun"],
    // 推荐补充:
    "noUncheckedIndexedAccess": true,    // 数组/Record 访问自动加 | undefined
    "exactOptionalProperties": true,     // 区分 undefined 和 missing
    "verbatimModuleSyntax": true,        // 强制 import type
    "isolatedModules": true,             // 确保与 Bun 的 transpiler 兼容
    "resolveJsonModule": true            // 支持 JSON import
  }
}
```

其中 `noUncheckedIndexedAccess` 最有价值——当前代码中 `positional[0]`、`sessions[0]` 等数组访问没有 undefined check，启用此选项后 TypeScript 会自动标记。

### 3.2 [MEDIUM] bunfig.toml 几乎为空

当前 `bunfig.toml` 只有 `[test]` 一行。推荐补充:

```toml
[test]
coverage = true
coverageReporter = ["text", "lcov"]

[install]
peer = false
```

### 3.3 [LOW] `@types/bun` 版本锁定为 "latest"

`package.json` 中:
```json
"devDependencies": {
  "@types/bun": "latest"
}
```

`"latest"` 标签在 CI 环境中不稳定。推荐锁定到具体版本:
```json
"@types/bun": "^1.3.0"
```

### 3.4 [LOW] 缺少 lint / format 工具链

没有发现 `biome.json`、`.eslintrc`、`.prettierrc` 等配置。Bun 生态推荐 **Biome**（零配置、极快）:

```bash
bun add -d @biomejs/biome
bunx biome init
```

`package.json` scripts 补充:
```json
"scripts": {
  "lint": "bunx biome check src tests",
  "format": "bunx biome format --write src tests"
}
```

---

## 4. 空 catch 块问题

全项目共 22 处空 `catch {}` 块（scanner 两个文件贡献了 18 处）。这些 catch 块吞掉了所有错误，包括：

- 权限错误 (EACCES)
- 磁盘空间不足 (ENOSPC)
- 无效 JSON 格式（被静默跳过，无法排查数据问题）

**推荐分级处理**:

```ts
// 文件不存在 -> 正常跳过
// 其他错误 -> 至少 console.warn 或收集到 errors 数组
try {
  const content = await Bun.file(path).json();
} catch (err) {
  if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
    continue; // 文件不存在，跳过
  }
  // 其他错误应上报
  console.warn(`[warn] 无法解析 ${path}: ${err}`);
}
```

采用 `Bun.Glob` 后许多 `readdir` / `stat` 的 try-catch 可以完全消除。

---

## 5. 现代化改进建议

### 5.1 `using` 声明 (Explicit Resource Management)

Bun 1.1+ 支持 TC39 `using` 声明。当前 codex parser 中的 readline 接口可受益:

```ts
// 如果保留流式读取，可用 using 管理生命周期
await using file = Bun.file(filePath).stream();
```

当前项目中没有需要手动关闭的资源管理场景（Bun.file 不需要显式关闭），但值得在代码规范中声明支持。

### 5.2 `satisfies` 操作符

部分类型断言可用 `satisfies` 替代，提供更好的类型推断:

```ts
// 当前
const ALL_TOOLS: ToolType[] = ["codex", "claude-code"];

// 推荐 — 保留字面量类型
const ALL_TOOLS = ["codex", "claude-code"] as const satisfies readonly ToolType[];
```

### 5.3 Structured clone 替代展开运算符

`src/adapters/claude-code/parser.ts` 中 `{ ...meta.tool_counts }` 可用 `structuredClone()`:
```ts
acc.toolUsage = structuredClone(meta.tool_counts);
```

对于简单的扁平对象两者等价，但 `structuredClone` 语义更明确。

---

## 6. 与先前审查发现的交叉验证

| 先前发现 | 本次验证 | Bun/TS 视角补充 |
| --- | --- | --- |
| JSONL 整文件内存加载 | 确认: claude-code scanner 用 `.text()` 全量加载 | 对于 Bun 来说全量加载通常比 readline 流更快；大文件场景可用 `Bun.file().stream()` 替代 |
| Codex scanner 串行 I/O | 确认: 4 层嵌套串行 readdir | `Bun.Glob` 彻底解决 |
| 20+ 空 catch 块 | 确认: 22 处 | 采用 Glob 后可减少至约 6 处 |
| parseArgs 手写 + 类型断言 | 确认 | `node:util` parseArgs 或第三方如 `citty` |
| resolveTools 重复三次 | 确认 | 提取到 `args.ts` 并利用类型收窄 |

---

## 优先级执行建议

1. **P0 (立即)**: 用 `Bun.Glob` 重写两个 scanner 文件，消除手动递归和大量空 catch
2. **P0 (立即)**: Codex parser 统一使用 `Bun.file().text()` 替代 readline
3. **P1 (近期)**: `writeFileSync` -> `Bun.write()`
4. **P1 (近期)**: 提取 `resolveTools` 到共享位置
5. **P1 (近期)**: tsconfig 启用 `noUncheckedIndexedAccess` + `isolatedModules`
6. **P2 (计划)**: 用 `node:util` parseArgs 替换手写解析器
7. **P2 (计划)**: 引入 Biome 作为 lint/format 工具
8. **P3 (改善)**: 类型断言改为 type guard / discriminated union
