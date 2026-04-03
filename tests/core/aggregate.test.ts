import { describe, expect, test } from "bun:test";
import { buildUsageReport } from "../../src/core/report";
import type { SessionRecord } from "../../src/core/types";

const makeSession = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
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
  ...overrides,
});

describe("buildUsageReport", () => {
  test("空会话列表返回零值报告", () => {
    const report = buildUsageReport([]);
    expect(report.summary.totalTokens).toBe(0);
    expect(report.summary.totalSessions).toBe(0);
    expect(report.summary.totalMessages).toBe(0);
    expect(report.summary.activeDays).toBe(0);
    expect(report.tools).toEqual([]);
    expect(report.projects).toEqual([]);
    expect(report.models).toEqual([]);
    expect(report.sessions).toEqual([]);
  });

  test("单条会话正确汇总", () => {
    const report = buildUsageReport([makeSession()]);
    expect(report.summary.totalTokens).toBe(15);
    expect(report.summary.totalSessions).toBe(1);
    expect(report.summary.totalMessages).toBe(1);
    expect(report.summary.activeDays).toBe(1);
    expect(report.summary.tokenBreakdown).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      total: 15,
    });
  });

  test("多条会话汇总 totalTokens", () => {
    const sessions = [
      makeSession({ sessionId: "s1", messageCount: 2, tokenBreakdown: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, total: 15 } }),
      makeSession({ sessionId: "s2", messageCount: 3, tokenBreakdown: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 2, total: 37 } }),
    ];
    const report = buildUsageReport(sessions);
    expect(report.summary.totalTokens).toBe(52);
    expect(report.summary.totalSessions).toBe(2);
    expect(report.summary.totalMessages).toBe(5);
    expect(report.summary.tokenBreakdown.inputTokens).toBe(30);
    expect(report.summary.tokenBreakdown.outputTokens).toBe(15);
    expect(report.summary.tokenBreakdown.cacheReadTokens).toBe(5);
    expect(report.summary.tokenBreakdown.cacheWriteTokens).toBe(2);
  });

  test("按 tool 分组汇总", () => {
    const sessions = [
      makeSession({ tool: "codex", sessionId: "s1", messageCount: 2 }),
      makeSession({ tool: "claude-code", sessionId: "s2", messageCount: 3 }),
      makeSession({ tool: "codex", sessionId: "s3", messageCount: 1 }),
    ];
    const report = buildUsageReport(sessions);
    expect(report.tools).toHaveLength(2);
    const codex = report.tools.find((t) => t.tool === "codex");
    expect(codex?.sessions).toBe(2);
    expect(codex?.messages).toBe(3);
    expect(codex?.tokens).toBe(30);
    const claude = report.tools.find((t) => t.tool === "claude-code");
    expect(claude?.sessions).toBe(1);
    expect(claude?.messages).toBe(3);
  });

  test("按 project 分组汇总（使用 projectPath）", () => {
    const sessions = [
      makeSession({ sessionId: "s1", projectPath: "/app/frontend" }),
      makeSession({ sessionId: "s2", projectPath: "/app/backend" }),
      makeSession({ sessionId: "s3", projectPath: "/app/frontend" }),
      makeSession({ sessionId: "s4" }), // 无 projectPath
    ];
    const report = buildUsageReport(sessions);
    // 无 projectPath 的归入 "unknown"
    expect(report.projects).toHaveLength(3);
    const frontend = report.projects.find((p) => p.project === "/app/frontend");
    expect(frontend?.sessions).toBe(2);
    const unknown = report.projects.find((p) => p.project === "unknown");
    expect(unknown?.sessions).toBe(1);
  });

  test("按 model 分组汇总", () => {
    const sessions = [
      makeSession({ sessionId: "s1", model: "gpt-4" }),
      makeSession({ sessionId: "s2", model: "claude-3" }),
      makeSession({ sessionId: "s3", model: "gpt-4" }),
      makeSession({ sessionId: "s4" }), // 无 model
    ];
    const report = buildUsageReport(sessions);
    expect(report.models).toHaveLength(3);
    const gpt4 = report.models.find((m) => m.model === "gpt-4");
    expect(gpt4?.sessions).toBe(2);
    const unknown = report.models.find((m) => m.model === "unknown");
    expect(unknown?.sessions).toBe(1);
  });

  test("sessions 按 token 降序排列", () => {
    const sessions = [
      makeSession({ sessionId: "s1", tokenBreakdown: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, total: 10 } }),
      makeSession({ sessionId: "s2", tokenBreakdown: { inputTokens: 50, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, total: 100 } }),
      makeSession({ sessionId: "s3", tokenBreakdown: { inputTokens: 25, outputTokens: 25, cacheReadTokens: 0, cacheWriteTokens: 0, total: 50 } }),
    ];
    const report = buildUsageReport(sessions);
    expect(report.sessions[0].sessionId).toBe("s2");
    expect(report.sessions[1].sessionId).toBe("s3");
    expect(report.sessions[2].sessionId).toBe("s1");
  });

  test("activeDays 统计不同日期数", () => {
    const sessions = [
      makeSession({ sessionId: "s1", timestamp: "2026-04-01T10:00:00.000Z" }),
      makeSession({ sessionId: "s2", timestamp: "2026-04-01T15:00:00.000Z" }),
      makeSession({ sessionId: "s3", timestamp: "2026-04-02T10:00:00.000Z" }),
      makeSession({ sessionId: "s4", timestamp: "2026-04-03T10:00:00.000Z" }),
    ];
    const report = buildUsageReport(sessions);
    expect(report.summary.activeDays).toBe(3);
  });
});
