/** Codex JSONL 事件类型定义 — 匹配真实 ~/.codex/sessions/ 格式 */

/** 顶层事件包裹 */
export interface CodexRawEvent {
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
  __source?: {
    filePath: string;
    line: number;
  };
}

/** session_meta payload */
export interface CodexSessionMetaPayload {
  id: string;
  timestamp: string;
  cwd: string;
  model_provider?: string;
  cli_version?: string;
  git?: { remote_url?: string };
}

/** token usage 快照（total_token_usage / last_token_usage 共用结构） */
export interface CodexTokenUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
  total_tokens: number;
}

/** event_msg payload: token_count */
export interface CodexTokenCountPayload {
  type: "token_count";
  info: {
    total_token_usage: CodexTokenUsage;
    /** 本次请求的增量用量（新版 Codex 提供） */
    last_token_usage?: CodexTokenUsage;
  } | null;
}

/** event_msg payload: agent_message / user_message */
export interface CodexMessagePayload {
  type: "agent_message" | "user_message";
  message: string;
  phase?: string;
}

/** history.jsonl 条目 */
export interface CodexHistoryEntry {
  session_id: string;
  ts: number;
  text: string;
  __source?: {
    filePath: string;
    line: number;
  };
}
