import { expect, test } from "bun:test";
import { collectClaudeCodeSessions } from "../../src/adapters/claude-code";

test("collectClaudeCodeSessions merges data sources", async () => {
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
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  // Two assistant messages: 1500+2000 input, 800+1200 output, 250+300 cache read, 50+80 cache write
  expect(s1.tokenBreakdown.inputTokens).toBe(3500);
  expect(s1.tokenBreakdown.outputTokens).toBe(2000);
  expect(s1.tokenBreakdown.cacheReadTokens).toBe(550);
  expect(s1.tokenBreakdown.cacheWriteTokens).toBe(130);
  expect(s1.tokenBreakdown.total).toBe(3500 + 2000 + 550 + 130);
});

test("collectClaudeCodeSessions enriches with session-meta and facets", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  // summary/goal from facets
  expect(s1.summary).toBe("修复了登录Bug");
  expect(s1.goal).toBe("修复认证系统");
  expect(s1.outcome).toBe("achieved");
  // firstPrompt/projectPath from session-meta
  expect(s1.firstPrompt).toBe("帮我看一下登录的问题");
  expect(s1.projectPath).toBe("/Users/demo/myapp");
});

test("collectClaudeCodeSessions counts tool usage from JSONL", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  expect(s1.toolUsage).toEqual({ Read: 2, Edit: 1 });
});

test("collectClaudeCodeSessions extracts model from JSONL", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  expect(s1.model).toBe("claude-sonnet-4-6");
});

test("collectClaudeCodeSessions extracts message count and timestamp", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  // 1 user + 2 assistant = 3 messages from JSONL
  expect(s1.messageCount).toBe(3);
  expect(s1.timestamp).toBe("2026-04-03T10:00:00.000Z");
});

test("collectClaudeCodeSessions preserves messages and raw refs", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code",
  });
  const s1 = sessions.find((s) => s.sessionId === "sess-001")!;
  expect(s1.messages).toHaveLength(3);
  expect(s1.messages[0]?.role).toBe("user");
  expect(s1.messages[0]?.text).toBe("帮我看一下登录的问题");
  expect(s1.messages[1]?.toolCalls).toEqual([{ name: "Read", id: "t1" }]);
  expect(s1.messages[1]?.usage?.input_tokens).toBe(1500);
  expect(s1.messages[2]?.rawRefs[0]?.filePath).toContain("/tests/fixtures/claude-code/projects/");
  expect(s1.rawRefs.some((ref) => ref.jsonPointer === "/brief_summary")).toBe(true);
});

test("collectClaudeCodeSessions returns empty for missing directory", async () => {
  const sessions = await collectClaudeCodeSessions({
    claudeDir: "tests/fixtures/claude-code-nonexistent",
  });
  expect(sessions).toHaveLength(0);
});
