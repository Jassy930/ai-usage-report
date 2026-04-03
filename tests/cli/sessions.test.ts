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
