import { expect, test } from "bun:test";
import { collectClaudeCodeSessions } from "../../src/adapters/claude-code";

test("collectClaudeCodeSessions merges summary data and token slices", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  expect(sessions.length).toBeGreaterThan(0);
  expect(sessions[0]?.tool).toBe("claude-code");
});

test("collectClaudeCodeSessions extracts token breakdown from JSONL", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  // sess-001 has JSONL data, should use JSONL tokens over facets
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  // Two assistant messages: 1500+2000 input, 800+1200 output, 250+300 cache read, 50+80 cache write
  expect(s1.tokenBreakdown.inputTokens).toBe(3500);
  expect(s1.tokenBreakdown.outputTokens).toBe(2000);
  expect(s1.tokenBreakdown.cacheReadTokens).toBe(550);
  expect(s1.tokenBreakdown.cacheWriteTokens).toBe(130);
  expect(s1.tokenBreakdown.total).toBe(3500 + 2000 + 550 + 130);
});

test("collectClaudeCodeSessions enriches with session-meta", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  expect(s1.summary).toBe("修复了登录Bug");
  expect(s1.goal).toBe("修复认证系统");
  expect(s1.conclusion).toBe("已完成");
  expect(s1.firstPrompt).toBe("帮我看一下登录的问题");
  expect(s1.projectPath).toBe("/Users/jassy/demo");
});

test("collectClaudeCodeSessions counts tool usage", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  // 1x Read in first assistant msg, 1x Edit + 1x Read in second
  expect(s1.toolUsage).toEqual({ Read: 2, Edit: 1 });
});

test("collectClaudeCodeSessions uses facets for sessions without JSONL", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  // sess-002 only exists in facets, no JSONL
  const s2 = sessions.find((s) => s.sessionId === "sess-002")!;
  expect(s2.tokenBreakdown.inputTokens).toBe(5000);
  expect(s2.tokenBreakdown.outputTokens).toBe(3000);
  expect(s2.model).toBe("claude-opus-4-6");
});

test("collectClaudeCodeSessions extracts message count and timestamp", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  // 1 human + 2 assistant = 3 messages
  expect(s1.messageCount).toBe(3);
  expect(s1.timestamp).toBe("2026-04-03T10:00:00.000Z");
});

test("collectClaudeCodeSessions returns empty for missing directory", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code-nonexistent",
  });
  expect(sessions).toHaveLength(0);
});
