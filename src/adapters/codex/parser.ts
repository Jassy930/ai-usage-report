/** Codex JSONL 解析器 — 适配真实 ~/.codex/ 数据格式 */

import { join, resolve } from "node:path";
import type { RawRef, SessionMessage, SessionRecord, TokenBreakdown } from "../../core/types";
import type {
  CodexRawEvent,
  CodexSessionMetaPayload,
  CodexTokenCountPayload,
  CodexMessagePayload,
  CodexHistoryEntry,
} from "./types";

interface ParsedSession {
  sessionId: string;
  model?: string;
  projectPath?: string;
  gitRemote?: string;
  timestampStart?: string;
  timestampEnd?: string;
  messageCount: number;
  tokenBreakdown: TokenBreakdown;
  messages: SessionMessage[];
  rawRefs: RawRef[];
  firstPromptRefs: RawRef[];
}

function isSessionMeta(p: unknown): p is CodexSessionMetaPayload {
  return typeof p === "object" && p !== null && "id" in p && "cwd" in p;
}

function isTokenCount(p: unknown): p is CodexTokenCountPayload {
  return typeof p === "object" && p !== null && "type" in p && (p as { type?: string }).type === "token_count" && "info" in p;
}

function isMessagePayload(p: unknown): p is CodexMessagePayload {
  return typeof p === "object" && p !== null && "type" in p && "message" in p;
}

function toRawRef(
  sessionId: string,
  filePath: string,
  line: number,
  sourceType: string,
): RawRef {
  return {
    tool: "codex",
    sourceType,
    filePath,
    line,
    sessionId,
  };
}

/**
 * 解析单个 JSONL 会话文件
 *
 * 真实格式：每行 { timestamp, type, payload }
 * - session_meta → payload.id, payload.cwd, payload.git
 * - event_msg + payload.type=token_count → payload.info.total_token_usage
 * - event_msg + payload.type=agent_message/user_message → 消息计数
 */
export async function parseSessionFile(
  filePath: string,
): Promise<ParsedSession> {
  const result: ParsedSession = {
    sessionId: "",
    messageCount: 0,
    tokenBreakdown: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      total: 0,
    },
    messages: [],
    rawRefs: [],
    firstPromptRefs: [],
  };

  const text = await Bun.file(filePath).text();

  // 记录最后一次 token_count 快照（取最终值而非累加）
  let lastTokenUsage: CodexTokenCountPayload["info"] = null;

  for (const [index, line] of text.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let raw: CodexRawEvent;
    try {
      raw = {
        ...(JSON.parse(trimmed) as CodexRawEvent),
        __source: { filePath, line: index + 1 },
      };
    } catch {
      continue;
    }

    const { type, payload } = raw;
    if (!result.timestampStart || raw.timestamp < result.timestampStart) {
      result.timestampStart = raw.timestamp;
    }
    if (!result.timestampEnd || raw.timestamp > result.timestampEnd) {
      result.timestampEnd = raw.timestamp;
    }

    if (type === "session_meta" && isSessionMeta(payload)) {
      result.sessionId = payload.id;
      result.projectPath = payload.cwd;
      if (payload.git?.remote_url) {
        result.gitRemote = payload.git.remote_url;
      }
      if (raw.__source) {
        result.rawRefs.push(toRawRef(payload.id, raw.__source.filePath, raw.__source.line, "session_jsonl"));
      }
    } else if (type === "event_msg") {
      const ptype = (payload as { type?: string }).type;

      if (ptype === "token_count" && isTokenCount(payload)) {
        if (payload.info) {
          lastTokenUsage = payload.info;
        }
        if (raw.__source && result.sessionId) {
          result.messages.push({
            role: "system",
            kind: "event",
            timestamp: raw.timestamp,
            text: "token_count",
            toolCalls: [],
            rawRefs: [toRawRef(result.sessionId, raw.__source.filePath, raw.__source.line, "session_jsonl")],
          });
        }
      } else if ((ptype === "agent_message" || ptype === "user_message") && isMessagePayload(payload)) {
        result.messageCount++;
        if (raw.__source) {
          result.messages.push({
            role: ptype === "user_message" ? "user" : "assistant",
            kind: "message",
            timestamp: raw.timestamp,
            text: payload.message,
            toolCalls: [],
            rawRefs: [toRawRef(result.sessionId || "unknown", raw.__source.filePath, raw.__source.line, "session_jsonl")],
          });
        }
      } else if (ptype && raw.__source) {
        result.messages.push({
          role: "system",
          kind: "event",
          timestamp: raw.timestamp,
          text: ptype,
          toolCalls: [],
          rawRefs: [toRawRef(result.sessionId || "unknown", raw.__source.filePath, raw.__source.line, "session_jsonl")],
        });
      }
    }
  }

  // 使用最终 token 快照
  if (lastTokenUsage) {
    const u = lastTokenUsage.total_token_usage;
    result.tokenBreakdown.inputTokens = u.input_tokens;
    result.tokenBreakdown.outputTokens = u.output_tokens;
    result.tokenBreakdown.cacheReadTokens = u.cached_input_tokens;
    result.tokenBreakdown.total = u.total_tokens;
  }

  return result;
}

/**
 * 从 history.jsonl 加载 prompt 映射表
 *
 * 真实格式：{ session_id, ts, text }
 */
export async function loadHistoryPrompts(
  codexDir: string,
): Promise<Map<string, { text: string; refs: RawRef[] }>> {
  const map = new Map<string, { text: string; refs: RawRef[] }>();
  const historyPath = resolve(join(codexDir, "history.jsonl"));

  let text: string;
  try {
    text = await Bun.file(historyPath).text();
  } catch {
    return map;
  }

  for (const [index, line] of text.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = {
        ...(JSON.parse(trimmed) as CodexHistoryEntry),
        __source: {
          filePath: historyPath,
          line: index + 1,
        },
      };
      if (entry.session_id && entry.text) {
        map.set(entry.session_id, {
          text: entry.text,
          refs: [{
            tool: "codex",
            sourceType: "history_jsonl",
            filePath: historyPath,
            line: index + 1,
            sessionId: entry.session_id,
          }],
        });
      }
    } catch {
      continue;
    }
  }

  return map;
}

/**
 * 将解析结果与日期、prompt 合并为 SessionRecord
 */
export function toSessionRecord(
  parsed: ParsedSession,
  date: string,
  firstPrompt?: { text: string; refs: RawRef[] },
): SessionRecord {
  return {
    tool: "codex",
    sessionId: parsed.sessionId,
    timestamp: date,
    timestampEnd: parsed.timestampEnd,
    projectPath: parsed.projectPath,
    gitRemote: parsed.gitRemote,
    model: parsed.model,
    messageCount: parsed.messageCount,
    firstPrompt: firstPrompt?.text,
    tokenBreakdown: parsed.tokenBreakdown,
    messages: parsed.messages,
    rawRefs: [...parsed.rawRefs, ...(firstPrompt?.refs ?? []), ...parsed.firstPromptRefs],
  };
}
