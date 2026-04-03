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
  // Two assistant messages: 150+200 input, 80+60 output, 30+50 cached
  expect(s.tokenBreakdown.inputTokens).toBe(350);
  expect(s.tokenBreakdown.outputTokens).toBe(140);
  expect(s.tokenBreakdown.cacheReadTokens).toBe(80);
  expect(s.tokenBreakdown.total).toBe(350 + 140);
});

test("collectCodexSessions extracts session metadata", async () => {
  const sessions = await collectCodexSessions({
    codexDir: "tests/fixtures/codex",
  });
  const s = sessions[0]!;
  expect(s.tool).toBe("codex");
  expect(s.sessionId).toBe("codex-abc123");
  expect(s.model).toBe("o4-mini");
  expect(s.projectPath).toBe("/Users/jassy/project");
  expect(s.timestamp).toBe("2026-04-03");
  // 2 assistant messages + 1 user message = 3 event_msg lines
  expect(s.messageCount).toBe(3);
});

test("collectCodexSessions returns empty for missing directory", async () => {
  const sessions = await collectCodexSessions({
    codexDir: "tests/fixtures/codex-nonexistent",
  });
  expect(sessions).toHaveLength(0);
});
