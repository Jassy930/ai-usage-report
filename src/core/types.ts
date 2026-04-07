/**
 * 统一会话记录类型定义
 */

/** 支持的 AI 工具类型 */
export type ToolType = "codex" | "claude-code";

/** Token 使用量明细 */
export interface TokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** 所有 token 类别之和: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens */
  total: number;
}

/** 原始数据引用 */
export interface RawRef {
  tool: ToolType;
  sourceType: string;
  filePath: string;
  sessionId: string;
  line?: number;
  jsonPointer?: string;
}

/** 统一的消息级 token usage */
export interface SessionUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** 统一工具调用 */
export interface SessionToolCall {
  name: string;
  id?: string;
}

/** 统一消息结构 */
export interface SessionMessage {
  role: string;
  kind: "message" | "event";
  timestamp: string;
  text?: string;
  toolCalls: SessionToolCall[];
  usage?: SessionUsage;
  rawRefs: RawRef[];
}

/** 统一会话记录 — 所有采集器输出的标准格式 */
export interface SessionRecord {
  tool: ToolType;
  sessionId: string;
  timestamp: string;
  timestampEnd?: string;
  projectPath?: string;
  gitRemote?: string;
  model?: string;
  messageCount: number;
  firstPrompt?: string;
  summary?: string;
  goal?: string;
  outcome?: string;
  conclusion?: string;
  toolUsage?: Record<string, number>;
  tokenBreakdown: TokenBreakdown;
  messages: SessionMessage[];
  rawRefs: RawRef[];
}

/** 会话过滤选项 */
export interface FilterOptions {
  since?: Date;
  until?: Date;
  tool?: ToolType;
  project?: string;
  model?: string;
}
