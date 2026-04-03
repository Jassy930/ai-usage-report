import { expect, test } from "bun:test";
import { collectCodexSessions } from "../../src/adapters/codex";

test("collectCodexSessions parses token usage from session jsonl", async () => {
  const sessions = await collectCodexSessions({
    codexDir: "tests/fixtures/codex",
  });
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.tokenBreakdown.total).toBeGreaterThan(0);
  expect(sessions[0]?.firstPrompt).toBe("帮我修一下测试");
});

test("collectCodexSessions extracts correct token breakdown", async () => {
  const sessions = await collectCodexSessions({
    codexDir: "tests/fixtures/codex",
  });
  const s = sessions[0]!;
  // 最终 token_count 快照: input=350, cached=80, output=140, total=490
  expect(s.tokenBreakdown.inputTokens).toBe(350);
  expect(s.tokenBreakdown.outputTokens).toBe(140);
  expect(s.tokenBreakdown.cacheReadTokens).toBe(80);
  expect(s.tokenBreakdown.total).toBe(490);
});

test("collectCodexSessions extracts session metadata", async () => {
  const sessions = await collectCodexSessions({
    codexDir: "tests/fixtures/codex",
  });
  const s = sessions[0]!;
  expect(s.tool).toBe("codex");
  expect(s.sessionId).toBe("codex-abc123");
  expect(s.projectPath).toBe("/Users/jassy/project");
  expect(s.timestamp).toBe("2026-04-03");
  // 1 user_message + 2 agent_message = 3 messages
  expect(s.messageCount).toBe(3);
});

test("collectCodexSessions returns empty for missing directory", async () => {
  const sessions = await collectCodexSessions({
    codexDir: "tests/fixtures/codex-nonexistent",
  });
  expect(sessions).toHaveLength(0);
});
