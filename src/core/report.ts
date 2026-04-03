/**
 * 报告构建 — 将 SessionRecord[] 转换为 UsageReport
 */

import type { SessionRecord, TokenBreakdown } from "./types";
import { addBreakdown, countActiveDays, emptyBreakdown, groupBy } from "./aggregate";

/** 使用报告类型 */
export interface UsageReport {
  summary: {
    totalTokens: number;
    totalSessions: number;
    totalMessages: number;
    activeDays: number;
    tokenBreakdown: TokenBreakdown;
  };
  tools: Array<{ tool: string; sessions: number; tokens: number; messages: number }>;
  projects: Array<{ project: string; sessions: number; tokens: number; messages: number }>;
  models: Array<{ model: string; sessions: number; tokens: number; messages: number }>;
  sessions: SessionRecord[];
}

/**
 * 构建使用报告
 */
export function buildUsageReport(sessions: SessionRecord[]): UsageReport {
  // 汇总
  let tokenBreakdown = emptyBreakdown();
  let totalMessages = 0;
  for (const s of sessions) {
    tokenBreakdown = addBreakdown(tokenBreakdown, s.tokenBreakdown);
    totalMessages += s.messageCount;
  }

  // 按维度分组
  const toolGroups = groupBy(sessions, (s) => s.tool);
  const projectGroups = groupBy(sessions, (s) => s.projectPath ?? "unknown");
  const modelGroups = groupBy(sessions, (s) => s.model ?? "unknown");

  // 按 token 降序排列的会话列表
  const sorted = [...sessions].sort(
    (a, b) => b.tokenBreakdown.total - a.tokenBreakdown.total,
  );

  return {
    summary: {
      totalTokens: tokenBreakdown.total,
      totalSessions: sessions.length,
      totalMessages,
      activeDays: countActiveDays(sessions),
      tokenBreakdown,
    },
    tools: toolGroups.map((g) => ({ tool: g.key, sessions: g.sessions, tokens: g.tokens, messages: g.messages })),
    projects: projectGroups.map((g) => ({ project: g.key, sessions: g.sessions, tokens: g.tokens, messages: g.messages })),
    models: modelGroups.map((g) => ({ model: g.key, sessions: g.sessions, tokens: g.tokens, messages: g.messages })),
    sessions: sorted,
  };
}
