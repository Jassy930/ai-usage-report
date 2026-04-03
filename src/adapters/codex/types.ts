/** Codex JSONL 事件类型定义 — 匹配真实 ~/.codex/sessions/ 格式 */

/** 顶层事件包裹 */
export interface CodexRawEvent {
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
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

/** event_msg payload: token_count */
export interface CodexTokenCountPayload {
  type: "token_count";
  info: {
    total_token_usage: {
      input_tokens: number;
      cached_input_tokens: number;
      output_tokens: number;
      reasoning_output_tokens?: number;
      total_tokens: number;
    };
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
}
