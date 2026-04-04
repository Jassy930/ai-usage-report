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

/** 统一会话记录 — 所有采集器输出的标准格式 */
export interface SessionRecord {
  tool: ToolType;
  sessionId: string;
  timestamp: string;
  projectPath?: string;
  gitRemote?: string;
  model?: string;
  messageCount: number;
  firstPrompt?: string;
  summary?: string;
  goal?: string;
  conclusion?: string;
  toolUsage?: Record<string, number>;
  tokenBreakdown: TokenBreakdown;
}

/** 会话过滤选项 */
export interface FilterOptions {
  since?: Date;
  tool?: ToolType;
  project?: string;
  model?: string;
}
