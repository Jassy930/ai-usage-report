/**
 * Markdown 报告输出
 */

import type { UsageReport } from "../core/report";
import { fmt, fmtHuman, fmtTokens, escapeMarkdownCell } from "./format";

/**
 * 将 UsageReport 渲染为 Markdown 格式字符串
 */
export function renderMarkdownReport(report: UsageReport): string {
  const { summary, tools, projects, models, sessions } = report;
  const lines: string[] = [];

  // 标题
  lines.push("# AI Usage Report");
  lines.push("");

  // 概览
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Total Tokens | ${fmtTokens(summary.totalTokens)} |`);
  lines.push(`| Total Sessions | ${fmt(summary.totalSessions)} |`);
  lines.push(`| Total Messages | ${fmt(summary.totalMessages)} |`);
  lines.push(`| Active Days | ${fmt(summary.activeDays)} |`);
  lines.push("");

  // Token 明细
  lines.push("### Token Breakdown");
  lines.push("");
  lines.push(`| Category | Tokens |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Input | ${fmtTokens(summary.tokenBreakdown.inputTokens)} |`);
  lines.push(`| Output | ${fmtTokens(summary.tokenBreakdown.outputTokens)} |`);
  lines.push(`| Cache Read | ${fmtTokens(summary.tokenBreakdown.cacheReadTokens)} |`);
  lines.push(`| Cache Write | ${fmtTokens(summary.tokenBreakdown.cacheWriteTokens)} |`);
  lines.push("");

  // 工具
  lines.push("## Tools");
  lines.push("");
  lines.push(`| Tool | Sessions | Tokens | Messages |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const t of tools) {
    lines.push(`| ${escapeMarkdownCell(t.tool)} | ${fmt(t.sessions)} | ${fmtHuman(t.tokens)} | ${fmt(t.messages)} |`);
  }
  lines.push("");

  // 项目
  lines.push("## Projects");
  lines.push("");
  lines.push(`| Project | Sessions | Tokens | Messages |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const p of projects) {
    lines.push(`| ${escapeMarkdownCell(p.project)} | ${fmt(p.sessions)} | ${fmtHuman(p.tokens)} | ${fmt(p.messages)} |`);
  }
  lines.push("");

  // 模型
  lines.push("## Models");
  lines.push("");
  lines.push(`| Model | Sessions | Tokens | Messages |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const m of models) {
    lines.push(`| ${escapeMarkdownCell(m.model)} | ${fmt(m.sessions)} | ${fmtHuman(m.tokens)} | ${fmt(m.messages)} |`);
  }
  lines.push("");

  // Top Sessions（最多显示 10 个）
  const topSessions = sessions.slice(0, 10);
  lines.push("## Top Sessions");
  lines.push("");
  lines.push(`| Session | Tool | Model | Messages | Tokens | Prompt |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const s of topSessions) {
    const prompt = s.firstPrompt
      ? s.firstPrompt.length > 50
        ? `${s.firstPrompt.slice(0, 47)}...`
        : s.firstPrompt
      : "-";
    lines.push(
      `| ${escapeMarkdownCell(s.sessionId)} | ${escapeMarkdownCell(s.tool)} | ${escapeMarkdownCell(s.model ?? "-")} | ${fmt(s.messageCount)} | ${fmtHuman(s.tokenBreakdown.total)} | ${escapeMarkdownCell(prompt)} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}
