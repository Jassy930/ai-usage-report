import { expect, test, describe } from "bun:test";
import type { SessionRecord } from "../../src/core/types";
import {
  collectAllSessions,
  compareSessionsByTimestampDesc,
} from "../../src/core/collect";

describe("collectAllSessions", () => {
  test("respects tool filter — codex only", async () => {
    const sessions = await collectAllSessions({
      tools: ["codex"],
      roots: { codexDir: "tests/fixtures/codex" },
    });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.tool === "codex")).toBe(true);
  });

  test("respects tool filter — claude-code only", async () => {
    const sessions = await collectAllSessions({
      tools: ["claude-code"],
      roots: { claudeDir: "tests/fixtures/claude-code" },
    });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.tool === "claude-code")).toBe(true);
  });

  test("collects from all tools when tools is empty or omitted", async () => {
    const sessions = await collectAllSessions({
      roots: {
        codexDir: "tests/fixtures/codex",
        claudeDir: "tests/fixtures/claude-code",
      },
    });
    expect(sessions.length).toBeGreaterThan(0);
  });

  test("returns sessions sorted by timestamp descending", async () => {
    const sessions = await collectAllSessions({
      roots: {
        codexDir: "tests/fixtures/codex",
        claudeDir: "tests/fixtures/claude-code",
      },
    });
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i - 1]!.timestamp >= sessions[i]!.timestamp).toBe(true);
    }
  });

  test("applies since filter via string spec", async () => {
    const sessions = await collectAllSessions({
      tools: ["codex"],
      roots: { codexDir: "tests/fixtures/codex" },
      since: "1y",
    });
    const oneYearAgo = new Date();
    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
    oneYearAgo.setUTCHours(0, 0, 0, 0);
    for (const s of sessions) {
      expect(new Date(s.timestamp) >= oneYearAgo).toBe(true);
    }
  });

  test("applies project filter", async () => {
    const sessions = await collectAllSessions({
      tools: ["claude-code"],
      roots: { claudeDir: "tests/fixtures/claude-code" },
      project: "demo",
    });
    for (const s of sessions) {
      expect(s.projectPath?.toLowerCase()).toContain("demo");
    }
  });

  test("compareSessionsByTimestampDesc sorts ISO timestamps by actual time", () => {
    const earlier: SessionRecord = {
      tool: "codex",
      sessionId: "earlier",
      timestamp: "2026-04-03T10:00:00+08:00",
      messageCount: 0,
      tokenBreakdown: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        total: 0,
      },
    };
    const later: SessionRecord = {
      tool: "codex",
      sessionId: "later",
      timestamp: "2026-04-03T03:00:00Z",
      messageCount: 0,
      tokenBreakdown: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        total: 0,
      },
    };

    const sorted = [earlier, later].sort(compareSessionsByTimestampDesc);
    expect(sorted.map((session) => session.sessionId)).toEqual(["later", "earlier"]);
  });
});
