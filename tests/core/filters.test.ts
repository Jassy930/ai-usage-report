import { expect, test, describe } from "bun:test";
import { filterSessions } from "../../src/core/filters";
import type { SessionRecord } from "../../src/core/types";

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    tool: "claude-code",
    sessionId: "test-001",
    timestamp: "2026-04-01T10:00:00Z",
    messageCount: 5,
    tokenBreakdown: {
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      total: 300,
    },
    messages: [],
    rawRefs: [],
    ...overrides,
  };
}

const sessions: SessionRecord[] = [
  makeSession({
    sessionId: "s1",
    tool: "claude-code",
    timestamp: "2026-04-01T10:00:00Z",
    projectPath: "/projects/web-app",
    model: "opus",
  }),
  makeSession({
    sessionId: "s2",
    tool: "codex",
    timestamp: "2026-03-20T10:00:00Z",
    projectPath: "/projects/api-server",
    model: "sonnet",
  }),
  makeSession({
    sessionId: "s3",
    tool: "claude-code",
    timestamp: "2026-03-01T10:00:00Z",
    projectPath: "/projects/web-app",
    model: "opus",
  }),
  makeSession({
    sessionId: "s4",
    tool: "codex",
    timestamp: "2026-02-15T10:00:00Z",
    projectPath: "/projects/mobile",
    model: "haiku",
  }),
];

describe("filterSessions", () => {
  test("returns all sessions when no filters", () => {
    const result = filterSessions(sessions, {});
    expect(result).toHaveLength(4);
  });

  test("filters by since date", () => {
    const since = new Date("2026-03-15T00:00:00Z");
    const result = filterSessions(sessions, { since });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
  });

  test("filters by tool", () => {
    const result = filterSessions(sessions, { tool: "codex" });
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.tool === "codex")).toBe(true);
  });

  test("filters by project keyword", () => {
    const result = filterSessions(sessions, { project: "web-app" });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toEqual(["s1", "s3"]);
  });

  test("filters by model keyword", () => {
    const result = filterSessions(sessions, { model: "opus" });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.sessionId)).toEqual(["s1", "s3"]);
  });

  test("combines multiple filters", () => {
    const result = filterSessions(sessions, {
      tool: "claude-code",
      model: "opus",
      since: new Date("2026-03-15T00:00:00Z"),
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.sessionId).toBe("s1");
  });

  test("returns empty array when no matches", () => {
    const result = filterSessions(sessions, { model: "nonexistent" });
    expect(result).toHaveLength(0);
  });

  test("project filter is case-insensitive", () => {
    const result = filterSessions(sessions, { project: "Web-App" });
    expect(result).toHaveLength(2);
  });
});

describe("filterSessions — 按请求实际发生时间裁剪跨天会话", () => {
  // 一个 06-08 启动、跨到 06-09 的会话：两天各有一条带 usage 的请求
  const crossDay = makeSession({
    sessionId: "cross-day",
    tool: "codex",
    timestamp: "2026-06-08T12:00:00Z",
    timestampEnd: "2026-06-09T08:00:00Z",
    messageCount: 2,
    tokenBreakdown: {
      inputTokens: 140,
      outputTokens: 40,
      cacheReadTokens: 160,
      cacheWriteTokens: 0,
      total: 340,
    },
    messages: [
      {
        role: "user",
        kind: "message",
        timestamp: "2026-06-08T12:00:00Z",
        text: "day1 prompt",
        toolCalls: [],
        rawRefs: [],
      },
      {
        role: "system",
        kind: "event",
        timestamp: "2026-06-08T12:01:00Z",
        text: "token_count",
        toolCalls: [],
        usage: { input_tokens: 60, output_tokens: 10, cache_read_input_tokens: 40, cache_creation_input_tokens: 0 },
        rawRefs: [],
      },
      {
        role: "user",
        kind: "message",
        timestamp: "2026-06-09T07:59:00Z",
        text: "day2 prompt",
        toolCalls: [],
        rawRefs: [],
      },
      {
        role: "system",
        kind: "event",
        timestamp: "2026-06-09T08:00:00Z",
        text: "token_count",
        toolCalls: [],
        usage: { input_tokens: 80, output_tokens: 30, cache_read_input_tokens: 120, cache_creation_input_tokens: 0 },
        rawRefs: [],
      },
    ],
  });

  const day2 = {
    since: new Date("2026-06-09T00:00:00Z"),
    until: new Date("2026-06-09T23:59:59.999Z"),
  };
  const day1 = {
    since: new Date("2026-06-08T00:00:00Z"),
    until: new Date("2026-06-08T23:59:59.999Z"),
  };

  test("只查第二天时包含跨天会话，且只计入当天的用量", () => {
    const result = filterSessions([crossDay], day2);
    expect(result).toHaveLength(1);
    expect(result[0]!.tokenBreakdown).toEqual({
      inputTokens: 80,
      outputTokens: 30,
      cacheReadTokens: 120,
      cacheWriteTokens: 0,
      total: 230,
    });
    expect(result[0]!.messageCount).toBe(1);
  });

  test("只查第一天时计入第一天的用量", () => {
    const result = filterSessions([crossDay], day1);
    expect(result).toHaveLength(1);
    expect(result[0]!.tokenBreakdown.total).toBe(110);
    expect(result[0]!.messageCount).toBe(1);
  });

  test("窗口覆盖全程时保留原始记录不裁剪", () => {
    const result = filterSessions([crossDay], {
      since: new Date("2026-06-08T00:00:00Z"),
      until: new Date("2026-06-09T23:59:59.999Z"),
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.tokenBreakdown.total).toBe(340);
    expect(result[0]!.messageCount).toBe(2);
    expect(result[0]).toBe(crossDay);
  });

  test("窗口外的会话被排除", () => {
    const result = filterSessions([crossDay], {
      since: new Date("2026-06-10T00:00:00Z"),
      until: new Date("2026-06-10T23:59:59.999Z"),
    });
    expect(result).toHaveLength(0);
  });

  test("无 usage 数据的会话回退为按开始时间取舍", () => {
    const noUsage = makeSession({
      sessionId: "no-usage",
      timestamp: "2026-06-08T12:00:00Z",
    });
    expect(filterSessions([noUsage], day1)).toHaveLength(1);
    expect(filterSessions([noUsage], day2)).toHaveLength(0);
  });
});
