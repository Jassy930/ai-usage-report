import { describe, test, expect } from "bun:test";
import { parseArgs } from "../../src/cli/args";

describe("parseArgs", () => {
  test("空参数返回默认值", () => {
    const args = parseArgs([]);
    expect(args.command).toBeNull();
    expect(args.tool).toBe("all");
    expect(args.format).toBe("terminal");
    expect(args.help).toBe(false);
  });

  test("--help 标志", () => {
    const args = parseArgs(["--help"]);
    expect(args.help).toBe(true);
  });

  test("-h 短标志", () => {
    const args = parseArgs(["-h"]);
    expect(args.help).toBe(true);
  });

  test("report 命令 + 工具选择", () => {
    const args = parseArgs(["report", "codex"]);
    expect(args.command).toBe("report");
    expect(args.tool).toBe("codex");
  });

  test("sessions 命令 + claude-code", () => {
    const args = parseArgs(["sessions", "claude-code"]);
    expect(args.command).toBe("sessions");
    expect(args.tool).toBe("claude-code");
  });

  test("--format json 选项", () => {
    const args = parseArgs(["report", "all", "--format", "json"]);
    expect(args.format).toBe("json");
  });

  test("--since=7d 等号形式", () => {
    const args = parseArgs(["report", "--since=7d"]);
    expect(args.since).toBe("7d");
  });

  test("--since 7d 空格形式", () => {
    const args = parseArgs(["report", "--since", "7d"]);
    expect(args.since).toBe("7d");
  });

  test("--limit 10", () => {
    const args = parseArgs(["sessions", "--limit", "10"]);
    expect(args.limit).toBe(10);
  });

  test("未知命令设置 unknownCommand", () => {
    const args = parseArgs(["unknown"]);
    expect(args.command).toBeNull();
    expect(args.unknownCommand).toBe("unknown");
  });

  test("短标志 -f json -s 7d", () => {
    const args = parseArgs(["report", "-f", "json", "-s", "7d"]);
    expect(args.format).toBe("json");
    expect(args.since).toBe("7d");
  });

  test("--project 和 --model 过滤", () => {
    const args = parseArgs(["report", "--project", "myapp", "--model", "gpt"]);
    expect(args.project).toBe("myapp");
    expect(args.model).toBe("gpt");
  });

  test("--out 输出路径", () => {
    const args = parseArgs(["report", "--out", "output.json"]);
    expect(args.out).toBe("output.json");
  });

  test("--codex-dir 和 --claude-dir", () => {
    const args = parseArgs(["report", "--codex-dir", "/tmp/codex", "--claude-dir", "/tmp/claude"]);
    expect(args.codexDir).toBe("/tmp/codex");
    expect(args.claudeDir).toBe("/tmp/claude");
  });

  test("projects 命令", () => {
    const args = parseArgs(["projects", "all", "--format", "md"]);
    expect(args.command).toBe("projects");
    expect(args.format).toBe("md");
  });

  test("context 命令默认输出 json", () => {
    const args = parseArgs(["context", "all"]);
    expect(args.command).toBe("context");
    expect(args.tool).toBe("all");
    expect(args.format).toBe("json");
  });

  test("context 支持 until 参数", () => {
    const args = parseArgs([
      "context",
      "claude-code",
      "--since",
      "2026-04-01",
      "--until",
      "2026-04-07",
    ]);
    expect(args.command).toBe("context");
    expect(args.tool).toBe("claude-code");
    expect(args.since).toBe("2026-04-01");
    expect(args.until).toBe("2026-04-07");
  });

  test("无效 format 保持默认", () => {
    const args = parseArgs(["report", "--format", "invalid"]);
    expect(args.format).toBe("terminal");
  });
});
