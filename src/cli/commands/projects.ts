/**
 * projects 子命令 — 按项目汇总
 */

import type { ParsedArgs } from "../args";
import type { ToolType } from "../../core/types";
import { collectAllSessions } from "../../core/collect";
import { buildUsageReport } from "../../core/report";

export async function projectsCommand(args: ParsedArgs): Promise<string> {
  const tools = resolveTools(args.tool);

  const sessions = await collectAllSessions({
    tools,
    roots: {
      codexDir: args.codexDir,
      claudeDir: args.claudeDir,
    },
    since: args.since,
    project: args.project,
    model: args.model,
  });

  const report = buildUsageReport(sessions);
  const projects = report.projects;

  switch (args.format) {
    case "json":
      return JSON.stringify(projects, null, 2);
    case "md":
      return renderProjectsMarkdown(projects);
    case "terminal":
    default:
      return renderProjectsTerminal(projects);
  }
}

function resolveTools(tool: string): ToolType[] | undefined {
  if (tool === "codex") return ["codex"];
  if (tool === "claude-code") return ["claude-code"];
  return undefined;
}

type ProjectSummary = { project: string; sessions: number; tokens: number; messages: number };

function renderProjectsTerminal(projects: ProjectSummary[]): string {
  if (projects.length === 0) return "（无数据）没有匹配的项目记录。";

  const lines: string[] = [];
  lines.push(
    `${"Project".padEnd(40)} ${"Sessions".padStart(10)} ${"Tokens".padStart(12)} ${"Messages".padStart(10)}`,
  );
  lines.push("─".repeat(76));

  for (const p of projects) {
    const name = p.project.length > 38 ? `${p.project.slice(0, 37)}…` : p.project;
    lines.push(
      `${name.padEnd(40)} ${String(p.sessions).padStart(10)} ${p.tokens.toLocaleString("en-US").padStart(12)} ${String(p.messages).padStart(10)}`,
    );
  }

  return lines.join("\n");
}

function renderProjectsMarkdown(projects: ProjectSummary[]): string {
  if (projects.length === 0) return "No projects found.";

  const lines: string[] = [];
  lines.push("# Projects");
  lines.push("");
  lines.push("| Project | Sessions | Tokens | Messages |");
  lines.push("| --- | --- | --- | --- |");

  for (const p of projects) {
    lines.push(
      `| ${p.project} | ${p.sessions} | ${p.tokens.toLocaleString("en-US")} | ${p.messages} |`,
    );
  }

  return lines.join("\n");
}
