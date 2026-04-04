# 性能与可扩展性分析报告

> 分析对象: ai-usage-report (Bun + TypeScript CLI)
> 分析日期: 2026-04-03
> 场景基线: 重度用户 1 年数据 — 约 3,000+ 会话文件, 数百个 JSONL journals

---

## 发现总览

| 严重度 | 数量 | 分类 |
|--------|------|------|
| Critical | 2 | 内存安全, I/O 阻塞 |
| High | 3 | 内存分配, 并发缺失, 数据结构 |
| Medium | 4 | 算法效率, 缓存缺失, 重复计算 |
| Low | 3 | 微优化, 代码风格 |

---

## Critical 级别

### C-1: JSONL 整文件内存加载 — 内存溢出风险

**文件**: `src/adapters/claude-code/scanner.ts` L96-120, L170-198

**问题**: `scanJournals()` 使用 `Bun.file().text()` 将整个 JSONL 文件读入内存，然后 `.split("\n")` 创建完整行数组。Claude Code 的 journal 文件可以非常大（单个活跃会话 50-200MB），在大数据场景下:

1. 原始文本占用 N 字节内存
2. `.split("\n")` 额外创建长度为 M 的字符串数组（又是 N 字节引用 + 字符串对象开销）
3. 每行 `JSON.parse` 生成 JournalLine 对象
4. 所有 JournalLine 存入 `sessionMap`，整个生命周期内不释放

峰值内存约为单文件大小的 **3-4 倍**。10 个 100MB 文件 = 潜在 3-4GB 峰值内存。

**影响**: 大数据量下 OOM 崩溃，或触发 V8 GC thrashing 导致长时间停顿。

**建议**: 改用流式逐行解析，与 Codex 适配器保持一致。

```typescript
// 推荐: 流式解析，不保留原始文本
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function scanJournals(
  claudeDir: string,
): Promise<Map<string, JournalLine[]>> {
  const sessionMap = new Map<string, JournalLine[]>();
  // ...获取文件列表...

  for (const filePath of jsonlFiles) {
    const rl = createInterface({
      input: createReadStream(filePath, "utf-8"),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
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
        // skip
      }
    }
  }

  return sessionMap;
}
```

**进阶方案**: 如果 journal 数据量极大，可以只提取所需字段（sessionId, timestamp, usage, model, content 摘要），丢弃完整 message.content，减少驻留内存 80%+。

---

### C-2: Codex scanner 串行四层嵌套 I/O — 大数据量瓶颈

**文件**: `src/adapters/codex/scanner.ts` L9-68

**问题**: `scanSessionFiles()` 对 `sessions/YYYY/MM/DD/*.jsonl` 的四层目录结构执行**完全串行**的 `readdir` + `stat` 调用。每次 `isDir()` 都是一个独立的 `stat` 系统调用。

假设 1 年数据: 1 年 * 12 月 * 30 天 = ~365 个日期目录, 每天 5 个会话文件:
- `readdir`: 1(years) + 12(months) + 365(days) + 365(files) = ~743 次
- `stat` (isDir): 1 + 12 + 365 + ~1825 文件 = ~2203 次
- 总计: ~2946 次串行 I/O 系统调用

每次系统调用在 SSD 上约 0.1-0.5ms，纯 I/O 等待时间: **300ms - 1.5s**。

**影响**: 扫描阶段占据总执行时间的 30-50%，且与数据量线性增长。

**建议**: 并行化目录遍历 + 使用 `readdir` 的 `withFileTypes` 选项避免额外 `stat` 调用。

```typescript
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function scanSessionFiles(
  codexDir: string,
): Promise<Array<{ filePath: string; date: string }>> {
  const sessionsDir = join(codexDir, "sessions");
  const results: Array<{ filePath: string; date: string }> = [];

  let years;
  try {
    years = await readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return results;
  }

  // 并行处理所有年份
  const yearTasks = years
    .filter((d) => d.isDirectory())
    .map(async (yearEnt) => {
      const yearPath = join(sessionsDir, yearEnt.name);
      const months = await readdir(yearPath, { withFileTypes: true }).catch(() => []);

      // 并行处理所有月份
      const monthTasks = (months as import("node:fs").Dirent[])
        .filter((d) => d.isDirectory())
        .map(async (monthEnt) => {
          const monthPath = join(yearPath, monthEnt.name);
          const days = await readdir(monthPath, { withFileTypes: true }).catch(() => []);

          // 并行处理所有日期
          const dayTasks = (days as import("node:fs").Dirent[])
            .filter((d) => d.isDirectory())
            .map(async (dayEnt) => {
              const dayPath = join(monthPath, dayEnt.name);
              const files = await readdir(dayPath).catch(() => []);
              const localResults: typeof results = [];
              for (const file of files) {
                if (file.endsWith(".jsonl")) {
                  localResults.push({
                    filePath: join(dayPath, file),
                    date: `${yearEnt.name}-${monthEnt.name}-${dayEnt.name}`,
                  });
                }
              }
              return localResults;
            });

          return (await Promise.all(dayTasks)).flat();
        });

      return (await Promise.all(monthTasks)).flat();
    });

  return (await Promise.all(yearTasks)).flat();
}
```

**预估提升**: `stat` 调用从 ~2200 次降至 0（`withFileTypes` 复用 `readdir` 结果）。并行化后总 I/O 等待从 ~1s 降至 ~50-100ms（受 fd 并发限制）。

---

## High 级别

### H-1: Codex 会话文件串行解析 — 并发机会浪费

**文件**: `src/adapters/codex/index.ts` L26-33

**问题**: `collectCodexSessions()` 中逐个 `await parseSessionFile(filePath)`，完全串行。每个文件需要打开 → 读取 → JSON.parse → 关闭。3000 个文件串行处理可能需要 10-30 秒。

```typescript
// 当前: 串行
for (const { filePath, date } of files) {
  const parsed = await parseSessionFile(filePath);  // 一次一个
  // ...
}
```

**影响**: 1 年 3000+ 文件时，I/O 等待时间线性增长。

**建议**: 使用并发池控制并行度。

```typescript
const CONCURRENCY = 32;

export async function collectCodexSessions(
  options: CodexCollectOptions,
): Promise<SessionRecord[]> {
  const { codexDir } = options;
  const [files, promptMap] = await Promise.all([
    scanSessionFiles(codexDir),
    loadHistoryPrompts(codexDir),
  ]);

  const sessions: SessionRecord[] = [];

  // 分批并发解析
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(({ filePath }) => parseSessionFile(filePath)),
    );

    for (let j = 0; j < results.length; j++) {
      const parsed = results[j];
      if (!parsed.sessionId) continue;
      const firstPrompt = promptMap.get(parsed.sessionId);
      sessions.push(toSessionRecord(parsed, batch[j].date, firstPrompt));
    }
  }

  return sessions;
}
```

**预估提升**: 3000 文件从 ~15s 降至 ~1-2s（32 路并发，受磁盘 IOPS 限制）。

---

### H-2: `addBreakdown` 每次调用创建新对象 — GC 压力

**文件**: `src/core/aggregate.ts` L13-21, `src/core/report.ts` L30-33

**问题**: `buildUsageReport()` 中循环调用 `tokenBreakdown = addBreakdown(a, b)`，每次迭代创建一个新的 TokenBreakdown 对象。N 个会话 = N 次对象分配 + N-1 次 GC 回收旧对象。

```typescript
// 当前: 每次循环创建新对象
for (const s of sessions) {
  tokenBreakdown = addBreakdown(tokenBreakdown, s.tokenBreakdown); // new obj
  totalMessages += s.messageCount;
}
```

**影响**: 3000 会话 = 3000 个短命对象。对 V8 Minor GC 造成压力，但不太可能导致可见停顿。在更大数据集（10K+）或高频调用场景下会更明显。

**建议**: 使用原地累加的 `accumulateBreakdown` 函数。

```typescript
/** 原地累加 — 无新对象分配 */
export function accumulateBreakdown(target: TokenBreakdown, source: TokenBreakdown): void {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.total += source.total;
}

// report.ts 中使用:
const tokenBreakdown = emptyBreakdown();
for (const s of sessions) {
  accumulateBreakdown(tokenBreakdown, s.tokenBreakdown);
  totalMessages += s.messageCount;
}
```

保留 `addBreakdown` 用于需要不可变语义的场景，新增 `accumulateBreakdown` 用于热循环。

---

### H-3: `processJournalLines` 排序时大量临时 Date 对象

**文件**: `src/adapters/claude-code/parser.ts` L34-35

**问题**: `processJournalLines()` 对传入的 lines 排序时，每次比较调用 `new Date(a.timestamp).getTime()`。排序算法执行 O(N log N) 次比较，每次比较创建 2 个 Date 对象。

一个活跃会话可能有 500+ 行 journal。排序产生 `~500 * log2(500) * 2 = ~9000` 个临时 Date 对象。乘以会话数更可观。

```typescript
// 当前: 比较函数中反复创建 Date
const sorted = [...lines].sort(
  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
);
```

**影响**: 大量短命对象造成 GC 压力。在 3000 会话 * 平均 200 行的场景下，总共产生数百万个临时 Date 对象。

**建议**: 预计算时间戳，使用 Schwartzian Transform 或直接字符串比较。

```typescript
// 方案 1: ISO 8601 字符串直接字典序比较（格式一致时等价于时间排序）
const sorted = [...lines].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// 方案 2: 预计算 + 缓存（如果时间戳格式不保证一致）
const withTime = lines.map((line) => ({
  line,
  time: new Date(line.timestamp).getTime(),
}));
withTime.sort((a, b) => a.time - b.time);
const sorted = withTime.map((w) => w.line);
```

方案 1 最优，Date 对象分配从 O(N log N) 降至 0。前提是 timestamp 格式统一为 ISO 8601。

---

## Medium 级别

### M-1: `collectAllSessions` 排序时重复创建 Date 对象

**文件**: `src/core/collect.ts` L77-79

**问题**: 与 H-3 相同模式。最终排序在所有会话合并后执行:

```typescript
sessions.sort(
  (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
);
```

如果有 3000 个会话，排序比较约 `3000 * log2(3000) * 2 = ~70,000` 个临时 Date 对象。

**建议**: 同 H-3，使用 `localeCompare` 或预计算。

```typescript
sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
```

---

### M-2: Claude Code scanner 两次遍历 projects 目录

**文件**: `src/adapters/claude-code/scanner.ts` L69-203

**问题**: `scanJournals()` 包含两段几乎完全相同的代码:
1. L78-126: 遍历 `projects/{dir}/*.jsonl`（顶层 JSONL）
2. L135-200: 遍历 `projects/{dir}/{subdir}/*.jsonl`（子目录 JSONL）

两次都执行 `readdir` + `stat` 对同一批 `projectDirs`。第一次遍历已经读取了所有 entries，第二次再次 `readdir` + `stat` 完全相同的目录。

**影响**: I/O 调用数翻倍。假设 50 个 project 目录，每个 20 个 entry: 额外 50 次 `readdir` + 1000 次 `stat`。

**建议**: 合并为单次遍历，区分文件和子目录。

```typescript
for (const projDir of projectDirs) {
  const projPath = join(projectsDir, projDir);
  let entries;
  try {
    entries = await readdir(projPath, { withFileTypes: true });
  } catch { continue; }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      // 顶层 JSONL — 直接处理
      await processJsonlFile(join(projPath, entry.name), sessionMap);
    } else if (entry.isDirectory()) {
      // 子目录 — 扫描其中的 JSONL
      const subFiles = await readdir(join(projPath, entry.name)).catch(() => []);
      for (const sf of subFiles) {
        if (sf.endsWith(".jsonl")) {
          await processJsonlFile(join(projPath, entry.name, sf), sessionMap);
        }
      }
    }
  }
}
```

---

### M-3: `filterSessions` 中重复的 `toLowerCase()` 调用

**文件**: `src/core/filters.ts` L29, L35

**问题**: `options.project.toLowerCase()` 和 `options.model.toLowerCase()` 在每次 filter 回调中执行。N 个会话 = N 次对同一个字符串调用 `toLowerCase()`。

**影响**: 微小但不必要的 CPU 开销。3000 个会话 = 6000 次无意义的字符串操作。

**建议**: 在循环外预计算。

```typescript
export function filterSessions(
  sessions: SessionRecord[],
  options: FilterOptions,
): SessionRecord[] {
  const projectKeyword = options.project?.toLowerCase();
  const modelKeyword = options.model?.toLowerCase();

  return sessions.filter((s) => {
    if (options.since) {
      const ts = new Date(s.timestamp);
      if (ts < options.since) return false;
    }
    if (options.tool && s.tool !== options.tool) return false;
    if (projectKeyword) {
      const path = (s.projectPath ?? "").toLowerCase();
      if (!path.includes(projectKeyword)) return false;
    }
    if (modelKeyword) {
      const model = (s.model ?? "").toLowerCase();
      if (!model.includes(modelKeyword)) return false;
    }
    return true;
  });
}
```

---

### M-4: `buildUsageReport` 中 sessions 完整复制后排序

**文件**: `src/core/report.ts` L41-43

**问题**: `[...sessions].sort(...)` 创建了完整的 sessions 数组副本。如果有 3000 个 SessionRecord，每个包含多个字段和 tokenBreakdown 子对象，浅拷贝数组本身约 24KB（指针），但加上排序后的数组引用，内存中同时存在两份完整的 sessions 引用。

更关键的是: `report.sessions = sorted` 将**所有**会话记录放入报告对象。对于 JSON 输出，这意味着序列化 3000 个完整的 SessionRecord 对象，可能产生 **数 MB 的 JSON 字符串**。

**影响**: JSON 报告在大数据量下体积膨胀，序列化/写入耗时增加。

**建议**: 报告中只保留 Top N 会话（报告渲染器也只显示 Top 10），或提供分页。

```typescript
// 只在报告中保留 Top N
const TOP_N = 50;
const sorted = [...sessions]
  .sort((a, b) => b.tokenBreakdown.total - a.tokenBreakdown.total)
  .slice(0, TOP_N);
```

---

## Low 级别

### L-1: `scanFacets` / `scanSessionMeta` 串行读取小 JSON 文件

**文件**: `src/adapters/claude-code/scanner.ts` L17-66

**问题**: 两个函数都是 `for` 循环内串行 `await Bun.file().json()`。这些文件通常很小（< 1KB），但数量可能很多（3000+ facet 文件 + 3000+ meta 文件）。

**影响**: 对于小文件，系统调用开销（open/read/close）占比更高。串行处理 6000 个小文件约 1-3 秒。

**建议**: 可改为批量并发，但这些文件足够小，影响相对有限。优先级低于 C-1 和 H-1。

```typescript
// 简单的并发批处理
const BATCH = 64;
for (let i = 0; i < files.length; i += BATCH) {
  const batch = files.slice(i, i + BATCH);
  const results = await Promise.all(
    batch.filter(f => f.endsWith(".json")).map(async (file) => {
      try {
        return await Bun.file(join(dir, file)).json();
      } catch { return null; }
    }),
  );
  for (const content of results) {
    if (content && typeof content === "object") entries.push(content);
  }
}
```

---

### L-2: `writeFileSync` 阻塞事件循环

**文件**: `src/cli/main.ts` L73

**问题**: `--out` 选项使用 `writeFileSync` 同步写入文件。对于大报告（JSON 格式 + 大量会话），可能阻塞数百毫秒。

**影响**: CLI 场景下几乎无感知（程序即将退出），但作为库使用时可能影响调用方。

**建议**: 改为 `await writeFile()`。

```typescript
import { writeFile } from "node:fs/promises";

if (args.out) {
  await writeFile(args.out, output, "utf-8");
  return { exitCode: 0, output: `已写入: ${args.out}` };
}
```

---

### L-3: `results.flat()` 创建不必要的中间数组

**文件**: `src/core/collect.ts` L59

**问题**: `Promise.all(tasks)` 返回后 `.flat()` 创建一个新数组。如果只有 2 个适配器，影响微乎其微。

**影响**: 可忽略。仅在适配器数量增长或数据量极大时有意义。

**建议**: 保持现状即可，或改用 `push` 直接合并。

---

## 可扩展性场景分析

### 场景: 1 年重度使用（每天 10 个会话）

| 指标 | 估算值 |
|------|--------|
| Codex JSONL 文件数 | ~3,650 |
| Claude Code journal 文件数 | ~200 (按 project 分组) |
| Claude Code meta/facet 文件数 | ~3,650 each |
| 单 journal 文件大小 | 10-200 MB |
| 总原始数据量 | 5-40 GB |

| 瓶颈 | 当前耗时估算 | 优化后估算 |
|------|-------------|-----------|
| Codex 目录扫描 | 1-2s | < 100ms |
| Codex 文件解析 (串行) | 10-30s | 1-3s |
| Claude journal 加载 | 取决于文件大小，可能 OOM | 流式处理，内存可控 |
| Claude meta/facet 加载 | 2-5s | < 1s |
| 排序 + 过滤 + 聚合 | < 1s | < 0.5s |
| **总计** | **15-40s (或 OOM)** | **3-5s** |

---

## 优先修复建议

1. **立即修复 (P0)**: C-1 (流式解析 journal) — 消除 OOM 风险
2. **高优先 (P1)**: C-2 + H-1 (Codex 并行扫描 + 并行解析) — 10x 性能提升
3. **中优先 (P2)**: H-2 + H-3 + M-1 (消除临时对象分配) — 减少 GC 压力
4. **低优先 (P3)**: M-2 + M-3 + M-4 (代码清理 + 报告瘦身) — 代码质量提升

---

## 架构级建议

### 1. 统一 I/O 策略

两个适配器采用不同的 I/O 策略:
- Codex: Node.js `createReadStream` + `readline`（流式，内存友好）
- Claude Code: `Bun.file().text()`（全量加载，内存危险）

建议统一为**流式处理**，并封装为共享的 JSONL 解析工具函数。

### 2. 引入早期过滤

当前流程: 采集全部数据 → 过滤 → 排序 → 报告。

优化流程: 在采集阶段就根据 `since` 时间范围跳过不需要的文件（Codex 的目录结构天然支持按日期跳过），减少不必要的 I/O。

```typescript
// Codex: 根据日期目录名直接跳过
if (options.since) {
  const sinceDate = options.since; // "2026-01-01"
  // 跳过 sinceDate 之前的 YYYY/MM/DD 目录
  if (`${year}-${month}-${day}` < sinceDate) continue;
}
```

### 3. 增量缓存方案

对于 CLI 频繁调用的场景，可以引入轻量级本地缓存:
- 缓存文件: `~/.cache/ai-usage-report/sessions.json`
- 记录已解析文件的路径和 mtime
- 下次运行只解析新增/修改的文件
- 缓存命中时从 40s 降至 < 1s
