/**
 * report 子命令 — 生成完整使用报告
 */

import type { ParsedArgs } from "../args";
import { resolveTools } from "../utils";
import { collectAllSessions } from "../../core/collect";
import { buildUsageReport } from "../../core/report";
import { renderJsonReport } from "../../reporters/json";
import { renderMarkdownReport } from "../../reporters/markdown";
import { renderTerminalReport } from "../../reporters/terminal";

export async function reportCommand(args: ParsedArgs): Promise<string> {
  const tools = resolveTools(args.tool);

  const sessions = await collectAllSessions({
    tools,
    roots: {
      codexDir: args.codexDir,
      claudeDir: args.claudeDir,
    },
    since: args.since,
    until: args.until,
    project: args.project,
    model: args.model,
  });

  const report = buildUsageReport(sessions);

  switch (args.format) {
    case "json":
      return renderJsonReport(report);
    case "md":
      return renderMarkdownReport(report);
    case "terminal":
    default:
      return renderTerminalReport(report);
  }
}
