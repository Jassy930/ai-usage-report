/**
 * 端到端 fixture 测试 — 通过 runCli 验证各命令 + 格式组合
 */

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

describe("E2E fixture tests", () => {
  // ---- report ----

  test("report codex with terminal format", async () => {
    const result = await runCli(["report", "codex", "--format", "terminal", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    expect(result.output.length).toBeGreaterThan(0);
  });

  test("report claude-code with terminal format", async () => {
    const result = await runCli(["report", "claude-code", "--format", "terminal", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    expect(result.output.length).toBeGreaterThan(0);
  });

  test("report all --format json returns parseable JSON", async () => {
    const result = await runCli(["report", "all", "--format", "json", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("sessions");
  });

  test("report all --format md contains expected headings", async () => {
    const result = await runCli(["report", "all", "--format", "md", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("# ");
    expect(result.output).toContain("## ");
  });

  // ---- sessions ----

  test("sessions codex --format json returns valid JSON array", async () => {
    const result = await runCli(["sessions", "codex", "--format", "json", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(Array.isArray(parsed)).toBe(true);
  });

  // ---- projects ----

  test("projects all --format terminal contains project info", async () => {
    const result = await runCli(["projects", "all", "--format", "terminal", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    expect(result.output.length).toBeGreaterThan(0);
  });
});
