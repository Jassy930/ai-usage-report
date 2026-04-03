/** Claude Code 数据解析与合并 — 适配真实 ~/.claude/ 格式 */

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
    hasMetaData: false,
  };
}

/** 从 JSONL 行中提取会话数据 */
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

  // 取第一条 user 消息作为 firstPrompt（如果 meta 没有提供）
  for (const line of sorted) {
    if (line.type === "user" && line.message?.content && !acc.firstPrompt) {
      const content = line.message.content;
      if (typeof content === "string") {
        acc.firstPrompt = content.slice(0, 200);
      } else if (Array.isArray(content)) {
        const textBlock = content.find((b) => b.type === "text" && b.text);
        if (textBlock?.text) {
          acc.firstPrompt = textBlock.text.slice(0, 200);
        }
      }
      break;
    }
  }

  for (const line of lines) {
    acc.messageCount++;

    if (line.type === "assistant" && line.message?.usage) {
      const u = line.message.usage;
      acc.inputTokens += u.input_tokens ?? 0;
      acc.outputTokens += u.output_tokens ?? 0;
      acc.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      acc.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;

      // 提取 model
      if (!acc.model && line.message.model) {
        acc.model = line.message.model;
      }
    }

    // 统计 tool_use blocks
    if (
      line.type === "assistant" &&
      line.message?.content &&
      Array.isArray(line.message.content)
    ) {
      for (const block of line.message.content as ContentBlock[]) {
        if (block.type === "tool_use" && block.name) {
          acc.toolUsage[block.name] = (acc.toolUsage[block.name] ?? 0) + 1;
        }
      }
    }

    // 从 user/assistant 消息中提取 projectPath（cwd 字段）
    if (!acc.projectPath && line.cwd) {
      acc.projectPath = line.cwd;
    }
  }
}

/** 从 session-meta 填充 accumulator（核心数据源） */
export function applySessionMeta(
  meta: SessionMeta,
  acc: SessionAccumulator,
): void {
  acc.hasMetaData = true;
  if (meta.project_path) acc.projectPath = meta.project_path;
  if (meta.start_time) acc.timestamp = meta.start_time;
  if (meta.first_prompt && meta.first_prompt !== "No prompt") {
    acc.firstPrompt = meta.first_prompt;
  }

  // 如果没有 JSONL 数据，使用 meta 的 token 和消息计数
  if (!acc.hasJsonlData) {
    acc.inputTokens = meta.input_tokens ?? 0;
    acc.outputTokens = meta.output_tokens ?? 0;
    acc.messageCount =
      (meta.user_message_count ?? 0) + (meta.assistant_message_count ?? 0);
  }

  // tool_counts 补充
  if (meta.tool_counts && Object.keys(acc.toolUsage).length === 0) {
    acc.toolUsage = { ...meta.tool_counts };
  }
}

/** 从 facets 填充 accumulator（补充 summary/goal） */
export function applyFacets(
  facet: FacetEntry,
  acc: SessionAccumulator,
): void {
  if (facet.brief_summary) acc.summary = facet.brief_summary;
  if (facet.underlying_goal) acc.goal = facet.underlying_goal;
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

  // 1. JSONL 数据（详细来源）
  for (const [sessionId, lines] of journals) {
    const acc = createAccumulator(sessionId);
    processJournalLines(lines, acc);
    map.set(sessionId, acc);
  }

  // 2. Session-meta 数据（核心元数据）
  for (const meta of metas) {
    let acc = map.get(meta.session_id);
    if (!acc) {
      acc = createAccumulator(meta.session_id);
      map.set(meta.session_id, acc);
    }
    applySessionMeta(meta, acc);
  }

  // 3. Facets 数据（补充 summary/goal）
  for (const facet of facets) {
    let acc = map.get(facet.session_id);
    if (!acc) {
      acc = createAccumulator(facet.session_id);
      map.set(facet.session_id, acc);
    }
    applyFacets(facet, acc);
  }

  return Array.from(map.values()).map(toSessionRecord);
}
