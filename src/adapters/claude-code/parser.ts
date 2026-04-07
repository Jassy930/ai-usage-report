/** Claude Code 数据解析与合并 — 适配真实 ~/.claude/ 格式 */

import type { RawRef, SessionMessage, SessionRecord, SessionToolCall } from "../../core/types";
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
    messages: [],
    rawRefs: [],
    hasJsonlData: false,
    hasMetaData: false,
  };
}

function makeJsonPointerRef(
  sessionId: string,
  filePath: string | undefined,
  jsonPointer: string,
): RawRef | null {
  if (!filePath) return null;
  return {
    tool: "claude-code",
    sourceType: "json",
    filePath,
    sessionId,
    jsonPointer,
  };
}

function extractMessageText(content: string | ContentBlock[] | undefined): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const texts = content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!.trim())
    .filter(Boolean);
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function extractToolCalls(content: string | ContentBlock[] | undefined): SessionToolCall[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block.type === "tool_use" && block.name)
    .map((block) => ({ name: block.name!, id: block.id }));
}

function toMessage(line: JournalLine): SessionMessage {
  return {
    role: line.type,
    kind: "message",
    timestamp: line.timestamp,
    text: extractMessageText(line.message?.content),
    toolCalls: extractToolCalls(line.message?.content),
    usage: line.message?.usage
      ? {
          input_tokens: line.message.usage.input_tokens,
          output_tokens: line.message.usage.output_tokens,
          cache_read_input_tokens: line.message.usage.cache_read_input_tokens,
          cache_creation_input_tokens: line.message.usage.cache_creation_input_tokens,
        }
      : undefined,
    rawRefs: line.__source
      ? [{
          tool: "claude-code",
          sourceType: "journal_jsonl",
          filePath: line.__source.filePath,
          line: line.__source.line,
          sessionId: line.sessionId,
        }]
      : [],
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
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );
  if (sorted.length > 0) {
    acc.timestamp = sorted[0]!.timestamp;
    acc.timestampEnd = sorted[sorted.length - 1]!.timestamp;
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

  for (const line of sorted) {
    acc.messageCount++;
    acc.messages.push(toMessage(line));
    if (line.__source) {
      acc.rawRefs.push({
        tool: "claude-code",
        sourceType: "journal_jsonl",
        filePath: line.__source.filePath,
        line: line.__source.line,
        sessionId: line.sessionId,
      });
    }

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
  if (meta.project_path) {
    acc.projectPath = meta.project_path;
    const ref = makeJsonPointerRef(meta.session_id, meta.__source?.filePath, "/project_path");
    if (ref) acc.rawRefs.push(ref);
  }
  if (meta.start_time) {
    acc.timestamp = meta.start_time;
    const ref = makeJsonPointerRef(meta.session_id, meta.__source?.filePath, "/start_time");
    if (ref) acc.rawRefs.push(ref);
  }
  if (meta.first_prompt && meta.first_prompt !== "No prompt") {
    acc.firstPrompt = meta.first_prompt;
    const ref = makeJsonPointerRef(meta.session_id, meta.__source?.filePath, "/first_prompt");
    if (ref) acc.rawRefs.push(ref);
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
  if (facet.brief_summary) {
    acc.summary = facet.brief_summary;
    const ref = makeJsonPointerRef(facet.session_id, facet.__source?.filePath, "/brief_summary");
    if (ref) acc.rawRefs.push(ref);
  }
  if (facet.underlying_goal) {
    acc.goal = facet.underlying_goal;
    const ref = makeJsonPointerRef(facet.session_id, facet.__source?.filePath, "/underlying_goal");
    if (ref) acc.rawRefs.push(ref);
  }
  if (facet.outcome) {
    acc.outcome = facet.outcome;
    const ref = makeJsonPointerRef(facet.session_id, facet.__source?.filePath, "/outcome");
    if (ref) acc.rawRefs.push(ref);
  }
}

/** 将 accumulator 转换为统一 SessionRecord */
export function toSessionRecord(acc: SessionAccumulator): SessionRecord {
  const total =
    acc.inputTokens + acc.outputTokens + acc.cacheReadTokens + acc.cacheWriteTokens;

  return {
    tool: "claude-code",
    sessionId: acc.sessionId,
    timestamp: acc.timestamp ?? new Date().toISOString(),
    timestampEnd: acc.timestampEnd,
    projectPath: acc.projectPath,
    model: acc.model,
    messageCount: acc.messageCount,
    firstPrompt: acc.firstPrompt,
    summary: acc.summary,
    goal: acc.goal,
    outcome: acc.outcome,
    toolUsage:
      Object.keys(acc.toolUsage).length > 0 ? acc.toolUsage : undefined,
    tokenBreakdown: {
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens,
      total,
    },
    messages: acc.messages,
    rawRefs: acc.rawRefs,
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
