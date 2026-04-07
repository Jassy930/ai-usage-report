import { describe, expect, test } from "bun:test";
import { buildContextReport } from "../../src/core/context-builder";
import type { SessionRecord } from "../../src/core/types";

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    tool: "claude-code",
    sessionId: "s1",
    timestamp: "2026-04-03T10:00:00.000Z",
    messageCount: 1,
    tokenBreakdown: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      total: 2,
    },
    messages: [],
    rawRefs: [],
    ...overrides,
  };
}

describe("buildContextReport", () => {
  test("groups sessions by project path and sorts project labels", () => {
    const report = buildContextReport(
      [
        makeSession({ sessionId: "a", projectPath: "/Users/demo/z-app" }),
        makeSession({ sessionId: "b", projectPath: "/Users/demo/a-app" }),
      ],
      {
        generatedAt: "2026-04-07T12:00:00+08:00",
        since: "2026-03-31T12:00:00+08:00",
        until: "2026-04-07T12:00:00+08:00",
        sources: ["codex", "claude-code"],
        defaultTimezone: "Asia/Shanghai",
      },
    );

    expect(report.projects.map((project) => project.projectLabel)).toEqual([
      "a-app",
      "z-app",
    ]);
  });

  test("puts sessions without project path into ungroupedSessions", () => {
    const report = buildContextReport(
      [makeSession({ sessionId: "orphan", projectPath: undefined })],
      {
        generatedAt: "2026-04-07T12:00:00+08:00",
        since: "2026-03-31T12:00:00+08:00",
        until: "2026-04-07T12:00:00+08:00",
        sources: ["codex"],
        defaultTimezone: "Asia/Shanghai",
      },
    );

    expect(report.projects).toHaveLength(0);
    expect(report.ungroupedSessions).toHaveLength(1);
    expect(report.ungroupedSessions[0]?.sessionId).toBe("orphan");
  });
});
