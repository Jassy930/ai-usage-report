/** Codex JSONL 解析器 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { SessionRecord, TokenBreakdown } from "../../core/types";
import type {
  CodexEvent,
  CodexHistoryEntry,
  CodexSessionMeta,
  CodexEventMsg,
} from "./types";

interface ParsedSession {
  sessionId: string;
  model?: string;
  projectPath?: string;
  messageCount: number;
  tokenBreakdown: TokenBreakdown;
}

/**
 * 流式解析单个 JSONL 会话文件
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

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: CodexEvent;
    try {
      event = JSON.parse(trimmed) as CodexEvent;
    } catch {
      continue;
    }

    switch (event.type) {
      case "session_meta": {
        const meta = event as CodexSessionMeta;
        result.sessionId = meta.session_id;
        result.model = meta.model;
        result.projectPath = meta.cwd;
        break;
      }
      case "event_msg": {
        const msg = event as CodexEventMsg;
        result.messageCount++;
        if (msg.token_count) {
          result.tokenBreakdown.inputTokens += msg.token_count.input_tokens;
          result.tokenBreakdown.outputTokens += msg.token_count.output_tokens;
          result.tokenBreakdown.cacheReadTokens +=
            msg.token_count.cached_input_tokens;
        }
        break;
      }
      // turn_context 等其他类型暂时忽略
    }
  }

  result.tokenBreakdown.total =
    result.tokenBreakdown.inputTokens + result.tokenBreakdown.outputTokens;

  return result;
}

/**
 * 从 history.jsonl 加载 prompt 映射表
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
        if (entry.session_id && entry.prompt) {
          map.set(entry.session_id, entry.prompt);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // 文件不存在或读取失败，返回空 map
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
    model: parsed.model,
    messageCount: parsed.messageCount,
    firstPrompt,
    tokenBreakdown: parsed.tokenBreakdown,
  };
}
