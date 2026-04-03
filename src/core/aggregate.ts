/**
 * 聚合函数 — 将 SessionRecord[] 按不同维度汇总
 */

import type { SessionRecord, TokenBreakdown } from "./types";

/** 创建零值 TokenBreakdown */
export function emptyBreakdown(): TokenBreakdown {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, total: 0 };
}

/** 累加两个 TokenBreakdown */
export function addBreakdown(a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    total: a.total + b.total,
  };
}

/** 分组汇总结果 */
export interface GroupSummary {
  key: string;
  sessions: number;
  tokens: number;
  messages: number;
}

/**
 * 通用分组汇总：按 keyFn 返回的 key 聚合 sessions / tokens / messages
 */
export function groupBy(
  sessions: SessionRecord[],
  keyFn: (s: SessionRecord) => string,
): GroupSummary[] {
  const map = new Map<string, GroupSummary>();
  for (const s of sessions) {
    const key = keyFn(s);
    let entry = map.get(key);
    if (!entry) {
      entry = { key, sessions: 0, tokens: 0, messages: 0 };
      map.set(key, entry);
    }
    entry.sessions += 1;
    entry.tokens += s.tokenBreakdown.total;
    entry.messages += s.messageCount;
  }
  return Array.from(map.values());
}

/** 统计活跃天数（按 UTC 日期去重） */
export function countActiveDays(sessions: SessionRecord[]): number {
  const days = new Set<string>();
  for (const s of sessions) {
    days.add(s.timestamp.slice(0, 10)); // "YYYY-MM-DD"
  }
  return days.size;
}
