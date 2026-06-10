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
  // 逐条累加 last_token_usage: input=(150-30)+(200-50)=270, cached=30+50=80, output=80+60=140, total=230+260=490
  // inputTokens 为非缓存输入（与 claude-code 口径一致）
  expect(s.tokenBreakdown.inputTokens).toBe(270);
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

test("collectCodexSessions preserves messages, events and raw refs", async () => {
  const sessions = await collectCodexSessions({
    codexDir: "tests/fixtures/codex",
  });
  const s = sessions[0]!;
  expect(s.messages.length).toBeGreaterThanOrEqual(5);
  expect(s.messages.find((m) => m.role === "user")?.text).toBe("帮我修一下测试");
  expect(s.messages.find((m) => m.kind === "event" && m.text === "task_complete")).toBeDefined();
  expect(s.messages[0]?.rawRefs[0]?.filePath).toContain("/tests/fixtures/codex/sessions/");
  expect(s.rawRefs.some((ref) => ref.filePath.endsWith("/tests/fixtures/codex/history.jsonl"))).toBe(true);
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
    // 旧格式无 last_token_usage，回退最终累计快照；inputTokens 为非缓存输入 100-20=80
    expect(parsed.tokenBreakdown.inputTokens).toBe(80);
    expect(parsed.tokenBreakdown.outputTokens).toBe(50);
    expect(parsed.tokenBreakdown.cacheReadTokens).toBe(20);
    expect(parsed.tokenBreakdown.total).toBe(200);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("parseSessionFile accumulates last_token_usage per request and attaches usage to messages", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "codex-parser-"));
  const sessionFile = join(tempDir, "session.jsonl");

  try {
    await Bun.write(
      sessionFile,
      [
        JSON.stringify({
          timestamp: "2026-06-08T10:00:00Z",
          type: "session_meta",
          payload: { id: "codex-cross-day", timestamp: "2026-06-08T10:00:00Z", cwd: "/tmp/project" },
        }),
        // 第一天的请求
        JSON.stringify({
          timestamp: "2026-06-08T10:01:00Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 10, total_tokens: 110 },
              last_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 10, total_tokens: 110 },
            },
          },
        }),
        // 第二天的请求（最终累计快照故意小于逐条之和，模拟 compaction）
        JSON.stringify({
          timestamp: "2026-06-09T08:00:00Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: { input_tokens: 150, cached_input_tokens: 60, output_tokens: 25, total_tokens: 175 },
              last_token_usage: { input_tokens: 200, cached_input_tokens: 120, output_tokens: 30, total_tokens: 230 },
            },
          },
        }),
      ].join("\n"),
    );

    const parsed = await parseSessionFile(sessionFile);
    // 逐条累加而非取最终快照: input=(100-40)+(200-120)=140, cached=40+120=160, output=10+30=40, total=110+230=340
    expect(parsed.tokenBreakdown.inputTokens).toBe(140);
    expect(parsed.tokenBreakdown.cacheReadTokens).toBe(160);
    expect(parsed.tokenBreakdown.outputTokens).toBe(40);
    expect(parsed.tokenBreakdown.total).toBe(340);

    // token_count 消息携带 per-request usage，供时间窗口裁剪使用
    const usageMsgs = parsed.messages.filter((m) => m.usage);
    expect(usageMsgs).toHaveLength(2);
    expect(usageMsgs[0]?.usage).toEqual({
      input_tokens: 60,
      output_tokens: 10,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 0,
    });
    expect(usageMsgs[1]?.timestamp).toBe("2026-06-09T08:00:00Z");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
