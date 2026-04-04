# ai-usage-report 安全审计报告

> 审计日期: 2026-04-03
> 审计范围: 全部 24 个源文件，项目依赖，CLI 接口
> 审计标准: OWASP Top 10 (2021), CWE/SANS Top 25, NIST 安全编码规范

---

## 执行摘要

本项目是一个本地 CLI/库工具，读取 `~/.codex` 和 `~/.claude` 目录下的 AI 使用历史数据并生成统计报告。项目零外部运行时依赖，攻击面相对有限，但作为处理本地敏感数据的工具，仍存在以下安全风险：

| 严重级别 | 数量 | 说明 |
| --- | --- | --- |
| Critical | 1 | 路径遍历导致任意文件写入 |
| High | 2 | Markdown 注入、整文件内存加载 DoS |
| Medium | 4 | 敏感数据泄露、静默错误吞噬、未验证 JSON 反序列化、信息泄露 |
| Low | 3 | 数据完整性、ReDoS 潜在风险、不安全的 TypeScript 类型断言 |

---

## Finding-01: `--out` 参数路径遍历导致任意文件写入

- **严重级别**: Critical
- **CVSS 3.1**: 7.1 (High) — AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:H
- **CWE**: CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)
- **位置**: `src/cli/main.ts:73-75`

### 描述

CLI 的 `--out` 参数直接传递给 `writeFileSync`，无任何路径验证或限制。攻击者可以通过路径遍历覆盖任意文件。

### 漏洞代码

```typescript
// src/cli/main.ts:73-75
if (args.out) {
  writeFileSync(args.out, output, "utf-8");
  return { exitCode: 0, output: `已写入: ${args.out}` };
}
```

### 攻击场景

```bash
# 覆盖 shell 配置文件
ai-usage report --out /etc/cron.d/malicious
ai-usage report --out ~/.bashrc
ai-usage report --out ../../.ssh/authorized_keys

# 在脚本化场景中（如 CI 管道或 wrapper 脚本），
# 如果 --out 参数来自外部输入，攻击者可控制写入路径
```

### 修复建议

```typescript
import { resolve, relative } from "node:path";

function validateOutputPath(outPath: string): string {
  const resolved = resolve(outPath);
  const cwd = process.cwd();
  const rel = relative(cwd, resolved);

  // 禁止写入当前工作目录之外
  if (rel.startsWith("..") || resolve(rel) !== resolved) {
    throw new Error(
      `不安全的输出路径: "${outPath}"。输出文件必须在当前工作目录内。`,
    );
  }

  // 禁止覆盖隐藏文件和系统配置
  const basename = resolved.split("/").pop() ?? "";
  if (basename.startsWith(".")) {
    throw new Error(`不允许写入隐藏文件: "${basename}"`);
  }

  return resolved;
}
```

---

## Finding-02: Markdown 报告输出未转义 — 内容注入

- **严重级别**: High
- **CVSS 3.1**: 6.1 (Medium) — AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N
- **CWE**: CWE-79 (Improper Neutralization of Input During Web Page Generation)
- **位置**: `src/reporters/markdown.ts:46-84`, `src/cli/commands/sessions.ts:75-80`, `src/cli/commands/projects.ts:72-78`

### 描述

Markdown 报告渲染器将用户数据（`firstPrompt`, `projectPath`, `model`, `sessionId`）直接插入 Markdown 表格，未进行任何转义。这些字段的数据来源是本地 JSONL 文件，而 AI 会话中的 prompt 内容完全由用户控制（或由 AI 生成），可能包含恶意 Markdown/HTML。

当生成的 Markdown 报告在以下场景渲染时，注入有效：
- GitHub/GitLab issue 或 PR 中粘贴
- 团队协作平台（Notion, Confluence）
- 静态站点生成器

### 漏洞代码

```typescript
// src/reporters/markdown.ts:83-84
lines.push(
  `| ${s.sessionId} | ${s.tool} | ${s.model ?? "-"} | ... | ${prompt} |`,
);
```

### 攻击场景

如果某次 AI 会话的 `firstPrompt` 为：

```
请帮我写代码 | inject | inject | inject | inject | [点击查看详情](https://evil.com/phish)
```

或包含 HTML：

```
<img src="https://evil.com/track?user=target" /> <script>alert(1)</script>
```

生成的 Markdown 表格将被破坏，表格结构被篡改，在某些渲染器中可能执行 XSS。

### 修复建议

```typescript
/** 转义 Markdown 表格中的特殊字符 */
function escapeMarkdownCell(value: string): string {
  return value
    .replace(/\|/g, "\\|")          // 表格分隔符
    .replace(/\[/g, "\\[")          // 链接语法
    .replace(/\]/g, "\\]")
    .replace(/</g, "&lt;")          // HTML 标签
    .replace(/>/g, "&gt;")
    .replace(/\n/g, " ")            // 换行符
    .replace(/\r/g, "");
}

// 应用于所有动态内容插入点
const prompt = escapeMarkdownCell(s.firstPrompt?.slice(0, 47) ?? "-");
const project = escapeMarkdownCell(p.project);
```

在所有三个 Markdown 渲染位置均需应用此函数：
- `src/reporters/markdown.ts` — 所有表格行
- `src/cli/commands/sessions.ts:renderSessionsMarkdown()`
- `src/cli/commands/projects.ts:renderProjectsMarkdown()`

---

## Finding-03: 整文件内存加载 — 内存耗尽 DoS

- **严重级别**: High
- **CVSS 3.1**: 5.5 (Medium) — AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H
- **CWE**: CWE-400 (Uncontrolled Resource Consumption)
- **位置**: `src/adapters/claude-code/scanner.ts:99`, `src/adapters/claude-code/scanner.ts:173`

### 描述

Claude Code 的 journal 扫描器通过 `Bun.file(...).text()` 将整个 JSONL 文件一次性读入内存，然后使用 `.split("\n")` 拆分。对于大型会话文件（长时间运行的 AI 会话可能生成数百 MB 的日志），这会导致内存耗尽。

注意：Codex 适配器（`src/adapters/codex/parser.ts`）已正确使用 `createReadStream` + `readline` 流式处理。

### 漏洞代码

```typescript
// src/adapters/claude-code/scanner.ts:99
const text = await Bun.file(join(projPath, file)).text();
const lines = text.trim().split("\n").filter((l) => l.trim());
```

同样的模式在第 173 行重复出现。

### 攻击场景

```bash
# 模拟一个 500MB 的 JSONL 日志文件
dd if=/dev/urandom bs=1M count=500 | base64 > ~/.claude/projects/large-project/huge.jsonl
ai-usage report
# 进程因 OOM 被终止
```

在正常使用中，长期运行的 AI 会话也可能产生 100MB+ 的日志文件。

### 修复建议

```typescript
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

async function parseJsonlStream(
  filePath: string,
  handler: (line: JournalLine) => void,
): Promise<void> {
  const rl = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as JournalLine;
      handler(parsed);
    } catch {
      // 跳过无效行
    }
  }
}
```

---

## Finding-04: 敏感数据通过报告输出泄露

- **严重级别**: Medium
- **CVSS 3.1**: 4.3 (Medium) — AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N
- **CWE**: CWE-200 (Exposure of Sensitive Information to an Unauthorized Actor)
- **位置**: `src/adapters/claude-code/parser.ts:43-55`, `src/reporters/markdown.ts:77-84`, `src/cli/commands/sessions.ts:75-80`

### 描述

报告输出包含以下可能敏感的信息：

1. **`firstPrompt`**（截断至 200 字符）— 可能包含 API 密钥、密码、内部 URL、个人信息等用户在 AI 会话中输入的敏感内容
2. **`projectPath`** — 泄露本机完整文件系统路径，包含用户名
3. **`gitRemote`** — 可能包含带凭据的 Git URL（如 `https://token:x@github.com/...`）
4. **`sessionId`** — 可用于关联用户行为

当报告被共享到公开场所（团队 Wiki、CI 日志、GitHub issue）时，这些信息构成隐私泄露。

### 攻击场景

```
# 用户在 AI 会话中意外输入了密钥
prompt: "帮我修复这个 API 调用，key 是 sk-proj-abc123..."
# 该 prompt 会出现在报告的 Top Sessions 表中
```

### 修复建议

```typescript
// 1. 添加 --redact 选项，默认对敏感字段脱敏
function redactPrompt(prompt: string): string {
  // 移除疑似密钥/token 的字符串
  return prompt
    .replace(/\b(sk-|ghp_|gho_|github_pat_|xoxb-|xoxp-)\S+/gi, "[REDACTED]")
    .replace(/\b[A-Za-z0-9+/]{40,}\b/g, "[REDACTED]")
    .replace(/password\s*[:=]\s*\S+/gi, "password=[REDACTED]");
}

// 2. 对 projectPath 进行脱敏
function redactPath(path: string): string {
  const home = homedir();
  return path.replace(home, "~");
}

// 3. 对 gitRemote 脱敏
function redactGitUrl(url: string): string {
  return url.replace(/:\/\/[^@]+@/, "://[REDACTED]@");
}
```

---

## Finding-05: 静默错误吞噬掩盖安全异常

- **严重级别**: Medium
- **CVSS 3.1**: 3.7 (Low) — AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N
- **CWE**: CWE-390 (Detection of Error Condition Without Action), CWE-755 (Improper Handling of Exceptional Conditions)
- **位置**: 多处，主要在两个扫描器中

### 描述

项目中存在大量空 `catch {}` 块，静默忽略所有异常。这种模式在以下文件中尤其密集：

| 文件 | 空 catch 数量 |
| --- | --- |
| `src/adapters/codex/scanner.ts` | 5 处 |
| `src/adapters/claude-code/scanner.ts` | 12 处 |
| `src/adapters/codex/parser.ts` | 3 处 |

### 安全影响

1. **权限错误被静默忽略** — 如果 `~/.claude` 目录权限配置不当（如 world-readable），用户无法感知
2. **文件系统异常被掩盖** — 符号链接循环、挂载点问题等导致的路径遍历被静默跳过
3. **数据完整性丧失** — JSON 解析失败时数据丢失，用户无法得知哪些会话数据被跳过
4. **调试困难** — 生产环境中问题难以排查

### 修复建议

```typescript
// 引入轻量级日志机制
interface ScanWarning {
  file: string;
  error: string;
  code?: string;
}

const warnings: ScanWarning[] = [];

// 替代空 catch
try {
  const content = await Bun.file(path).json();
} catch (err) {
  warnings.push({
    file: path,
    error: err instanceof Error ? err.message : String(err),
    code: (err as NodeJS.ErrnoException).code,
  });
}

// 在报告中包含警告摘要
if (warnings.length > 0) {
  console.error(`[warn] ${warnings.length} 个文件读取失败，使用 --verbose 查看详情`);
}
```

---

## Finding-06: 不安全的 JSON 反序列化 — 未验证数据结构

- **严重级别**: Medium
- **CVSS 3.1**: 3.7 (Low) — AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:L
- **CWE**: CWE-502 (Deserialization of Untrusted Data)
- **位置**: `src/adapters/claude-code/scanner.ts:27-33`, `src/adapters/codex/parser.ts:60-63`

### 描述

项目使用 `JSON.parse()` 后直接通过 TypeScript `as` 类型断言将结果视为已知类型，未进行运行时结构验证。如果本地数据文件被篡改（恶意软件、另一个本地进程），可能导致：

1. 运行时类型错误导致程序崩溃
2. 构造特定 JSON 结构使数据聚合产生误导性结果
3. 原型污染（虽然 `JSON.parse` 本身不受 `__proto__` 影响，但 spread 操作可能传播恶意属性）

### 漏洞代码

```typescript
// src/adapters/claude-code/scanner.ts:27-33
const content = await Bun.file(join(facetsDir, file)).json();
if (content && typeof content === "object" && !Array.isArray(content)) {
  const entry = content as Record<string, unknown>;
  const sessionId =
    (entry.session_id as string) ?? file.replace(".json", "");
  entries.push({ ...entry, session_id: sessionId } as FacetEntry);
  //           ^^^^^^^^^ spread 操作可能传播意外属性
}
```

### 修复建议

```typescript
// 添加最小验证函数
function validateFacetEntry(raw: unknown): FacetEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  return {
    session_id: typeof obj.session_id === "string" ? obj.session_id : "",
    underlying_goal:
      typeof obj.underlying_goal === "string" ? obj.underlying_goal : undefined,
    brief_summary:
      typeof obj.brief_summary === "string" ? obj.brief_summary : undefined,
    outcome: typeof obj.outcome === "string" ? obj.outcome : undefined,
  };
}
```

---

## Finding-07: `--codex-dir` / `--claude-dir` 路径遍历读取

- **严重级别**: Medium
- **CVSS 3.1**: 4.0 (Medium) — AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N
- **CWE**: CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)
- **位置**: `src/cli/args.ts:148-152`, `src/core/collect.ts:45-46`

### 描述

`--codex-dir` 和 `--claude-dir` 参数直接传入文件系统扫描器，未做路径验证。攻击者可以指向任意目录进行文件内容读取。虽然只能读取特定格式的 JSON/JSONL 文件，但在以下场景构成风险：

1. **作为库被其他应用调用时**，外部输入直接传递给 `collectAllSessions({ roots: { claudeDir: userInput } })`
2. **符号链接攻击** — 扫描器递归遍历目录时会跟随符号链接

### 攻击场景

```typescript
// 如果作为库被 web 应用调用，攻击者可读取任意目录结构
const sessions = await collectAllSessions({
  roots: { claudeDir: "/etc" },
});
// 虽然不会解析出有效会话，但目录结构和文件列表信息泄露
```

### 修复建议

```typescript
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";

async function validateDataDir(dir: string, label: string): Promise<string> {
  const resolved = await realpath(dir).catch(() => dir);
  const home = homedir();

  // 限制在用户主目录内
  if (!resolved.startsWith(home)) {
    throw new Error(
      `${label} 目录 "${dir}" 不在用户主目录内，出于安全原因已拒绝。`,
    );
  }

  return resolved;
}
```

---

## Finding-08: `TokenBreakdown.total` 语义不一致 — 数据完整性

- **严重级别**: Low
- **CVSS 3.1**: 2.0 (Low)
- **CWE**: CWE-682 (Incorrect Calculation)
- **位置**: `src/adapters/codex/parser.ts:90-94` vs `src/adapters/claude-code/parser.ts:130-131`

### 描述

两个适配器计算 `total` 字段的方式不同：

- **Codex**: `total = total_tokens`（取上游 API 返回的 `total_tokens` 字段，可能不包含 cache 部分）
- **Claude Code**: `total = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens`（自行累加）

这导致聚合报告中跨工具的 token 对比不准确。`addBreakdown()` 中 `total` 直接累加两种不同语义的值。

### 漏洞代码

```typescript
// Codex — 使用上游值
result.tokenBreakdown.total = u.total_tokens;

// Claude Code — 自行计算
const total = acc.inputTokens + acc.outputTokens
            + acc.cacheReadTokens + acc.cacheWriteTokens;
```

### 修复建议

统一 `total` 的语义为"所有 token 种类之和"，在两个适配器中使用相同的计算方式：

```typescript
// 统一计算函数
function computeTotal(bd: TokenBreakdown): number {
  return bd.inputTokens + bd.outputTokens + bd.cacheReadTokens + bd.cacheWriteTokens;
}
```

---

## Finding-09: 时间规格解析存在潜在 ReDoS

- **严重级别**: Low
- **CVSS 3.1**: 2.0 (Low)
- **CWE**: CWE-1333 (Inefficient Regular Expression Complexity)
- **位置**: `src/core/time.ts:7`

### 描述

当前正则 `^(\d+)([dmy])$` 本身不存在 ReDoS（已有锚定且无回溯），但 `parseInt` 未限制数值范围。输入 `"999999999999999999d"` 会导致 Date 对象溢出为 `Invalid Date`，后续过滤逻辑可能产生意外行为。

### 修复建议

```typescript
const value = parseInt(match[1], 10);
if (!Number.isFinite(value) || value <= 0 || value > 3650) {
  throw new Error(`时间范围超出合理限制: ${value}，最大支持 3650 天 / 120 月 / 10 年`);
}
```

---

## Finding-10: 不安全的类型断言链

- **严重级别**: Low
- **CVSS 3.1**: 2.0 (Low)
- **CWE**: CWE-704 (Incorrect Type Conversion or Cast)
- **位置**: `src/adapters/codex/parser.ts:68`, `src/adapters/claude-code/scanner.ts:33`

### 描述

项目中多处使用 `as unknown as T` 双重断言绕过 TypeScript 类型检查。这消除了编译期类型安全保证，如果数据格式变更（上游 Codex/Claude Code 更新数据格式），不会有编译错误提示。

```typescript
const meta = payload as unknown as CodexSessionMetaPayload; // 双重断言
```

### 修复建议

使用类型守卫（type guard）替代类型断言：

```typescript
function isSessionMetaPayload(p: unknown): p is CodexSessionMetaPayload {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof (p as Record<string, unknown>).id === "string"
  );
}
```

---

## 依赖安全评估

### 运行时依赖

项目声明"零外部运行时依赖"，已验证 `package.json` 仅包含 `@types/bun` 作为 devDependency。这是安全最佳实践。

### 开发依赖

| 包名 | 版本 | 风险评估 |
| --- | --- | --- |
| `@types/bun` | 1.3.11 | 低风险 — 仅类型声明，不参与运行时 |

### 锁文件分析

`bun.lock` 中的包均来自 `registry.anpm.alibaba-inc.com`（阿里内网镜像）。需确认该镜像的完整性验证机制。建议通过 `sha512` 哈希校验包的完整性（已在 lockfile 中包含）。

### 供应链安全建议

1. 验证 `bunfig.toml` 中的镜像源配置，确保使用 HTTPS
2. 考虑启用 Bun 的 `--frozen-lockfile` 模式防止依赖被意外修改
3. 定期运行 `bun audit`（或等效工具）检查依赖漏洞

---

## 配置安全评估

### .gitignore 审查

当前 `.gitignore` 内容：

```
node_modules/
dist/
.DS_Store
*.log
```

**缺失项**:
- `.env` / `.env.*` — 如果未来添加配置文件
- `*.pem` / `*.key` — 证书/密钥文件
- `.full-review/` — 内部审查文件不应提交（当前已在 git 中）

### TypeScript 配置

`tsconfig.json` 中 `"strict": true` 已启用，这是安全最佳实践。

---

## 安全最佳实践建议

### 立即行动 (P0)

1. **修复 `--out` 路径遍历** — Finding-01
2. **添加 Markdown 转义** — Finding-02
3. **Claude Code JSONL 改为流式读取** — Finding-03

### 短期改进 (P1)

4. **添加 `--redact` 选项** — Finding-04
5. **替换空 catch 为结构化日志** — Finding-05
6. **添加 JSON 数据验证** — Finding-06

### 中期改进 (P2)

7. **统一 token 计算语义** — Finding-08
8. **添加输入范围校验** — Finding-09
9. **使用类型守卫替代断言** — Finding-10
10. **添加文件大小检查上限**（建议 100MB），超过时跳过并警告

### 架构层面建议

- **添加安全测试用例** — 针对路径遍历、Markdown 注入、超大文件等场景编写测试
- **在 CI 中集成 SAST** — 推荐使用 Semgrep 或 CodeQL 进行静态分析
- **考虑沙箱化** — 限制文件系统访问范围为 `$HOME/.codex` 和 `$HOME/.claude`

---

## 不适用项说明

以下 OWASP Top 10 项目因项目架构特性不适用：

| OWASP 类别 | 状态 | 原因 |
| --- | --- | --- |
| A01 Broken Access Control | 部分适用 | Finding-01, Finding-07 涵盖 |
| A02 Cryptographic Failures | 不适用 | 项目不涉及加密操作 |
| A03 Injection | 适用 | Finding-02 涵盖 |
| A04 Insecure Design | 部分适用 | Finding-04, Finding-08 涵盖 |
| A05 Security Misconfiguration | 部分适用 | 配置安全评估章节涵盖 |
| A06 Vulnerable Components | 不适用 | 零运行时依赖 |
| A07 Auth Failures | 不适用 | 项目无认证机制 |
| A08 Data Integrity Failures | 适用 | Finding-06, Finding-08 涵盖 |
| A09 Logging Failures | 适用 | Finding-05 涵盖 |
| A10 SSRF | 不适用 | 项目无网络请求 |
