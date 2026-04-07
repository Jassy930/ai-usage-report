import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectCodexSessions } from "../../src/adapters/codex";
import { parseSessionFile } from "../../src/adapters/codex/parser";

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
  // 最终 token_count 快照使用上游提供的 canonical total_tokens=490。
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
  expect(s.projectPath).toBe("/Users/demo/project");
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

test("parseSessionFile preserves canonical total_tokens from token_count", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "codex-parser-"));
  const sessionFile = join(tempDir, "session.jsonl");

  try {
    await Bun.write(
      sessionFile,
      [
        JSON.stringify({
          timestamp: "2026-04-07T10:00:00Z",
          type: "session_meta",
          payload: {
            id: "codex-reasoning",
            timestamp: "2026-04-07T10:00:00Z",
            cwd: "/tmp/project",
          },
        }),
        JSON.stringify({
          timestamp: "2026-04-07T10:01:00Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 20,
                output_tokens: 50,
                reasoning_output_tokens: 30,
                total_tokens: 200,
              },
            },
          },
        }),
      ].join("\n"),
    );

    const parsed = await parseSessionFile(sessionFile);
    expect(parsed.tokenBreakdown.inputTokens).toBe(100);
    expect(parsed.tokenBreakdown.outputTokens).toBe(50);
    expect(parsed.tokenBreakdown.cacheReadTokens).toBe(20);
    expect(parsed.tokenBreakdown.total).toBe(200);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
