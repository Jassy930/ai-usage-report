/** Codex JSONL 解析器 — 适配真实 ~/.codex/ 数据格式 */

import { join } from "node:path";
import type { SessionRecord, TokenBreakdown } from "../../core/types";
import type {
  CodexRawEvent,
  CodexSessionMetaPayload,
  CodexTokenCountPayload,
  CodexHistoryEntry,
} from "./types";

interface ParsedSession {
  sessionId: string;
  model?: string;
  projectPath?: string;
  gitRemote?: string;
  messageCount: number;
  tokenBreakdown: TokenBreakdown;
}

function isSessionMeta(p: unknown): p is CodexSessionMetaPayload {
  return typeof p === "object" && p !== null && "id" in p && "cwd" in p;
}

function isTokenCount(p: unknown): p is CodexTokenCountPayload {
  return typeof p === "object" && p !== null && "type" in p && (p as { type?: string }).type === "token_count" && "info" in p;
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
  };

  const text = await Bun.file(filePath).text();

  // 记录最后一次 token_count 快照（取最终值而非累加）
  let lastTokenUsage: CodexTokenCountPayload["info"] = null;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let raw: CodexRawEvent;
    try {
      raw = JSON.parse(trimmed) as CodexRawEvent;
    } catch {
      continue;
    }

    const { type, payload } = raw;

    if (type === "session_meta" && isSessionMeta(payload)) {
      result.sessionId = payload.id;
      result.projectPath = payload.cwd;
      if (payload.git?.remote_url) {
        result.gitRemote = payload.git.remote_url;
      }
    } else if (type === "event_msg") {
      const ptype = (payload as { type?: string }).type;

      if (ptype === "token_count" && isTokenCount(payload)) {
        if (payload.info) {
          lastTokenUsage = payload.info;
        }
      } else if (ptype === "agent_message" || ptype === "user_message") {
        result.messageCount++;
      }
    }
  }

  // 使用最终 token 快照
  if (lastTokenUsage) {
    const u = lastTokenUsage.total_token_usage;
    result.tokenBreakdown.inputTokens = u.input_tokens;
    result.tokenBreakdown.outputTokens = u.output_tokens;
    result.tokenBreakdown.cacheReadTokens = u.cached_input_tokens;
    result.tokenBreakdown.total = u.input_tokens + u.output_tokens + u.cached_input_tokens;
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
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const historyPath = join(codexDir, "history.jsonl");

  let text: string;
  try {
    text = await Bun.file(historyPath).text();
  } catch {
    return map;
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as CodexHistoryEntry;
      if (entry.session_id && entry.text) {
        map.set(entry.session_id, entry.text);
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
  firstPrompt?: string,
): SessionRecord {
  return {
    tool: "codex",
    sessionId: parsed.sessionId,
    timestamp: date,
    projectPath: parsed.projectPath,
    gitRemote: parsed.gitRemote,
    model: parsed.model,
    messageCount: parsed.messageCount,
    firstPrompt,
    tokenBreakdown: parsed.tokenBreakdown,
  };
}
