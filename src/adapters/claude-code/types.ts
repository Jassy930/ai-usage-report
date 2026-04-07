/** Claude Code 数据类型定义 — 匹配真实 ~/.claude/ 格式 */

/** usage-data/facets/{id}.json — session 评价/分析 */
export interface FacetEntry {
  session_id: string;
  underlying_goal?: string;
  outcome?: string;
  brief_summary?: string;
  session_type?: string;
  goal_categories?: Record<string, number>;
  __source?: {
    filePath: string;
  };
}

/** usage-data/session-meta/{id}.json — 核心 session 元数据 */
export interface SessionMeta {
  session_id: string;
  project_path?: string;
  start_time?: string;
  duration_minutes?: number;
  user_message_count?: number;
  assistant_message_count?: number;
  tool_counts?: Record<string, number>;
  input_tokens?: number;
  output_tokens?: number;
  first_prompt?: string;
  languages?: Record<string, number>;
  git_commits?: number;
  __source?: {
    filePath: string;
  };
}

/** JSONL 中 assistant message 的 usage 字段 */
export interface MessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  server_tool_use?: Record<string, number>;
}

/** JSONL 中 content block 类型 */
export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
}

/** JSONL 行 — 真实格式 */
export interface JournalLine {
  type: "user" | "assistant" | "system" | "file-history-snapshot" | string;
  sessionId: string;
  timestamp: string;
  uuid?: string;
  cwd?: string;
  message?: {
    role?: string;
    model?: string;
    content?: string | ContentBlock[];
    usage?: MessageUsage;
  };
  __source?: {
    filePath: string;
    line: number;
  };
}

/** 中间合并数据结构 */
export interface SessionAccumulator {
  sessionId: string;
  model?: string;
  projectPath?: string;
  timestamp?: string;
  timestampEnd?: string;
  messageCount: number;
  firstPrompt?: string;
  summary?: string;
  goal?: string;
  outcome?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  toolUsage: Record<string, number>;
  messages: import("../../core/types").SessionMessage[];
  rawRefs: import("../../core/types").RawRef[];
  hasJsonlData: boolean;
  hasMetaData: boolean;
}
