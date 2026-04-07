/**
 * context Markdown 输出
 */

import type { ContextReport } from "../core/context";
import { escapeMarkdownCell, fmt, fmtTokens } from "./format";

export function renderContextMarkdown(report: ContextReport): string {
  const lines: string[] = [];

  lines.push("# Context Export");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Generated At: ${report.meta.generatedAt}`);
  lines.push(`- Since: ${report.meta.since}`);
  lines.push(`- Until: ${report.meta.until}`);
  lines.push(`- Sources: ${report.meta.sources.join(", ")}`);
  lines.push("");
  lines.push("## Projects");
  lines.push("");

  if (report.projects.length === 0) {
    lines.push("（无数据）");
    lines.push("");
  }

  for (const project of report.projects) {
    lines.push(`### ${escapeMarkdownCell(project.projectLabel)}`);
    lines.push("");
    lines.push(`| Session | Tool | Model | Messages | Tokens |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const session of project.sessions) {
      lines.push(
        `| ${escapeMarkdownCell(session.sessionId)} | ${escapeMarkdownCell(session.tool)} | ${escapeMarkdownCell(session.model ?? "-")} | ${fmt(session.messageCount)} | ${fmtTokens(session.tokenBreakdown.total)} |`,
      );
    }
    lines.push("");
  }

  if (report.ungroupedSessions.length > 0) {
    lines.push("## Ungrouped Sessions");
    lines.push("");
    for (const session of report.ungroupedSessions) {
      lines.push(`- ${escapeMarkdownCell(session.sessionId)} (${escapeMarkdownCell(session.tool)})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
