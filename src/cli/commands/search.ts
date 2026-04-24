/**
 * search 子命令 — 在会话消息中搜索关键字并统计出现次数
 */

import type { ParsedArgs } from "../args";
import type { SearchReport } from "../../core/search";
import { resolveTools } from "../utils";
import { collectAllSessions } from "../../core/collect";
import { searchSessions } from "../../core/search";
import { fmt, escapeMarkdownCell } from "../../reporters/format";

export async function searchCommand(args: ParsedArgs): Promise<string> {
  if (!args.query) {
    return "错误: search 命令需要 --query (-q) 参数指定搜索关键字。";
  }

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

  const report = searchSessions(sessions, {
    query: args.query,
    caseSensitive: args.caseSensitive,
    role: args.role as "user" | "assistant" | "all" | undefined,
  });

  const limit = args.limit;
  if (limit !== undefined && limit > 0) {
    report.results = report.results.slice(0, limit);
  }

  switch (args.format) {
    case "json":
      return renderSearchJson(report);
    case "md":
      return renderSearchMarkdown(report);
    case "terminal":
    default:
      return renderSearchTerminal(report);
  }
}

function renderSearchTerminal(report: SearchReport): string {
  const lines: string[] = [];
  const sep = "─".repeat(60);

  lines.push(sep);
  lines.push(`  搜索结果 — "${report.query}"`);
  lines.push(sep);
  lines.push("");
  lines.push(`  总匹配次数        ${fmt(report.totalMatches).padStart(10)}`);
  lines.push(`  匹配会话数        ${fmt(report.matchedSessions).padStart(10)}`);
  lines.push(`  扫描会话数        ${fmt(report.totalSessions).padStart(10)}`);
  lines.push(`  区分大小写        ${(report.caseSensitive ? "是" : "否").padStart(10)}`);
  lines.push("");

  if (report.results.length === 0) {
    lines.push("  （无匹配）没有在任何会话中找到该关键字。");
    lines.push("");
    lines.push(sep);
    return lines.join("\n");
  }

  lines.push(sep);
  lines.push("  匹配会话明细");
  lines.push(sep);
  lines.push(
    `  ${"会话ID".padEnd(20)} ${"工具".padEnd(14)} ${"匹配次数".padStart(8)}  首条匹配片段`,
  );
  lines.push("  " + "─".repeat(56));

  for (const r of report.results) {
    const id = r.session.sessionId.slice(0, 18).padEnd(20);
    const tool = r.session.tool.padEnd(14);
    const count = String(r.matchCount).padStart(8);
    const firstSnippet = r.matches[0]?.snippet
      ? r.matches[0].snippet.slice(0, 40)
      : "-";
    lines.push(`  ${id} ${tool} ${count}  ${firstSnippet}`);
  }

  lines.push("");
  lines.push(sep);

  return lines.join("\n");
}

function renderSearchMarkdown(report: SearchReport): string {
  const lines: string[] = [];
  lines.push(`# 搜索结果 — "${escapeMarkdownCell(report.query)}"`);
  lines.push("");
  lines.push(`- **总匹配次数**: ${fmt(report.totalMatches)}`);
  lines.push(`- **匹配会话数**: ${fmt(report.matchedSessions)}`);
  lines.push(`- **扫描会话数**: ${fmt(report.totalSessions)}`);
  lines.push(`- **区分大小写**: ${report.caseSensitive ? "是" : "否"}`);
  lines.push("");

  if (report.results.length === 0) {
    lines.push("没有在任何会话中找到该关键字。");
    return lines.join("\n");
  }

  lines.push("## 匹配会话");
  lines.push("");
  lines.push("| 会话ID | 工具 | 匹配次数 | 首条匹配片段 |");
  lines.push("| --- | --- | --- | --- |");

  for (const r of report.results) {
    const id = escapeMarkdownCell(r.session.sessionId.slice(0, 18));
    const tool = escapeMarkdownCell(r.session.tool);
    const snippet = r.matches[0]?.snippet
      ? escapeMarkdownCell(r.matches[0].snippet.slice(0, 60))
      : "-";
    lines.push(`| ${id} | ${tool} | ${r.matchCount} | ${snippet} |`);
  }

  return lines.join("\n");
}

function renderSearchJson(report: SearchReport): string {
  return JSON.stringify(
    {
      query: report.query,
      caseSensitive: report.caseSensitive,
      totalMatches: report.totalMatches,
      matchedSessions: report.matchedSessions,
      totalSessions: report.totalSessions,
      results: report.results.map((r) => ({
        sessionId: r.session.sessionId,
        tool: r.session.tool,
        projectPath: r.session.projectPath,
        model: r.session.model,
        matchCount: r.matchCount,
        matches: r.matches.map((m) => ({
          messageIndex: m.messageIndex,
          role: m.role,
          timestamp: m.timestamp,
          snippet: m.snippet,
        })),
      })),
    },
    null,
    2,
  );
}
