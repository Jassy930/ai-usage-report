import { expect, test, describe } from "bun:test";
import { runCli } from "../../src/cli/main";
import { join } from "node:path";

const FIXTURES = join(import.meta.dir, "../fixtures");

function rootArgs(): string[] {
  return [
    `--codex-dir=${join(FIXTURES, "codex")}`,
    `--claude-dir=${join(FIXTURES, "claude-code")}`,
  ];
}

describe("sessions command", () => {
  test("sessions lists session records", async () => {
    const result = await runCli(["sessions", "all", "--format", "json", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  test("sessions with --limit restricts count", async () => {
    const result = await runCli([
      "sessions",
      "all",
      "--format",
      "json",
      "--limit",
      "1",
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed.length).toBeLessThanOrEqual(1);
  });

  test("sessions respects --until (回归: until 必须传入 collect)", async () => {
    // 固件会话发生在 2026-04-03，until 截止到 04-02 应排除它
    const excluded = await runCli([
      "sessions", "codex", "--format", "json",
      "--until", "2026-04-02",
      ...rootArgs(),
    ]);
    expect(excluded.exitCode).toBe(0);
    expect(JSON.parse(excluded.output)).toHaveLength(0);

    const included = await runCli([
      "sessions", "codex", "--format", "json",
      "--until", "2026-04-03",
      ...rootArgs(),
    ]);
    expect(included.exitCode).toBe(0);
    expect(JSON.parse(included.output)).toHaveLength(1);
  });

  test("sessions codex filters to codex only", async () => {
    const result = await runCli([
      "sessions",
      "codex",
      "--format",
      "json",
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    for (const s of parsed) {
      expect(s.tool).toBe("codex");
    }
  });
});

describe("projects command", () => {
  test("projects lists project summaries", async () => {
    const result = await runCli(["projects", "all", "--format", "json", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty("project");
      expect(parsed[0]).toHaveProperty("sessions");
      expect(parsed[0]).toHaveProperty("tokens");
    }
  });
});
