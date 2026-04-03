/**
 * CLI 参数解析 — 手动解析，无外部依赖
 */

import type { ToolType } from "../core/types";

export type FormatType = "terminal" | "json" | "md";
export type SubCommand = "report" | "sessions" | "projects";

export interface ParsedArgs {
  command: SubCommand | null;
  tool: ToolType | "all";
  format: FormatType;
  since?: string;
  limit?: number;
  project?: string;
  model?: string;
  out?: string;
  codexDir?: string;
  claudeDir?: string;
  help: boolean;
}

/**
 * 解析 CLI 参数数组
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    tool: "all",
    format: "terminal",
    help: false,
  };

  const positional: string[] = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      i++;
      continue;
    }

    // --key=value 形式
    if (arg.startsWith("--") && arg.includes("=")) {
      const eqIdx = arg.indexOf("=");
      const key = arg.slice(2, eqIdx);
      const val = arg.slice(eqIdx + 1);
      setOption(result, key, val);
      i++;
      continue;
    }

    // --key value 形式
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        setOption(result, key, next);
        i += 2;
      } else {
        // 布尔 flag
        setOption(result, key, "true");
        i++;
      }
      continue;
    }

    // 短标志
    if (arg.startsWith("-") && arg.length === 2) {
      const flag = arg[1];
      if (flag === "h") {
        result.help = true;
        i++;
        continue;
      }
      // -f, -s, -l 等缩写
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        const keyMap: Record<string, string> = {
          f: "format",
          s: "since",
          l: "limit",
          p: "project",
          m: "model",
          o: "out",
        };
        if (keyMap[flag]) {
          setOption(result, keyMap[flag], next);
          i += 2;
          continue;
        }
      }
      i++;
      continue;
    }

    positional.push(arg);
    i++;
  }

  // 位置参数: command [tool]
  if (positional.length >= 1) {
    const cmd = positional[0];
    if (cmd === "report" || cmd === "sessions" || cmd === "projects") {
      result.command = cmd;
    } else {
      // 未知命令，保持 null 让调用方处理
      result.command = cmd as SubCommand;
    }
  }

  if (positional.length >= 2) {
    const t = positional[1];
    if (t === "codex" || t === "claude-code" || t === "all") {
      result.tool = t;
    }
  }

  return result;
}

function setOption(result: ParsedArgs, key: string, value: string): void {
  switch (key) {
    case "format":
      if (value === "terminal" || value === "json" || value === "md") {
        result.format = value;
      }
      break;
    case "since":
      result.since = value;
      break;
    case "limit":
      result.limit = parseInt(value, 10) || undefined;
      break;
    case "project":
      result.project = value;
      break;
    case "model":
      result.model = value;
      break;
    case "out":
      result.out = value;
      break;
    case "codex-dir":
      result.codexDir = value;
      break;
    case "claude-dir":
      result.claudeDir = value;
      break;
  }
}
