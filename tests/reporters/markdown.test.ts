import { describe, expect, test } from "bun:test";
import { renderMarkdownReport } from "../../src/reporters/markdown";
import type { UsageReport } from "../../src/core/report";

const sampleReport: UsageReport = {
  summary: {
    totalTokens: 1500000,
    totalSessions: 3,
    totalMessages: 10,
    activeDays: 2,
    tokenBreakdown: {
      inputTokens: 500000,
      outputTokens: 800000,
      cacheReadTokens: 150000,
      cacheWriteTokens: 50000,
      total: 1500000,
    },
  },
  tools: [
    { tool: "claude-code", sessions: 2, tokens: 1000000, messages: 7 },
    { tool: "codex", sessions: 1, tokens: 500000, messages: 3 },
  ],
  projects: [
    { project: "/home/user/project-a", sessions: 2, tokens: 1200000, messages: 8 },
    { project: "/home/user/project-b", sessions: 1, tokens: 300000, messages: 2 },
  ],
  models: [
    { model: "claude-sonnet-4-20250514", sessions: 2, tokens: 1000000, messages: 7 },
    { model: "o3", sessions: 1, tokens: 500000, messages: 3 },
  ],
  sessions: [
    {
      tool: "claude-code",
      sessionId: "sess-001",
      timestamp: "2025-06-01T10:00:00Z",
      projectPath: "/home/user/project-a",
      model: "claude-sonnet-4-20250514",
      messageCount: 4,
      firstPrompt: "Fix the bug in auth module",
      tokenBreakdown: {
        inputTokens: 300000,
        outputTokens: 400000,
        cacheReadTokens: 100000,
        cacheWriteTokens: 30000,
        total: 830000,
      },
    },
    {
      tool: "claude-code",
      sessionId: "sess-002",
      timestamp: "2025-06-01T14:00:00Z",
      projectPath: "/home/user/project-a",
      model: "claude-sonnet-4-20250514",
      messageCount: 3,
      firstPrompt: "Add feature for dark mode",
      tokenBreakdown: {
        inputTokens: 100000,
        outputTokens: 200000,
        cacheReadTokens: 50000,
        cacheWriteTokens: 20000,
        total: 370000,
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
        inputTokens: 100000,
        outputTokens: 200000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        total: 300000,
      },
    },
  ],
};

describe("renderMarkdownReport", () => {
  test("includes summary heading", () => {
    const md = renderMarkdownReport(sampleReport);
    expect(md.includes("# AI Usage Report")).toBe(true);
  });

  test("includes summary statistics", () => {
    const md = renderMarkdownReport(sampleReport);
    expect(md.includes("1,500,000")).toBe(true); // totalTokens formatted
    expect(md.includes("3")).toBe(true); // sessions
    expect(md.includes("10")).toBe(true); // messages
  });

  test("includes tools section", () => {
    const md = renderMarkdownReport(sampleReport);
    expect(md.includes("claude-code")).toBe(true);
    expect(md.includes("codex")).toBe(true);
  });

  test("includes projects section", () => {
    const md = renderMarkdownReport(sampleReport);
    expect(md.includes("project-a")).toBe(true);
    expect(md.includes("project-b")).toBe(true);
  });

  test("includes models section", () => {
    const md = renderMarkdownReport(sampleReport);
    expect(md.includes("claude-sonnet-4-20250514")).toBe(true);
    expect(md.includes("o3")).toBe(true);
  });

  test("includes top sessions", () => {
    const md = renderMarkdownReport(sampleReport);
    expect(md.includes("sess-001")).toBe(true);
    expect(md.includes("Fix the bug")).toBe(true);
  });

  test("formats large numbers with human-readable units", () => {
    const md = renderMarkdownReport(sampleReport);
    // 1,000,000 tokens should show human-readable format
    expect(md.includes("1.0M")).toBe(true);
  });

  test("includes token breakdown", () => {
    const md = renderMarkdownReport(sampleReport);
    expect(md.includes("500,000 (500.0K)")).toBe(true); // inputTokens
    expect(md.includes("800,000 (800.0K)")).toBe(true); // outputTokens
  });
});
