import { expect, test, describe } from "bun:test";
import { runCli } from "../../src/cli/main";
import { join } from "node:path";

const FIXTURES = join(import.meta.dir, "../fixtures");
const ROOTS = `--codex-dir=${join(FIXTURES, "codex")} --claude-dir=${join(FIXTURES, "claude-code")}`;

function rootArgs(): string[] {
  return [
    `--codex-dir=${join(FIXTURES, "codex")}`,
    `--claude-dir=${join(FIXTURES, "claude-code")}`,
  ];
}

describe("report command", () => {
  test("report all returns exit 0 with terminal format by default", async () => {
    const result = await runCli(["report", "all", ...rootArgs()]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("AI");
  });

  test("report codex --format md returns markdown", async () => {
    const result = await runCli([
      "report",
      "codex",
      "--format",
      "md",
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("# AI Usage Report");
  });

  test("report claude-code --format json returns valid JSON", async () => {
    const result = await runCli([
      "report",
      "claude-code",
      "--format",
      "json",
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("sessions");
  });

  test("report with --since filters data", async () => {
    const result = await runCli([
      "report",
      "all",
      "--since",
      "7d",
      "--format",
      "json",
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed.summary).toBeDefined();
  });

  test("report with --out writes to file", async () => {
    const tmpFile = join(import.meta.dir, "../.tmp-report-out.json");
    const result = await runCli([
      "report",
      "all",
      "--format",
      "json",
      "--out",
      tmpFile,
      ...rootArgs(),
    ]);
    expect(result.exitCode).toBe(0);
    // file should exist
    const file = Bun.file(tmpFile);
    const content = await file.text();
    expect(content.length).toBeGreaterThan(0);
    // cleanup
    await Bun.write(tmpFile, ""); // will be cleaned by OS or next run
    const { unlinkSync } = await import("node:fs");
    try { unlinkSync(tmpFile); } catch {}
  });

  test("unknown command returns exit 1", async () => {
    const result = await runCli(["unknown-cmd"]);
    expect(result.exitCode).toBe(1);
  });

  test("no command shows help and exit 0", async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("usage");
  });
});
