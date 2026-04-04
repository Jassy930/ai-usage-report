/**
 * 终端报告渲染器 — 纯文本输出，适配终端和 CI 日志
 */

import type { UsageReport } from "../core/report";
import { fmt, fmtHuman, fmtTokens } from "./format";

/** 截断字符串 */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** 右对齐填充 */
function alignRight(s: string, w: number): string {
  return s.padStart(w);
}

/** 左对齐填充 */
function alignLeft(s: string, w: number): string {
  return s.padEnd(w);
}

const SEPARATOR = "─".repeat(60);

/**
 * 渲染终端报告
 */
export function renderTerminalReport(report: UsageReport): string {
  const { summary, tools, projects, models, sessions } = report;

  // 空数据提示
  if (summary.totalSessions === 0) {
    return [
      SEPARATOR,
      "  AI 使用报告",
      SEPARATOR,
      "",
      "  （无数据）当前过滤条件下没有会话记录。",
      "",
      SEPARATOR,
    ].join("\n");
  }

  const lines: string[] = [];

  // ── 概览 ──
  lines.push(SEPARATOR);
  lines.push("  AI 使用报告 — 概览");
  lines.push(SEPARATOR);
  lines.push("");
  lines.push(`  TOTAL TOKENS    ${alignRight(fmtTokens(summary.totalTokens), 28)}`);
  lines.push(`  Sessions        ${alignRight(fmt(summary.totalSessions), 28)}`);
  lines.push(`  Messages        ${alignRight(fmt(summary.totalMessages), 28)}`);
  lines.push(`  Active Days     ${alignRight(fmt(summary.activeDays), 28)}`);
  lines.push("");

  // ── Token 明细 ──
  const bd = summary.tokenBreakdown;
  lines.push("  Token 明细:");
  lines.push(`    Input         ${alignRight(fmtTokens(bd.inputTokens), 28)}`);
  lines.push(`    Output        ${alignRight(fmtTokens(bd.outputTokens), 28)}`);
  lines.push(`    Cache Read    ${alignRight(fmtTokens(bd.cacheReadTokens), 28)}`);
  lines.push(`    Cache Write   ${alignRight(fmtTokens(bd.cacheWriteTokens), 28)}`);
  lines.push("");

  // ── 工具维度 ──
  lines.push(SEPARATOR);
  lines.push("  工具维度");
  lines.push(SEPARATOR);
  if (tools.length === 0) {
    lines.push("  （无数据）");
  } else {
    lines.push(`  ${alignLeft("Tool", 16)}  ${alignRight("Sessions", 10)}  ${alignRight("Tokens", 14)}  ${alignRight("Messages", 10)}`);
    for (const t of tools) {
      lines.push(`  ${alignLeft(t.tool, 16)}  ${alignRight(fmt(t.sessions), 10)}  ${alignRight(fmtHuman(t.tokens), 14)}  ${alignRight(fmt(t.messages), 10)}`);
    }
  }
  lines.push("");

  // ── 项目维度 ──
  lines.push(SEPARATOR);
  lines.push("  项目维度");
  lines.push(SEPARATOR);
  if (projects.length === 0) {
    lines.push("  （无数据）");
  } else {
    lines.push(`  ${alignLeft("Project", 30)}  ${alignRight("Sessions", 10)}  ${alignRight("Tokens", 14)}  ${alignRight("Messages", 10)}`);
    for (const p of projects) {
      const name = truncate(p.project, 30);
      lines.push(`  ${alignLeft(name, 30)}  ${alignRight(fmt(p.sessions), 10)}  ${alignRight(fmtHuman(p.tokens), 14)}  ${alignRight(fmt(p.messages), 10)}`);
    }
  }
  lines.push("");

  // ── 模型维度 ──
  lines.push(SEPARATOR);
  lines.push("  模型维度");
  lines.push(SEPARATOR);
  if (models.length === 0) {
    lines.push("  （无数据）");
  } else {
    lines.push(`  ${alignLeft("Model", 20)}  ${alignRight("Sessions", 10)}  ${alignRight("Tokens", 14)}  ${alignRight("Messages", 10)}`);
    for (const m of models) {
      lines.push(`  ${alignLeft(m.model, 20)}  ${alignRight(fmt(m.sessions), 10)}  ${alignRight(fmtHuman(m.tokens), 14)}  ${alignRight(fmt(m.messages), 10)}`);
    }
  }
  lines.push("");

  // ── Top Sessions ──
  lines.push(SEPARATOR);
  lines.push("  Top Sessions");
  lines.push(SEPARATOR);
  const topN = sessions.slice(0, 10);
  if (topN.length === 0) {
    lines.push("  （无数据）");
  } else {
    for (const s of topN) {
      const prompt = s.firstPrompt ? truncate(s.firstPrompt, 40) : "(no prompt)";
      lines.push(`  ${alignLeft(fmtHuman(s.tokenBreakdown.total), 10)}  ${alignLeft(s.tool, 12)}  ${alignLeft(s.model ?? "unknown", 16)}  ${prompt}`);
    }
  }
  lines.push("");
  lines.push(SEPARATOR);

  return lines.join("\n");
}
