import { describe, expect, test } from "bun:test";
import { renderTerminalReport } from "../../src/reporters/terminal";
import type { UsageReport } from "../../src/core/report";
import type { SessionRecord } from "../../src/core/types";

const makeSession = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  tool: "codex",
  sessionId: "s1",
  timestamp: "2026-04-03T10:00:00.000Z",
  projectPath: "/home/user/project",
  model: "gpt-4",
  messageCount: 5,
  firstPrompt: "Fix the login bug",
  tokenBreakdown: {
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheWriteTokens: 100,
    total: 1800,
  },
  messages: [],
  rawRefs: [],
  ...overrides,
});

const sampleReport: UsageReport = {
  summary: {
    totalTokens: 125000,
    totalSessions: 12,
    totalMessages: 48,
    activeDays: 3,
    tokenBreakdown: {
      inputTokens: 60000,
      outputTokens: 40000,
      cacheReadTokens: 15000,
      cacheWriteTokens: 10000,
      total: 125000,
    },
  },
  tools: [
    { tool: "codex", sessions: 8, tokens: 80000, messages: 30 },
    { tool: "claude-code", sessions: 4, tokens: 45000, messages: 18 },
  ],
  projects: [
    { project: "/home/user/project-a", sessions: 7, tokens: 70000, messages: 28 },
    { project: "/home/user/project-b", sessions: 5, tokens: 55000, messages: 20 },
  ],
  models: [
    { model: "gpt-4", sessions: 6, tokens: 65000, messages: 24 },
    { model: "claude-3", sessions: 6, tokens: 60000, messages: 24 },
  ],
  sessions: [
    makeSession({ sessionId: "s1", tokenBreakdown: { inputTokens: 30000, outputTokens: 20000, cacheReadTokens: 5000, cacheWriteTokens: 3000, total: 58000 }, messageCount: 10, firstPrompt: "Refactor the auth module" }),
    makeSession({ sessionId: "s2", tool: "claude-code", model: "claude-3", tokenBreakdown: { inputTokens: 20000, outputTokens: 15000, cacheReadTokens: 5000, cacheWriteTokens: 2000, total: 42000 }, messageCount: 8, firstPrompt: "Add unit tests for payment" }),
    makeSession({ sessionId: "s3", tokenBreakdown: { inputTokens: 10000, outputTokens: 5000, cacheReadTokens: 3000, cacheWriteTokens: 2000, total: 20000 }, messageCount: 6, firstPrompt: "Debug the CI pipeline" }),
  ],
};

describe("renderTerminalReport", () => {
  test("包含 TOTAL TOKENS 概览", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("TOTAL TOKENS")).toBe(true);
  });

  test("包含总 token 数（千分位格式）", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("125,000")).toBe(true);
  });

  test("包含会话数和消息数", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("12")).toBe(true);
    expect(text.includes("48")).toBe(true);
  });

  test("包含活跃天数", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("3")).toBe(true);
  });

  test("包含 token 明细", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("60,000")).toBe(true);  // inputTokens
    expect(text.includes("40,000")).toBe(true);  // outputTokens
    expect(text.includes("15,000")).toBe(true);  // cacheReadTokens
    expect(text.includes("10,000")).toBe(true);  // cacheWriteTokens
  });

  test("包含工具维度", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("codex")).toBe(true);
    expect(text.includes("claude-code")).toBe(true);
  });

  test("包含项目维度", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("project-a")).toBe(true);
    expect(text.includes("project-b")).toBe(true);
  });

  test("包含模型维度", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("gpt-4")).toBe(true);
    expect(text.includes("claude-3")).toBe(true);
  });

  test("包含 Top Sessions", () => {
    const text = renderTerminalReport(sampleReport);
    expect(text.includes("Refactor the auth module")).toBe(true);
    expect(text.includes("58.0K")).toBe(true);
  });

  test("空数据有清晰提示", () => {
    const emptyReport: UsageReport = {
      summary: {
        totalTokens: 0,
        totalSessions: 0,
        totalMessages: 0,
        activeDays: 0,
        tokenBreakdown: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, total: 0 },
      },
      tools: [],
      projects: [],
      models: [],
      sessions: [],
    };
    const text = renderTerminalReport(emptyReport);
    expect(text.includes("无数据")).toBe(true);
  });

  test("返回类型为字符串", () => {
    const text = renderTerminalReport(sampleReport);
    expect(typeof text).toBe("string");
  });
});
