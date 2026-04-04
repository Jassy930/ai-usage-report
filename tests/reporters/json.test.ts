import { describe, expect, test } from "bun:test";
import { renderJsonReport } from "../../src/reporters/json";
import type { UsageReport } from "../../src/core/report";

const sampleReport: UsageReport = {
  summary: {
    totalTokens: 15000,
    totalSessions: 3,
    totalMessages: 10,
    activeDays: 2,
    tokenBreakdown: {
      inputTokens: 5000,
      outputTokens: 8000,
      cacheReadTokens: 1500,
      cacheWriteTokens: 500,
      total: 15000,
    },
  },
  tools: [
    { tool: "claude-code", sessions: 2, tokens: 10000, messages: 7 },
    { tool: "codex", sessions: 1, tokens: 5000, messages: 3 },
  ],
  projects: [
    { project: "/home/user/project-a", sessions: 2, tokens: 12000, messages: 8 },
    { project: "/home/user/project-b", sessions: 1, tokens: 3000, messages: 2 },
  ],
  models: [
    { model: "claude-sonnet-4-20250514", sessions: 2, tokens: 10000, messages: 7 },
    { model: "o3", sessions: 1, tokens: 5000, messages: 3 },
  ],
  sessions: [
    {
      tool: "claude-code",
      sessionId: "sess-001",
      timestamp: "2025-06-01T10:00:00Z",
      projectPath: "/home/user/project-a",
      model: "claude-sonnet-4-20250514",
      messageCount: 4,
      firstPrompt: "Fix the bug",
      tokenBreakdown: {
        inputTokens: 3000,
        outputTokens: 4000,
        cacheReadTokens: 1000,
        cacheWriteTokens: 300,
        total: 8300,
      },
    },
    {
      tool: "claude-code",
      sessionId: "sess-002",
      timestamp: "2025-06-01T14:00:00Z",
      projectPath: "/home/user/project-a",
      model: "claude-sonnet-4-20250514",
      messageCount: 3,
      firstPrompt: "Add feature",
      tokenBreakdown: {
        inputTokens: 1000,
        outputTokens: 2000,
        cacheReadTokens: 500,
        cacheWriteTokens: 200,
        total: 3700,
      },
    },
    {
      tool: "codex",
      sessionId: "sess-003",
      timestamp: "2025-06-02T09:00:00Z",
      projectPath: "/home/user/project-b",
      model: "o3",
      messageCount: 3,
      tokenBreakdown: {
        inputTokens: 1000,
        outputTokens: 2000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        total: 3000,
      },
    },
  ],
};

describe("renderJsonReport", () => {
  test("outputs valid JSON with summary", () => {
    const json = renderJsonReport(sampleReport);
    const parsed = JSON.parse(json);
    expect(parsed.summary.totalTokens).toBe(15000);
  });

  test("uses 2-space indentation", () => {
    const json = renderJsonReport(sampleReport);
    // 2-space indent means second line starts with "  "
    const lines = json.split("\n");
    expect(lines[1]!.startsWith("  ")).toBe(true);
    // Should not be 4-space
    expect(lines[1]!.startsWith("    ")).toBe(false);
  });

  test("preserves all report fields", () => {
    const json = renderJsonReport(sampleReport);
    const parsed = JSON.parse(json);
    expect(parsed.summary.totalSessions).toBe(3);
    expect(parsed.summary.totalMessages).toBe(10);
    expect(parsed.summary.activeDays).toBe(2);
    expect(parsed.tools).toHaveLength(2);
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.models).toHaveLength(2);
    expect(parsed.sessions).toHaveLength(3);
  });

  test("includes tokenBreakdown in summary", () => {
    const json = renderJsonReport(sampleReport);
    const parsed = JSON.parse(json);
    expect(parsed.summary.tokenBreakdown.inputTokens).toBe(5000);
    expect(parsed.summary.tokenBreakdown.outputTokens).toBe(8000);
  });
});
