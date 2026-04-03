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
function rpad(s: string, w: number): string {
  return s.padStart(w);
}

/** 左对齐填充 */
function lpad(s: string, w: number): string {
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
  lines.push(`  TOTAL TOKENS    ${rpad(fmtTokens(summary.totalTokens), 28)}`);
  lines.push(`  Sessions        ${rpad(fmt(summary.totalSessions), 28)}`);
  lines.push(`  Messages        ${rpad(fmt(summary.totalMessages), 28)}`);
  lines.push(`  Active Days     ${rpad(fmt(summary.activeDays), 28)}`);
  lines.push("");

  // ── Token 明细 ──
  const bd = summary.tokenBreakdown;
  lines.push("  Token 明细:");
  lines.push(`    Input         ${rpad(fmtTokens(bd.inputTokens), 28)}`);
  lines.push(`    Output        ${rpad(fmtTokens(bd.outputTokens), 28)}`);
  lines.push(`    Cache Read    ${rpad(fmtTokens(bd.cacheReadTokens), 28)}`);
  lines.push(`    Cache Write   ${rpad(fmtTokens(bd.cacheWriteTokens), 28)}`);
  lines.push("");

  // ── 工具维度 ──
  lines.push(SEPARATOR);
  lines.push("  工具维度");
  lines.push(SEPARATOR);
  if (tools.length === 0) {
    lines.push("  （无数据）");
  } else {
    lines.push(`  ${lpad("Tool", 16)}  ${rpad("Sessions", 10)}  ${rpad("Tokens", 14)}  ${rpad("Messages", 10)}`);
    for (const t of tools) {
      lines.push(`  ${lpad(t.tool, 16)}  ${rpad(fmt(t.sessions), 10)}  ${rpad(fmtHuman(t.tokens), 14)}  ${rpad(fmt(t.messages), 10)}`);
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
    lines.push(`  ${lpad("Project", 30)}  ${rpad("Sessions", 10)}  ${rpad("Tokens", 14)}  ${rpad("Messages", 10)}`);
    for (const p of projects) {
      const name = truncate(p.project, 30);
      lines.push(`  ${lpad(name, 30)}  ${rpad(fmt(p.sessions), 10)}  ${rpad(fmtHuman(p.tokens), 14)}  ${rpad(fmt(p.messages), 10)}`);
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
    lines.push(`  ${lpad("Model", 20)}  ${rpad("Sessions", 10)}  ${rpad("Tokens", 14)}  ${rpad("Messages", 10)}`);
    for (const m of models) {
      lines.push(`  ${lpad(m.model, 20)}  ${rpad(fmt(m.sessions), 10)}  ${rpad(fmtHuman(m.tokens), 14)}  ${rpad(fmt(m.messages), 10)}`);
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
      lines.push(`  ${lpad(fmtHuman(s.tokenBreakdown.total), 10)}  ${lpad(s.tool, 12)}  ${lpad(s.model ?? "unknown", 16)}  ${prompt}`);
    }
  }
  lines.push("");
  lines.push(SEPARATOR);

  return lines.join("\n");
}
