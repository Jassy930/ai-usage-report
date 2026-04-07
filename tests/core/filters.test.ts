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
