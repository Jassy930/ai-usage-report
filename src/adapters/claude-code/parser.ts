/** Claude Code 数据解析与合并 */

import type { SessionRecord } from "../../core/types";
import type {
  FacetEntry,
  SessionMeta,
  JournalLine,
  SessionAccumulator,
  ContentBlock,
} from "./types";

function createAccumulator(sessionId: string): SessionAccumulator {
  return {
    sessionId,
    messageCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    toolUsage: {},
    hasJsonlData: false,
  };
}

/** 从 JSONL 行中提取会话数据，写入 accumulator */
export function processJournalLines(
  lines: JournalLine[],
  acc: SessionAccumulator,
): void {
  acc.hasJsonlData = true;

  // 按时间排序，取最早的作为 timestamp
  const sorted = [...lines].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  if (sorted.length > 0) {
    acc.timestamp = sorted[0]!.timestamp;
  }

  for (const line of lines) {
    acc.messageCount++;

    if (line.type === "assistant" && line.message.usage) {
      const u = line.message.usage;
      acc.inputTokens += u.input_tokens ?? 0;
      acc.outputTokens += u.output_tokens ?? 0;
      acc.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      acc.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
    }

    // 统计 tool_use blocks
    if (
      line.type === "assistant" &&
      Array.isArray(line.message.content)
    ) {
      for (const block of line.message.content as ContentBlock[]) {
        if (block.type === "tool_use" && block.name) {
          acc.toolUsage[block.name] = (acc.toolUsage[block.name] ?? 0) + 1;
        }
      }
    }
  }
}

/** 从 facets 数据填充 accumulator（仅当无 JSONL 数据时使用 token） */
export function applyFacets(
  facet: FacetEntry,
  acc: SessionAccumulator,
): void {
  if (!acc.model) acc.model = facet.model;
  if (!acc.timestamp) acc.timestamp = facet.date;

  // 仅当无 JSONL token 数据时使用 facets token
  if (!acc.hasJsonlData) {
    acc.inputTokens = facet.inputTokens;
    acc.outputTokens = facet.outputTokens;
    acc.cacheReadTokens = facet.cacheReadTokens;
    acc.cacheWriteTokens = facet.cacheWriteTokens;
  }
}

/** 从 session-meta 填充 accumulator */
export function applySessionMeta(
  meta: SessionMeta,
  acc: SessionAccumulator,
): void {
  if (meta.projectPath) acc.projectPath = meta.projectPath;
  if (meta.summary) acc.summary = meta.summary;
  if (meta.goal) acc.goal = meta.goal;
  if (meta.conclusion) acc.conclusion = meta.conclusion;
  if (meta.firstPrompt) acc.firstPrompt = meta.firstPrompt;
}

/** 将 accumulator 转换为统一 SessionRecord */
export function toSessionRecord(acc: SessionAccumulator): SessionRecord {
  const total =
    acc.inputTokens + acc.outputTokens + acc.cacheReadTokens + acc.cacheWriteTokens;

  return {
    tool: "claude-code",
    sessionId: acc.sessionId,
    timestamp: acc.timestamp ?? new Date().toISOString(),
    projectPath: acc.projectPath,
    model: acc.model,
    messageCount: acc.messageCount,
    firstPrompt: acc.firstPrompt,
    summary: acc.summary,
    goal: acc.goal,
    conclusion: acc.conclusion,
    toolUsage:
      Object.keys(acc.toolUsage).length > 0 ? acc.toolUsage : undefined,
    tokenBreakdown: {
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens,
      total,
    },
  };
}

/** 合并所有数据源，返回 SessionRecord[] */
export function mergeAllSources(
  journals: Map<string, JournalLine[]>,
  facets: FacetEntry[],
  metas: SessionMeta[],
): SessionRecord[] {
  const map = new Map<string, SessionAccumulator>();

  // 1. JSONL 数据（主要来源）
  for (const [sessionId, lines] of journals) {
    const acc = createAccumulator(sessionId);
    processJournalLines(lines, acc);
    map.set(sessionId, acc);
  }

  // 2. Facets 数据补充
  for (const facet of facets) {
    let acc = map.get(facet.sessionId);
    if (!acc) {
      acc = createAccumulator(facet.sessionId);
      map.set(facet.sessionId, acc);
    }
    applyFacets(facet, acc);
  }

  // 3. Session-meta 数据补充
  for (const meta of metas) {
    let acc = map.get(meta.sessionId);
    if (!acc) {
      acc = createAccumulator(meta.sessionId);
      map.set(meta.sessionId, acc);
    }
    applySessionMeta(meta, acc);
  }

  // 转换为 SessionRecord[]
  return Array.from(map.values()).map(toSessionRecord);
}
