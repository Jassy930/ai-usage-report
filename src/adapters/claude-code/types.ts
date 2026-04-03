/** Claude Code 数据类型定义 */

/** usage-data/facets/*.json 中的会话摘要 */
export interface FacetEntry {
  sessionId: string;
  date: string;
  model: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** usage-data/session-meta/*.json 中的会话元数据 */
export interface SessionMeta {
  sessionId: string;
  projectPath?: string;
  summary?: string;
  goal?: string;
  conclusion?: string;
  firstPrompt?: string;
}

/** JSONL 中 assistant message 的 usage 字段 */
export interface MessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

/** JSONL 中 content block 类型 */
export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
}

/** JSONL 行的消息结构 */
export interface JournalMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  usage?: MessageUsage;
}

/** JSONL 行 */
export interface JournalLine {
  type: "human" | "assistant";
  message: JournalMessage;
  timestamp: string;
  sessionId: string;
}

/** 中间合并数据结构 */
export interface SessionAccumulator {
  sessionId: string;
  model?: string;
  projectPath?: string;
  timestamp?: string;
  messageCount: number;
  firstPrompt?: string;
  summary?: string;
  goal?: string;
  conclusion?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  toolUsage: Record<string, number>;
  hasJsonlData: boolean;
}
