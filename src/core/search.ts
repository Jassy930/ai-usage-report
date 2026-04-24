/**
 * 会话内容搜索 — 在 SessionRecord 的消息文本中搜索关键字并统计
 */

import type { SessionRecord, SessionMessage } from "./types";

/** 单条匹配结果 */
export interface SearchMatch {
  sessionId: string;
  tool: string;
  messageIndex: number;
  role: string;
  timestamp: string;
  /** 匹配所在的文本片段（上下文） */
  snippet: string;
}

/** 按会话聚合的搜索结果 */
export interface SessionSearchResult {
  session: SessionRecord;
  matches: SearchMatch[];
  matchCount: number;
}

/** 搜索汇总 */
export interface SearchReport {
  query: string;
  caseSensitive: boolean;
  totalMatches: number;
  totalSessions: number;
  matchedSessions: number;
  results: SessionSearchResult[];
}

export interface SearchOptions {
  /** 搜索关键字 */
  query: string;
  /** 是否区分大小写，默认 false */
  caseSensitive?: boolean;
  /** 搜索范围：user / assistant / all，默认 all */
  role?: "user" | "assistant" | "all";
}

/**
 * 统计字符串中关键字出现的次数
 */
function countOccurrences(text: string, query: string, caseSensitive: boolean): number {
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  if (needle.length === 0) return 0;

  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/**
 * 提取匹配位置附近的文本片段
 */
function extractSnippet(text: string, query: string, caseSensitive: boolean, maxLen = 120): string {
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const idx = haystack.indexOf(needle);
  if (idx === -1) return text.slice(0, maxLen);

  const padding = Math.floor((maxLen - needle.length) / 2);
  const start = Math.max(0, idx - padding);
  const end = Math.min(text.length, idx + needle.length + padding);

  let snippet = text.slice(start, end).replace(/\n/g, " ");
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

/**
 * 在消息列表中搜索关键字
 */
function searchMessages(
  session: SessionRecord,
  messages: SessionMessage[],
  query: string,
  caseSensitive: boolean,
  roleFilter: string,
): SearchMatch[] {
  const matches: SearchMatch[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (roleFilter !== "all" && msg.role !== roleFilter) continue;
    if (!msg.text) continue;

    const occurrences = countOccurrences(msg.text, query, caseSensitive);
    if (occurrences > 0) {
      // 每次出现记录一个 match（用于准确计数）
      for (let j = 0; j < occurrences; j++) {
        matches.push({
          sessionId: session.sessionId,
          tool: session.tool,
          messageIndex: i,
          role: msg.role,
          timestamp: msg.timestamp,
          snippet: j === 0 ? extractSnippet(msg.text, query, caseSensitive) : "",
        });
      }
    }
  }

  return matches;
}

/**
 * 在会话集合中搜索关键字，返回搜索报告
 */
export function searchSessions(
  sessions: SessionRecord[],
  options: SearchOptions,
): SearchReport {
  const { query, caseSensitive = false, role = "all" } = options;

  const results: SessionSearchResult[] = [];
  let totalMatches = 0;

  for (const session of sessions) {
    const matches = searchMessages(session, session.messages, query, caseSensitive, role);
    if (matches.length > 0) {
      results.push({
        session,
        matches,
        matchCount: matches.length,
      });
      totalMatches += matches.length;
    }
  }

  // 按匹配数降序排列
  results.sort((a, b) => b.matchCount - a.matchCount);

  return {
    query,
    caseSensitive,
    totalMatches,
    totalSessions: sessions.length,
    matchedSessions: results.length,
    results,
  };
}
