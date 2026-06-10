/**
 * sessions 子命令 — 列出会话记录
 */

import type { ParsedArgs } from "../args";
import type { SessionRecord } from "../../core/types";
import { resolveTools } from "../utils";
import { collectAllSessions } from "../../core/collect";
import { fmt, escapeMarkdownCell } from "../../reporters/format";

export async function sessionsCommand(args: ParsedArgs): Promise<string> {
  const tools = resolveTools(args.tool);

  let sessions = await collectAllSessions({
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

  if (args.limit !== undefined && args.limit > 0) {
    sessions = sessions.slice(0, args.limit);
  }

  switch (args.format) {
    case "json":
      return JSON.stringify(sessions, null, 2);
    case "md":
      return renderSessionsMarkdown(sessions);
    case "terminal":
    default:
      return renderSessionsTerminal(sessions);
  }
}

function renderSessionsTerminal(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return "（无数据）没有匹配的会话记录。";

  const lines: string[] = [];
  lines.push(
    `${"ID".padEnd(20)} ${"Tool".padEnd(14)} ${"Model".padEnd(16)} ${"Tokens".padStart(10)} ${"Msgs".padStart(6)}  Prompt`,
  );
  lines.push("─".repeat(90));

  for (const s of sessions) {
    const id = s.sessionId.slice(0, 18).padEnd(20);
    const tool = s.tool.padEnd(14);
    const model = (s.model ?? "unknown").slice(0, 14).padEnd(16);
    const tokens = fmt(s.tokenBreakdown.total).padStart(10);
    const msgs = String(s.messageCount).padStart(6);
    const prompt = s.firstPrompt ? s.firstPrompt.slice(0, 40) : "-";
    lines.push(`${id} ${tool} ${model} ${tokens} ${msgs}  ${prompt}`);
  }

  return lines.join("\n");
}

function renderSessionsMarkdown(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return "No sessions found.";

  const lines: string[] = [];
  lines.push("# Sessions");
  lines.push("");
  lines.push("| ID | Tool | Model | Tokens | Messages | Prompt |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const s of sessions) {
    const id = s.sessionId.slice(0, 18);
    const prompt = s.firstPrompt ? escapeMarkdownCell(s.firstPrompt.slice(0, 50)) : "-";
    lines.push(
      `| ${escapeMarkdownCell(id)} | ${escapeMarkdownCell(s.tool)} | ${escapeMarkdownCell(s.model ?? "-")} | ${fmt(s.tokenBreakdown.total)} | ${s.messageCount} | ${prompt} |`,
    );
  }

  return lines.join("\n");
}
