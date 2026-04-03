/** Codex JSONL 事件类型定义 */

export interface CodexSessionMeta {
  type: "session_meta";
  session_id: string;
  model: string;
  cwd: string;
}

export interface CodexTurnContext {
  type: "turn_context";
  session_id: string;
  turn_id: string;
}

export interface CodexTokenCount {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
}

export interface CodexEventMsg {
  type: "event_msg";
  session_id: string;
  message: {
    role: "user" | "assistant";
    content: Array<{ type: string; text: string }>;
  };
  token_count?: CodexTokenCount;
}

export type CodexEvent = CodexSessionMeta | CodexTurnContext | CodexEventMsg;

export interface CodexHistoryEntry {
  session_id: string;
  prompt: string;
  timestamp: string;
}
