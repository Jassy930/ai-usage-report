import { expect, test, describe } from "bun:test";
import { searchSessions } from "../../src/core/search";
import { runCli } from "../../src/cli/main";
import { join } from "node:path";
import type { SessionRecord, TokenBreakdown, SessionMessage } from "../../src/core/types";

const FIXTURES = join(import.meta.dir, "../fixtures");

function rootArgs(): string[] {
  return [
    `--codex-dir=${join(FIXTURES, "codex")}`,
    `--claude-dir=${join(FIXTURES, "claude-code")}`,
  ];
}

function makeSession(
  id: string,
  messages: Partial<SessionMessage>[],
): SessionRecord {
  const tb: TokenBreakdown = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    total: 0,
  };
  return {
    tool: "claude-code",
    sessionId: id,
    timestamp: "2026-04-03T10:00:00.000Z",
    messageCount: messages.length,
    tokenBreakdown: tb,
    messages: messages.map((m) => ({
      role: m.role ?? "user",
      kind: "message" as const,
      timestamp: m.timestamp ?? "2026-04-03T10:00:00.000Z",
      text: m.text,
      toolCalls: m.toolCalls ?? [],
      rawRefs: m.rawRefs ?? [],
    })),
    rawRefs: [],
  };
}

describe("searchSessions", () => {
  test("finds keyword in message text", () => {
    const sessions = [
      makeSession("s1", [
        { role: "user", text: "帮我看一下登录的问题" },
        { role: "assistant", text: "好的，我来看一下登录相关的代码。" },
      ]),
      makeSession("s2", [
        { role: "user", text: "帮我写个 API" },
        { role: "assistant", text: "没问题，我来实现。" },
      ]),
    ];

    const report = searchSessions(sessions, { query: "登录" });
    expect(report.totalMatches).toBe(2);
    expect(report.matchedSessions).toBe(1);
    expect(report.results[0]!.session.sessionId).toBe("s1");
  });

  test("counts multiple occurrences in one message", () => {
    const sessions = [
      makeSession("s1", [
        { role: "user", text: "test test test" },
      ]),
    ];

    const report = searchSessions(sessions, { query: "test" });
    expect(report.totalMatches).toBe(3);
  });

  test("case insensitive by default", () => {
    const sessions = [
      makeSession("s1", [
        { role: "user", text: "Hello World" },
      ]),
    ];

    const report = searchSessions(sessions, { query: "hello" });
    expect(report.totalMatches).toBe(1);
  });

  test("case sensitive when enabled", () => {
    const sessions = [
      makeSession("s1", [
        { role: "user", text: "Hello World" },
      ]),
    ];

    const report = searchSessions(sessions, {
      query: "hello",
      caseSensitive: true,
    });
    expect(report.totalMatches).toBe(0);
  });

  test("filters by role", () => {
    const sessions = [
      makeSession("s1", [
        { role: "user", text: "keyword here" },
        { role: "assistant", text: "keyword there" },
      ]),
    ];

    const report = searchSessions(sessions, {
      query: "keyword",
      role: "user",
    });
    expect(report.totalMatches).toBe(1);
    expect(report.results[0]!.matches[0]!.role).toBe("user");
  });

  test("returns empty when no matches", () => {
    const sessions = [
      makeSession("s1", [
        { role: "user", text: "nothing relevant" },
      ]),
    ];

    const report = searchSessions(sessions, { query: "foobar" });
    expect(report.totalMatches).toBe(0);
    expect(report.matchedSessions).toBe(0);
    expect(report.results.length).toBe(0);
  });

  test("sorts results by match count descending", () => {
    const sessions = [
      makeSession("s1", [{ role: "user", text: "a" }]),
      makeSession("s2", [{ role: "user", text: "a a a" }]),
      makeSession("s3", [{ role: "user", text: "a a" }]),
    ];

    const report = searchSessions(sessions, { query: "a" });
    expect(report.results[0]!.session.sessionId).toBe("s2");
    expect(report.results[1]!.session.sessionId).toBe("s3");
    expect(report.results[2]!.session.sessionId).toBe("s1");
  });
});

describe("search CLI command", () => {
  test("search requires --query", async () => {
    const result = await runCli(["search", "all", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("--query");
  });

  test("search with query returns JSON", async () => {
    const result = await runCli([
      "search",
      "all",
      "--format",
      "json",
      "--query",
      "登录",
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed.query).toBe("登录");
    expect(typeof parsed.totalMatches).toBe("number");
    expect(typeof parsed.matchedSessions).toBe("number");
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  test("search terminal format includes summary", async () => {
    const result = await runCli([
      "search",
      "all",
      "--query",
      "登录",
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("搜索结果");
    expect(result.output).toContain("登录");
  });

  test("search markdown format", async () => {
    const result = await runCli([
      "search",
      "all",
      "--format",
      "md",
      "--query",
      "登录",
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("# 搜索结果");
  });
});
