/** Codex JSONL 解析器 — 适配真实 ~/.codex/ 数据格式 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
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

/**
 * 流式解析单个 JSONL 会话文件
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

  const rl = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  // 记录最后一次 token_count 快照（取最终值而非累加）
  let lastTokenUsage: CodexTokenCountPayload["info"] = null;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let raw: CodexRawEvent;
    try {
      raw = JSON.parse(trimmed) as CodexRawEvent;
    } catch {
      continue;
    }

    const { type, payload } = raw;

    if (type === "session_meta") {
      const meta = payload as unknown as CodexSessionMetaPayload;
      result.sessionId = meta.id;
      result.projectPath = meta.cwd;
      if (meta.git?.remote_url) {
        result.gitRemote = meta.git.remote_url;
      }
    } else if (type === "event_msg") {
      const ptype = (payload as { type?: string }).type;

      if (ptype === "token_count") {
        const tc = payload as unknown as CodexTokenCountPayload;
        if (tc.info) {
          lastTokenUsage = tc.info;
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
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const historyPath = join(codexDir, "history.jsonl");

  let rl;
  try {
    rl = createInterface({
      input: createReadStream(historyPath, "utf-8"),
      crlfDelay: Infinity,
    });
  } catch {
    return map;
  }

  try {
    for await (const line of rl) {
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
  } catch {
    // 文件不存在或读取失败
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
