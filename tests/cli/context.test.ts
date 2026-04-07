import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../src/cli/main";

const FIXTURES = join(import.meta.dir, "../fixtures");

function rootArgs(): string[] {
  return [
    `--codex-dir=${join(FIXTURES, "codex")}`,
    `--claude-dir=${join(FIXTURES, "claude-code")}`,
  ];
}

describe("context command", () => {
  test("defaults to json output", async () => {
    const result = await runCli(["context", "all", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed).toHaveProperty("meta");
    expect(parsed).toHaveProperty("projects");
  });

  test("supports markdown output", async () => {
    const result = await runCli(["context", "all", "--format", "md", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("# Context Export");
    expect(result.output).toContain("## Projects");
  });

  test("defaults to trailing 7 day window", async () => {
    const result = await runCli(["context", "all", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed.meta.since).toBeDefined();
    expect(parsed.meta.until).toBeDefined();
  });
});
