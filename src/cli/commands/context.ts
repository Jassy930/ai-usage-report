/**
 * context 子命令 — 导出工作上下文
 */

import type { ParsedArgs } from "../args";
import { resolveTools } from "../utils";
import { collectAllSessions } from "../../core/collect";
import { buildContextReport } from "../../core/context-builder";
import { renderContextMarkdown } from "../../reporters/context-markdown";
import { resolveTimeWindow } from "../../core/time";

export async function contextCommand(args: ParsedArgs): Promise<string> {
  const tools = resolveTools(args.tool);
  const window = resolveTimeWindow(
    {
      since: args.since,
      until: args.until,
    },
  );

  const sessions = await collectAllSessions({
    tools,
    roots: {
      codexDir: args.codexDir,
      claudeDir: args.claudeDir,
    },
    since: window.since.toISOString().slice(0, 10),
    until: window.until.toISOString().slice(0, 10),
    project: args.project,
    model: args.model,
  });

  const report = buildContextReport(sessions, {
    generatedAt: new Date().toISOString(),
    since: window.since.toISOString(),
    until: window.until.toISOString(),
    sources: tools ?? ["codex", "claude-code"],
    defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });

  if (args.format === "md") {
    return renderContextMarkdown(report);
  }

  return JSON.stringify(report, null, 2);
}
